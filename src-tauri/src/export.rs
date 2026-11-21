//! Export to HTML and PDF. The webview builds one self-contained HTML page; this module embeds the document's local
//! images in it, writes it as an `.html` file, or prints it to a `.pdf` file with WebView2 (Windows only).

use crate::asset::Allowed;
use crate::images;
use crate::save::write_atomic;
use std::path::Path;

/// The labels of the hidden windows that print a PDF start with this.
pub const WINDOW_PREFIX: &str = "export-";
/// The names of the pages they print, in the temp folder, start with this.
pub const PAGE_PREFIX: &str = "octavo-export-";

const BASE64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// `bytes` in standard Base64, padded with `=`.
fn base64(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let n = chunk
            .iter()
            .enumerate()
            .fold(0u32, |n, (i, b)| n | (*b as u32) << (16 - 8 * i));
        for i in 0..4 {
            out.push(if i <= chunk.len() {
                BASE64[(n >> (18 - 6 * i) & 63) as usize] as char
            } else {
                '='
            });
        }
    }
    out
}

/// The image at `path` as a `data:` URI, for a page that carries its images. Only images the webview may already
/// load are read, as the `asset` protocol decides.
pub fn image_data(allowed: &Allowed, path: &Path) -> Result<String, String> {
    if !allowed.readable(path) {
        return Err(format!(
            "{}: Octavo isn't allowed to read this image.",
            path.display()
        ));
    }
    let kind = images::content_type(path).unwrap_or("application/octet-stream");
    let bytes = std::fs::read(path).map_err(|e| format!("{}: {e}", path.display()))?;
    Ok(format!("data:{kind};base64,{}", base64(&bytes)))
}

/// Refuses a path whose name doesn't end in `.<extension>`, so the export can't write other kinds of file.
fn named(path: &Path, extension: &str) -> Result<(), String> {
    match path.extension() {
        Some(e) if e.eq_ignore_ascii_case(extension) => Ok(()),
        _ => Err(format!("The exported file's name ends in .{extension}.")),
    }
}

/// Writes the exported page to the `.html` file at `path`, replacing it whole.
pub fn write_html(path: &Path, html: &str) -> Result<(), String> {
    named(path, "html")?;
    write_atomic(path, html.as_bytes()).map_err(|e| format!("{}: {e}", path.display()))
}

/// Prints the exported page to the `.pdf` file at `path`.
pub async fn write_pdf<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    path: &Path,
    html: &str,
) -> Result<(), String> {
    named(path, "pdf")?;
    pdf::print(app, path, html).await
}

