mod asset;
mod backup;
mod gate;
mod images;
mod notes;
mod save;
mod scan;
mod watch;
mod workspaces;

use std::path::Path;
use std::time::Duration;
use tauri::{Emitter, Manager};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_window_state::StateFlags;

#[derive(serde::Serialize)]
struct Doc {
    path: String,
    text: String,
}

/// A document's text, or None for a file that isn't UTF-8 text: another encoding, or binary. A NUL byte
/// never appears in text, and marks UTF-16 and binary files that happen to be valid UTF-8.
fn document_text(bytes: Vec<u8>) -> Option<String> {
    if bytes.contains(&0) {
        return None;
    }
    String::from_utf8(bytes).ok()
}

/// The text of the document at `path`, with a message that says why when it can't be read.
fn read_document(path: &Path) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("{}: {e}", path.display()))?;
    document_text(bytes).ok_or_else(|| {
        format!(
            "{} can't be opened: Octavo opens UTF-8 text files, and this file isn't one.",
            path.display()
        )
    })
}

/// Reads a document and lets the webview load images from its folder.
#[tauri::command]
fn open_doc(allowed: tauri::State<asset::Allowed>, path: String) -> Result<Doc, String> {
    let path = std::path::absolute(&path).map_err(|e| e.to_string())?;
    let text = read_document(&path)?;
    if let Some(dir) = path.parent() {
        allowed.add(dir);
    }
    Ok(Doc {
        path: path.to_string_lossy().into_owned(),
        text,
    })
}

/// Lets the webview load these image files, for images a document references outside its own folder.
/// Only absolute image paths are allowed; other paths are ignored.
#[tauri::command]
fn allow_images(allowed: tauri::State<asset::Allowed>, paths: Vec<String>) {
    for path in images::image_files(&paths) {
        allowed.add(&path);
    }
}

/// Saves a pasted image as a new file in the image folder of the document in `dir`; returns its full path.
#[tauri::command]
fn save_image(dir: String, name: String, bytes: Vec<u8>) -> Result<String, String> {
    let dir = std::path::absolute(&dir).map_err(|e| e.to_string())?;
    // Limitation: bytes arrive as a JSON array; switch to a raw IPC body if large pastes feel slow
    images::save_new(&images::image_dir(&dir), &name, &bytes)
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| format!("{name}: {e}"))
}

/// The image files a document in `dir` links for `paths`: files inside its repository as they are, others
/// copied into its image folder. The webview may load each of them.
#[tauri::command]
fn place_images(
    allowed: tauri::State<asset::Allowed>,
    dir: String,
    paths: Vec<String>,
) -> Result<Vec<String>, String> {
    let dir = std::path::absolute(&dir).map_err(|e| e.to_string())?;
    paths
        .iter()
        .map(|path| {
            let file = std::path::absolute(path).map_err(|e| e.to_string())?;
            let placed = images::place(&dir, &file).map_err(|e| format!("{path}: {e}"))?;
            allowed.add(&placed);
            Ok(placed.to_string_lossy().into_owned())
        })
        .collect()
}

/// Writes a document. With `expected`, the file must still hold exactly that text, or nothing is
/// written. Returns whether the file was written; a file that already holds `text` is left untouched.
/// With `backup`, the first time a session replaces a file, its previous contents are copied to the
/// backups folder.
#[tauri::command]
fn save_doc(
    backups: tauri::State<backup::Backups>,
    path: String,
    text: String,
    expected: Option<String>,
    backup: bool,
) -> Result<bool, String> {
    let path = std::path::absolute(&path).map_err(|e| e.to_string())?;
    save::save(&path, &text, expected.as_deref(), |original| {
        if backup {
            backups.keep(&path, original)
        } else {
            Ok(())
        }
    })
    .map_err(|e| e.to_string())
}

/// Opens the backups folder in the file manager.
#[tauri::command]
fn open_backups(
    app: tauri::AppHandle,
    backups: tauri::State<backup::Backups>,
) -> Result<(), String> {
    std::fs::create_dir_all(&backups.dir).map_err(|e| e.to_string())?;
    app.opener()
        .open_path(backups.dir.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}

/// Writes `version`'s release notes to the What's new folder in the app's data folder; returns the file's path.
#[tauri::command]
fn write_notes(app: tauri::AppHandle, version: String, text: String) -> Result<String, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("whats-new");
    notes::write(&dir, &version, &text)
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}

/// Writes the open-source licenses document to the licenses folder in the app's data folder; returns the file's path.
#[tauri::command]
fn write_licenses(app: tauri::AppHandle, text: String) -> Result<String, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("licenses");
    notes::write_licenses(&dir, &text)
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}

/// The Markdown files under the folder at `path`, read off the main thread so that a large folder can't freeze the
/// window.
#[tauri::command]
async fn scan_folder(path: String, show_hidden: bool) -> Result<scan::Scan, String> {
    let path = std::path::absolute(&path).map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || scan::scan(&path, show_hidden))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

fn workspaces_file(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("workspaces.json"))
}

/// The saved workspaces.
#[tauri::command]
fn load_workspaces(app: tauri::AppHandle) -> Result<workspaces::Loaded, String> {
    workspaces::load(&workspaces_file(&app)?).map_err(|e| e.to_string())
}

