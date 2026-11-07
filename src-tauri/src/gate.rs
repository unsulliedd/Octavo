//! Keeps the main window on the app: a navigation to anywhere else is refused, so a stray link can't replace
//! the document view and lose unsaved edits. Links are opened by the page, which hands them to the browser.

use tauri::plugin::{Builder, TauriPlugin};
use tauri::{Runtime, Url};

/// The port of the dev server (`devUrl` in tauri.conf.json).
const DEV_PORT: u16 = 1420;

/// Whether the window may navigate to `url`: the app's own origin (`http(s)://tauri.localhost`, or
/// `tauri://localhost` on other platforms), the dev server when `dev`, and the blank page.
pub fn allows(url: &Url, dev: bool) -> bool {
    if url.as_str() == "about:blank" {
        return true;
    }
    if !url.username().is_empty() || url.password().is_some() {
        return false;
    }
    match (url.scheme(), url.host_str(), url.port()) {
        ("http" | "https", Some("tauri.localhost"), None) => true,
        ("tauri", Some("localhost"), None) => true,
        ("http", Some("localhost"), Some(DEV_PORT)) => dev,
        _ => false,
    }
}

pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("navigation-gate")
        .on_navigation(|_, url| {
            let allowed = allows(url, tauri::is_dev());
            if !allowed {
                eprintln!("Refused navigation to {url}");
            }
            allowed
        })
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn allowed(url: &str, dev: bool) -> bool {
        allows(&Url::parse(url).unwrap(), dev)
    }

    #[test]
    fn the_apps_own_pages_are_allowed() {
        for url in [
            "http://tauri.localhost/",
            "https://tauri.localhost/",
            "https://tauri.localhost/index.html#heading",
            "http://tauri.localhost",
            "tauri://localhost",
            "tauri://localhost/index.html",
            "about:blank",
        ] {
            assert!(allowed(url, false), "{url}");
        }
    }

    #[test]
    fn the_dev_server_is_allowed_only_in_dev() {
        assert!(allowed("http://localhost:1420/", true));
        assert!(!allowed("http://localhost:1420/", false));
        assert!(!allowed("http://localhost:1421/", true));
        assert!(!allowed("http://localhost/", true));
        assert!(!allowed("https://localhost:1420/", true));
    }

    #[test]
    fn everything_else_is_refused() {
        for url in [
            "https://example.com",
            "http://example.com/tauri.localhost",
            "https://tauri.localhost.example.com/",
            "https://example.tauri.localhost/",
            "https://tauri.localhost@example.com/",
            "https://tauri.localhost:8443/",
            "https://user@tauri.localhost/",
            "http://tauri.localhost:80@example.com/",
            "tauri://example.com",
            "tauri://localhost.example.com",
            "asset://localhost/C%3A%5Ca.png",
            "http://asset.localhost/a.png",
            "file:///C:/Windows/win.ini",
            "javascript:alert(1)",
            "data:text/html,<p>x</p>",
            "blob:https://tauri.localhost/1",
            "about:srcdoc",
            "mailto:a@b.c",
        ] {
            assert!(!allowed(url, true), "{url}");
            assert!(!allowed(url, false), "{url}");
        }
    }
}