#[cfg(windows)]
mod pdf {
    use std::path::Path;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::mpsc;
    use std::time::Duration;
    use tauri::webview::PageLoadEvent;
    use tauri::{WebviewUrl, WebviewWindow, WebviewWindowBuilder};
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT, ICoreWebView2_7, ICoreWebView2Environment6,
    };
    use webview2_com::{ExecuteScriptCompletedHandler, PrintToPdfCompletedHandler};
    use windows_core::{HSTRING, Interface};

    /// A4 in inches, and 20 mm margins. The page's own `@page` rule gives the same, so either one decides alike.
    const PAGE: (f64, f64) = (210.0 / 25.4, 297.0 / 25.4);
    const MARGIN: f64 = 20.0 / 25.4;
    const LOAD_TIMEOUT: Duration = Duration::from_secs(30);
    const PRINT_TIMEOUT: Duration = Duration::from_secs(120);

    static COUNT: AtomicU32 = AtomicU32::new(0);

    /// Waits for one message on `rx` off the async runtime's threads.
    async fn wait<T: Send + 'static>(
        rx: mpsc::Receiver<T>,
        timeout: Duration,
        what: &str,
    ) -> Result<T, String> {
        let what = what.to_string();
        tauri::async_runtime::spawn_blocking(move || {
            rx.recv_timeout(timeout)
                .map_err(|_| format!("The PDF couldn't be made: {what} took too long."))
        })
        .await
        .map_err(|e| e.to_string())?
    }

    /// Runs `f` with the window's WebView2 on the main thread and waits for the result it sends.
    async fn on_webview<R: tauri::Runtime, T: Send + 'static>(
        window: &WebviewWindow<R>,
        timeout: Duration,
        what: &str,
        f: impl FnOnce(
            tauri::webview::PlatformWebview,
            mpsc::Sender<Result<T, String>>,
        ) -> windows_core::Result<()>
        + Send
        + 'static,
    ) -> Result<T, String> {
        let (tx, rx) = mpsc::channel();
        let failed = tx.clone();
        window
            .with_webview(move |webview| {
                if let Err(e) = f(webview, tx) {
                    let _ = failed.send(Err(e.message()));
                }
            })
            .map_err(|e| e.to_string())?;
        wait(rx, timeout, what).await?
    }

    /// Prints `html` to `path` from a hidden window, once the page has loaded and its fonts are ready.
    pub async fn print<R: tauri::Runtime>(
        app: &tauri::AppHandle<R>,
        path: &Path,
        html: &str,
    ) -> Result<(), String> {
        let n = COUNT.fetch_add(1, Ordering::Relaxed);
        let source = std::env::temp_dir().join(format!(
            "{}{}-{n}.html",
            super::PAGE_PREFIX,
            std::process::id()
        ));
        std::fs::write(&source, html).map_err(|e| format!("{}: {e}", source.display()))?;
        let result = print_file(app, &source, path, n).await;
        let _ = std::fs::remove_file(&source);
        result
    }

    async fn print_file<R: tauri::Runtime>(
        app: &tauri::AppHandle<R>,
        source: &Path,
        path: &Path,
        n: u32,
    ) -> Result<(), String> {
        let url = tauri::Url::from_file_path(source)
            .map_err(|_| format!("{}: not a full path", source.display()))?;
        let (loaded, on_load) = mpsc::channel();
        let window = WebviewWindowBuilder::new(
            app,
            format!("{}{n}", super::WINDOW_PREFIX),
            WebviewUrl::External(url),
        )
        .visible(false)
        .on_page_load(move |_, payload| {
            if payload.event() == PageLoadEvent::Finished {
                let _ = loaded.send(());
            }
        })
        .build()
        .map_err(|e| e.to_string())?;
        let result = async {
            wait(on_load, LOAD_TIMEOUT, "loading the page").await?;
            // The window stays hidden, but its page draws as if shown, so nothing in it waits for that.
            on_webview(
                &window,
                LOAD_TIMEOUT,
                "showing the page",
                |webview, tx| unsafe {
                    webview.controller().SetIsVisible(true)?;
                    let _ = tx.send(Ok(()));
                    Ok(())
                },
            )
            .await?;
            fonts_ready(&window).await?;
            to_pdf(&window, path).await
        }
        .await;
        let _ = window.destroy();
        result
    }

    /// Waits until the page's fonts have loaded: the embedded formula fonts load only once text uses them.
    async fn fonts_ready<R: tauri::Runtime>(window: &WebviewWindow<R>) -> Result<(), String> {
        for _ in 0..200 {
            let status = on_webview(
                window,
                LOAD_TIMEOUT,
                "loading the fonts",
                |webview, tx| unsafe {
                    let handler =
                        ExecuteScriptCompletedHandler::create(Box::new(move |_, result| {
                            let _ = tx.send(Ok(result));
                            Ok(())
                        }));
                    webview
                        .controller()
                        .CoreWebView2()?
                        .ExecuteScript(&HSTRING::from("document.fonts.status"), &handler)
                },
            )
            .await?;
            if status == "\"loaded\"" {
                return Ok(());
            }
            let pause = || std::thread::sleep(Duration::from_millis(25));
            let _ = tauri::async_runtime::spawn_blocking(pause).await;
        }
        Err("The PDF couldn't be made: loading the fonts took too long.".into())
    }

    async fn to_pdf<R: tauri::Runtime>(
        window: &WebviewWindow<R>,
        path: &Path,
    ) -> Result<(), String> {
        let target = HSTRING::from(path.as_os_str());
        let printed = on_webview(
            window,
            PRINT_TIMEOUT,
            "printing",
            move |webview, tx| unsafe {
                let settings = webview
                    .environment()
                    .cast::<ICoreWebView2Environment6>()?
                    .CreatePrintSettings()?;
                settings.SetOrientation(COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT)?;
                settings.SetPageWidth(PAGE.0)?;
                settings.SetPageHeight(PAGE.1)?;
                settings.SetMarginTop(MARGIN)?;
                settings.SetMarginBottom(MARGIN)?;
                settings.SetMarginLeft(MARGIN)?;
                settings.SetMarginRight(MARGIN)?;
                settings.SetScaleFactor(1.0)?;
                settings.SetShouldPrintBackgrounds(true)?;
                // The page number comes from the page's own `@page` rule; WebView2's header and footer would add the date and title.
                settings.SetShouldPrintHeaderAndFooter(false)?;
                let handler = PrintToPdfCompletedHandler::create(Box::new(move |result, ok| {
                    let _ = tx.send(Ok(result.is_ok() && ok));
                    Ok(())
                }));
                webview
                    .controller()
                    .CoreWebView2()?
                    .cast::<ICoreWebView2_7>()?
                    .PrintToPdf(&target, &settings, &handler)
            },
        )
        .await?;
        if printed {
            Ok(())
        } else {
            Err(format!("{}: the PDF couldn't be written.", path.display()))
        }
    }
}

#[cfg(not(windows))]
mod pdf {
    pub async fn print<R: tauri::Runtime>(
        _: &tauri::AppHandle<R>,
        _: &std::path::Path,
        _: &str,
    ) -> Result<(), String> {
        Err("Export to PDF works on Windows only.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_matches_the_standard_alphabet_and_padding() {
        for (bytes, text) in [
            (&b""[..], ""),
            (b"f", "Zg=="),
            (b"fo", "Zm8="),
            (b"foo", "Zm9v"),
            (b"foob", "Zm9vYg=="),
            (b"fooba", "Zm9vYmE="),
            (b"foobar", "Zm9vYmFy"),
            (&[0xFB, 0xFF, 0xBF], "+/+/"),
            (&[0, 0, 0], "AAAA"),
        ] {
            assert_eq!(base64(bytes), text, "{bytes:?}");
        }
    }

    fn dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("octavo-export-{name}-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn only_html_paths_are_written() {
        let dir = dir("html");
        for name in ["page.htm", "page.pdf", "page", "notes.md"] {
            assert!(write_html(&dir.join(name), "<p>x</p>").is_err(), "{name}");
            assert!(!dir.join(name).exists(), "{name}");
        }
        let file = dir.join("Page.HTML");
        write_html(&file, "<p>ş</p>").unwrap();
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "<p>ş</p>");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn an_image_is_read_only_when_the_webview_may_load_it() {
        let dir = std::path::absolute(dir("image")).unwrap();
        let file = dir.join("dot.png");
        std::fs::write(&file, [1, 2, 3]).unwrap();
        let allowed = Allowed::default();
        assert!(image_data(&allowed, &file).is_err());
        allowed.add(&dir);
        assert_eq!(
            image_data(&allowed, &file).unwrap(),
            "data:image/png;base64,AQID"
        );
        let text = dir.join("notes.txt");
        std::fs::write(&text, "x").unwrap();
        assert!(image_data(&allowed, &text).is_err());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
