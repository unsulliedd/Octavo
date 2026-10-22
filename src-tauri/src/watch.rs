//! Watches the open documents and reports a document's path when it changes on disk.
//! Watches each document's folder rather than the file itself, so saves that replace the file
//! (write to a temporary file, then rename) are seen too.

use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};

/// Comparison key for a path: case-insensitive on Windows, where the file system is.
fn key(path: &Path) -> String {
    let s = path.to_string_lossy();
    if cfg!(windows) {
        s.to_lowercase()
    } else {
        s.into_owned()
    }
}

/// Paths as the webview knows them, by comparison key.
type Docs = BTreeMap<String, String>;

/// The documents, out of `docs`, that an event on `paths` concerns.
fn affected<'a>(docs: &'a Docs, paths: &[PathBuf]) -> Vec<&'a String> {
    let mut out: Vec<&String> = paths.iter().filter_map(|p| docs.get(&key(p))).collect();
    out.sort();
    out.dedup();
    out
}

/// Folders to watch for `docs`.
fn folders(docs: &Docs) -> HashSet<PathBuf> {
    docs.values()
        .filter_map(|p| Path::new(p).parent().map(Path::to_path_buf))
        .collect()
}

#[derive(Default)]
pub struct DocWatcher {
    docs: Arc<Mutex<Docs>>,
    state: Mutex<Option<(RecommendedWatcher, HashSet<PathBuf>)>>,
}

impl DocWatcher {
    /// Replaces the set of watched documents. `on_change` receives a changed document's path as given in
    /// `paths`; only the one passed to the first call is used.
    pub fn set(
        &self,
        paths: Vec<String>,
        on_change: impl Fn(&str) + Send + 'static,
    ) -> Result<(), String> {
        let docs: Docs = paths.into_iter().map(|p| (key(Path::new(&p)), p)).collect();
        let wanted = folders(&docs);
        *self.docs.lock().unwrap() = docs;

        let mut state = self.state.lock().unwrap();
        if state.is_none() {
            let docs = self.docs.clone();
            let watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
                let Ok(event) = res else { return };
                if matches!(event.kind, EventKind::Access(_)) {
                    return;
                }
                for path in affected(&docs.lock().unwrap(), &event.paths) {
                    on_change(path);
                }
            })
            .map_err(|e| e.to_string())?;
            *state = Some((watcher, HashSet::new()));
        }
        let (watcher, watching) = state.as_mut().unwrap();
        for dir in watching.difference(&wanted).cloned().collect::<Vec<_>>() {
            let _ = watcher.unwatch(&dir);
            watching.remove(&dir);
        }
        for dir in wanted.difference(&watching.clone()) {
            // A folder that can't be watched (deleted, no access) only means no live reload for its documents.
            if watcher.watch(dir, RecursiveMode::NonRecursive).is_ok() {
                watching.insert(dir.clone());
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn docs(paths: &[&str]) -> Docs {
        paths
            .iter()
            .map(|p| (key(Path::new(p)), p.to_string()))
            .collect()
    }

    #[test]
    fn events_map_to_open_documents() {
        let d = docs(&["/docs/a.md", "/docs/b.md", "/notes/c.md"]);
        let paths = [
            PathBuf::from("/docs/a.md"),
            PathBuf::from("/docs/a.md.tmp"),
            PathBuf::from("/docs/a.md"),
        ];
        assert_eq!(affected(&d, &paths), vec!["/docs/a.md"]);
        assert!(affected(&d, &[PathBuf::from("/docs/other.md")]).is_empty());
        // A rename event names both paths; the document is the target.
        assert_eq!(
            affected(
                &d,
                &[
                    PathBuf::from("/docs/.b.md.swp"),
                    PathBuf::from("/docs/b.md")
                ]
            ),
            vec!["/docs/b.md"]
        );
    }

    #[test]
    fn one_folder_per_set_of_documents() {
        let d = docs(&["/docs/a.md", "/docs/b.md", "/notes/c.md"]);
        let expected: HashSet<PathBuf> = [PathBuf::from("/docs"), PathBuf::from("/notes")].into();
        assert_eq!(folders(&d), expected);
    }

    #[test]
    fn reports_writes_and_replacing_saves() {
        use std::sync::mpsc;
        use std::time::Duration;

        let dir = std::env::temp_dir().join(format!("octavo-watch-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let doc = dir.join("doc.md");
        std::fs::write(&doc, "one").unwrap();
        let path = doc.to_string_lossy().into_owned();

        let (tx, rx) = mpsc::channel();
        let watcher = DocWatcher::default();
        watcher
            .set(vec![path.clone()], move |p| tx.send(p.to_string()).unwrap())
            .unwrap();
        let next = || rx.recv_timeout(Duration::from_secs(5));
        let drain = || while rx.recv_timeout(Duration::from_millis(300)).is_ok() {};

        std::fs::write(&doc, "two").unwrap();
        assert_eq!(next(), Ok(path.clone()));
        drain();

        // Editors that save by writing a temporary file and renaming it over the document.
        let tmp = dir.join("doc.md.tmp");
        std::fs::write(&tmp, "three").unwrap();
        std::fs::rename(&tmp, &doc).unwrap();
        assert_eq!(next(), Ok(path.clone()));
        drain();

        std::fs::write(dir.join("other.md"), "x").unwrap();
        assert!(rx.recv_timeout(Duration::from_millis(500)).is_err());

        // No longer watched once the document's tab is closed.
        watcher.set(vec![], |_| {}).unwrap();
        std::fs::write(&doc, "four").unwrap();
        assert!(rx.recv_timeout(Duration::from_millis(500)).is_err());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn windows_paths_ignore_case() {
        let d = docs(&[r"C:\Docs\A.md"]);
        assert_eq!(
            affected(&d, &[PathBuf::from(r"c:\docs\a.MD")]),
            vec![r"C:\Docs\A.md"]
        );
    }
}