/// Saves `workspaces`, in place of those saved before.
#[tauri::command]
fn save_workspaces(
    app: tauri::AppHandle,
    workspaces: Vec<workspaces::Workspace>,
) -> Result<Option<workspaces::Problem>, String> {
    workspaces::save(&workspaces_file(&app)?, &workspaces).map_err(|e| e.to_string())
}

/// File passed on the command line, e.g. by a double-click in Explorer.
// Limitation: macOS delivers opened files as RunEvent::Opened, not argv; handle when testing on macOS
fn file_arg(args: &[String], cwd: &Path) -> Option<String> {
    args.iter()
        .skip(1)
        .find(|a| !a.starts_with('-'))
        .map(|a| cwd.join(a).to_string_lossy().into_owned())
}

/// Watches these documents; each change on disk emits `doc-changed` with the document's path.
#[tauri::command]
fn watch_docs(
    app: tauri::AppHandle,
    watcher: tauri::State<watch::DocWatcher>,
    paths: Vec<String>,
) -> Result<(), String> {
    watcher.set(paths, move |path| {
        let _ = app.emit("doc-changed", path);
    })
}

#[tauri::command]
fn initial_file() -> Option<String> {
    let args: Vec<String> = std::env::args().collect();
    file_arg(&args, &std::env::current_dir().ok()?)
}

/// What the window keeps between launches: its size, position and whether it was maximized. Not whether
/// it is shown, since the webview shows it after its first render, and not full screen.
fn window_state_flags() -> StateFlags {
    StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Registered first: a second launch hands its file to the running window and exits.
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            if let Some(path) = file_arg(&args, Path::new(&cwd)) {
                let _ = app.emit("open-file", path);
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(gate::plugin())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(window_state_flags())
                .build(),
        )
        .manage(watch::DocWatcher::default())
        .manage(asset::Allowed::default())
        .register_asynchronous_uri_scheme_protocol("asset", |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            tauri::async_runtime::spawn_blocking(move || {
                let allowed = app.state::<asset::Allowed>();
                responder.respond(asset::respond(&allowed, request.uri().path()));
            });
        })
        // The window starts hidden and the webview shows it after its first render. If that never
        // happens, it is shown anyway.
        .setup(|app| {
            app.manage(backup::Backups::new(
                app.path().app_local_data_dir()?.join("backups"),
            ));
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(3));
                if let Some(window) = handle.get_webview_window("main") {
                    if !window.is_visible().unwrap_or(true) {
                        let _ = window.show();
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_doc,
            allow_images,
            save_image,
            place_images,
            save_doc,
            open_backups,
            write_notes,
            write_licenses,
            scan_folder,
            load_workspaces,
            save_workspaces,
            initial_file,
            watch_docs
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_opens_as_it_is_with_its_bom_and_line_endings() {
        for text in [
            "",
            "---\nt: x\n---\n",
            "\u{FEFF}# T\r\n",
            "a\r\nb\nc\rd",
            "ğü 日本語",
        ] {
            assert_eq!(document_text(text.into()).as_deref(), Some(text));
        }
    }

    #[test]
    fn other_encodings_and_binary_files_are_refused() {
        let utf16 = |bom: &[u8], text: &str| -> Vec<u8> {
            let units = text.encode_utf16().flat_map(u16::to_le_bytes);
            bom.iter().copied().chain(units).collect()
        };
        let png = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR".to_vec();
        for bytes in [
            utf16(&[0xFF, 0xFE], "# Title"),
            utf16(&[], "# Title"),
            b"caf\xE9".to_vec(),
            png,
            vec![0; 16],
        ] {
            assert_eq!(document_text(bytes), None);
        }
    }

    #[test]
    fn a_file_with_a_non_ascii_name_and_spaces_opens_and_saves() {
        let dir = std::env::temp_dir().join(format!("octavo open {} ğ", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("notlar ğü 日本語.md");
        std::fs::write(&file, "a\r\n").unwrap();
        assert_eq!(read_document(&file).unwrap(), "a\r\n");
        save::save(&file, "b\r\n", Some("a\r\n"), |_| Ok(())).unwrap();
        assert_eq!(std::fs::read(&file).unwrap(), b"b\r\n");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn the_message_for_a_refused_file_names_it() {
        let dir = std::env::temp_dir().join(format!("octavo-refused-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("wide.md");
        std::fs::write(&file, [0xFF, 0xFE, b'a', 0]).unwrap();
        let message = read_document(&file).unwrap_err();
        assert!(
            message.contains("wide.md") && message.contains("UTF-8"),
            "{message}"
        );
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn the_window_keeps_its_size_position_and_maximized_state_only() {
        let flags = window_state_flags();
        assert!(flags.contains(StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED));
        assert!(
            !flags
                .intersects(StateFlags::VISIBLE | StateFlags::FULLSCREEN | StateFlags::DECORATIONS)
        );
    }

    /// The uninstaller's Delete app data option removes the folder the app keeps its data in.
    #[test]
    fn uninstaller_removes_the_data_folder() {
        let dir = env!("CARGO_MANIFEST_DIR");
        let read = |file: &str| std::fs::read_to_string(format!("{dir}/{file}")).unwrap();
        let config: serde_json::Value = serde_json::from_str(&read("tauri.conf.json")).unwrap();
        let data = config["app"]["appDirectoriesOverride"].as_str().unwrap();
        let folder = data
            .strip_prefix("$DATA/")
            .expect("the data folder is in the roaming data folder");
        assert!(read("installer/hooks.nsh").contains(&format!(r#"RmDir /r "$APPDATA\{folder}""#)));
    }
}
