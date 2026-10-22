mod backup;
mod images;
mod notes;
mod save;
mod watch;

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

/// Reads a document and lets the webview load images from its folder.
#[tauri::command]
fn open_doc(app: tauri::AppHandle, path: String) -> Result<Doc, String> {
    let path = std::path::absolute(&path).map_err(|e| e.to_string())?;
    let text = std::fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))?;
    if let Some(dir) = path.parent() {
        app.asset_protocol_scope()
            .allow_directory(dir, true)
            .map_err(|e| e.to_string())?;
    }
    Ok(Doc {
        path: path.to_string_lossy().into_owned(),
        text,
    })
}

/// Lets the webview load these image files, for images a document references outside its own folder.
/// Only absolute image paths are allowed; other paths are ignored.
#[tauri::command]
fn allow_images(app: tauri::AppHandle, paths: Vec<String>) -> Result<(), String> {
    let scope = app.asset_protocol_scope();
    for path in images::image_files(&paths) {
        scope.allow_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
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
    app: tauri::AppHandle,
    dir: String,
    paths: Vec<String>,
) -> Result<Vec<String>, String> {
    let dir = std::path::absolute(&dir).map_err(|e| e.to_string())?;
    let scope = app.asset_protocol_scope();
    paths
        .iter()
        .map(|path| {
            let file = std::path::absolute(path).map_err(|e| e.to_string())?;
            let placed = images::place(&dir, &file).map_err(|e| format!("{path}: {e}"))?;
            scope.allow_file(&placed).map_err(|e| e.to_string())?;
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(window_state_flags())
                .build(),
        )
        .manage(watch::DocWatcher::default())
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
