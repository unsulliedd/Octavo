//! The saved workspaces, in one file in the app's data folder. A file that can't be read as the current format is
//! copied aside before anything can replace it, and the caller is told where the copy is.

use crate::backup::new_file;
use crate::save::write_atomic;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::io::{self, Write};
use std::path::Path;

const VERSION: u64 = 1;

#[derive(Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ItemKind {
    Folder,
    Document,
}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
pub struct Item {
    pub kind: ItemKind,
    pub path: String,
}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub items: Vec<Item>,
    pub removed: Vec<String>,
    /// Made with New workspace rather than from a folder. Left out of the file when false.
    #[serde(default, skip_serializing_if = "is_false")]
    pub own: bool,
}

fn is_false(value: &bool) -> bool {
    !value
}

#[derive(Debug, PartialEq, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Reason {
    Corrupt,
    Newer,
}

/// A saved file that couldn't be used, and the copy of it kept beside it.
#[derive(Debug, PartialEq, Serialize)]
pub struct Problem {
    pub reason: Reason,
    pub copy: String,
}

#[derive(Debug, PartialEq, Serialize)]
pub struct Loaded {
    pub workspaces: Vec<Workspace>,
    pub problem: Option<Problem>,
}

#[derive(Deserialize)]
struct Stored {
    workspaces: Vec<Workspace>,
}

/// The workspaces in a saved file's contents.
fn parse(bytes: &[u8]) -> Result<Vec<Workspace>, Reason> {
    let value: Value = serde_json::from_slice(bytes).map_err(|_| Reason::Corrupt)?;
    match value.get("version").and_then(Value::as_u64) {
        Some(VERSION) => serde_json::from_value::<Stored>(value)
            .map(|stored| stored.workspaces)
            .map_err(|_| Reason::Corrupt),
        Some(version) if version > VERSION => Err(Reason::Newer),
        _ => Err(Reason::Corrupt),
    }
}

/// The contents of `path`, or None when there is no such file.
fn read(path: &Path) -> io::Result<Option<Vec<u8>>> {
    match fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e),
    }
}

/// Keeps `bytes`, the contents of the file at `path`, in a new file beside it, unless a copy holds them already, so
/// that each launch doesn't add another.
fn keep(path: &Path, bytes: &[u8], reason: Reason) -> io::Result<Problem> {
    let dir = path.parent().unwrap_or(Path::new("."));
    let earlier = fs::read_dir(dir)?
        .flatten()
        .filter(|entry| {
            entry
                .file_name()
                .to_string_lossy()
                .starts_with("workspaces.")
        })
        .map(|entry| entry.path())
        .find(|copy| copy != path && fs::read(copy).is_ok_and(|held| held == bytes));
    let copy = match earlier {
        Some(copy) => copy,
        None => {
            let name = match reason {
                Reason::Corrupt => "workspaces.corrupt.json",
                Reason::Newer => "workspaces.newer.json",
            };
            let (copy, mut file) = new_file(dir, Path::new(name))?;
            file.write_all(bytes)?;
            file.sync_all()?;
            copy
        }
    };
    Ok(Problem {
        reason,
        copy: copy.to_string_lossy().into_owned(),
    })
}

/// The workspaces saved at `path`: none when the file is missing, and none with a `Problem` when it can't be used.
/// An error means the file couldn't be read, or couldn't be kept aside.
pub fn load(path: &Path) -> io::Result<Loaded> {
    let Some(bytes) = read(path)? else {
        return Ok(Loaded {
            workspaces: Vec::new(),
            problem: None,
        });
    };
    Ok(match parse(&bytes) {
        Ok(workspaces) => Loaded {
            workspaces,
            problem: None,
        },
        Err(reason) => Loaded {
            workspaces: Vec::new(),
            problem: Some(keep(path, &bytes, reason)?),
        },
    })
}

/// Saves `workspaces` at `path`. A file there that can't be used is kept aside first, and reported; if that fails,
/// nothing is written.
pub fn save(path: &Path, workspaces: &[Workspace]) -> io::Result<Option<Problem>> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let problem = match read(path)? {
        Some(bytes) => match parse(&bytes) {
            Ok(_) => None,
            Err(reason) => Some(keep(path, &bytes, reason)?),
        },
        None => None,
    };
    let file = serde_json::json!({ "version": VERSION, "workspaces": workspaces });
    write_atomic(path, &serde_json::to_vec_pretty(&file)?)?;
    Ok(problem)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    struct TempDir(PathBuf);
    impl TempDir {
        fn new(name: &str) -> Self {
            let dir = std::env::temp_dir()
                .join(format!("octavo-workspaces-{name}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).unwrap();
            TempDir(dir)
        }
        fn file(&self) -> PathBuf {
            self.0.join("workspaces.json")
        }
        fn names(&self) -> Vec<String> {
            let mut names: Vec<String> = fs::read_dir(&self.0)
                .unwrap()
                .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
                .collect();
            names.sort();
            names
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn sample() -> Vec<Workspace> {
        vec![Workspace {
            id: "w1".into(),
            name: "notlar ğü 日本語".into(),
            items: vec![
                Item {
                    kind: ItemKind::Folder,
                    path: r"C:\Docs\notlar ğü".into(),
                },
                Item {
                    kind: ItemKind::Document,
                    path: "/docs/a.md".into(),
                },
            ],
            removed: vec![r"C:\Docs\notlar ğü\old".into()],
            own: false,
        }]
    }

    const NEWER: &str = r#"{"version": 2, "spaces": {"new": "shape"}}"#;

    #[test]
    fn a_missing_file_is_an_empty_list() {
        let dir = TempDir::new("missing");
        let loaded = load(&dir.file()).unwrap();
        assert_eq!(loaded.workspaces, []);
        assert_eq!(loaded.problem, None);
        assert_eq!(dir.names(), [] as [&str; 0]);
    }

    #[test]
    fn saved_workspaces_load_back_and_a_second_save_replaces_them() {
        let dir = TempDir::new("round");
        assert_eq!(save(&dir.file(), &sample()).unwrap(), None);
        assert_eq!(load(&dir.file()).unwrap().workspaces, sample());
        assert_eq!(load(&dir.file()).unwrap().problem, None);
        assert_eq!(save(&dir.file(), &[]).unwrap(), None);
        assert_eq!(load(&dir.file()).unwrap().workspaces, []);
        assert_eq!(dir.names(), ["workspaces.json"]);
    }

    #[test]
    fn the_file_holds_the_format_version_and_the_model_shape() {
        let dir = TempDir::new("shape");
        save(&dir.file(), &sample()).unwrap();
        let file: Value = serde_json::from_slice(&fs::read(dir.file()).unwrap()).unwrap();
        assert_eq!(file["version"], VERSION);
        assert_eq!(file["workspaces"][0]["id"], "w1");
        assert_eq!(file["workspaces"][0]["items"][0]["kind"], "folder");
        assert_eq!(file["workspaces"][0]["items"][1]["kind"], "document");
        assert_eq!(file["workspaces"][0]["items"][1]["path"], "/docs/a.md");
        assert_eq!(
            file["workspaces"][0]["removed"][0],
            r"C:\Docs\notlar ğü\old"
        );
        assert!(file["workspaces"][0].get("own").is_none());
    }

    #[test]
    fn an_own_workspace_keeps_its_mark_and_one_without_it_loads_as_not_own() {
        let dir = TempDir::new("own");
        let mut workspaces = sample();
        workspaces[0].own = true;
        save(&dir.file(), &workspaces).unwrap();
        let file: Value = serde_json::from_slice(&fs::read(dir.file()).unwrap()).unwrap();
        assert_eq!(file["workspaces"][0]["own"], true);
        assert_eq!(load(&dir.file()).unwrap().workspaces, workspaces);
        let old = r#"{"version": 1, "workspaces": [{"id": "a", "name": "A", "items": [], "removed": []}]}"#;
        assert!(!parse(old.as_bytes()).unwrap()[0].own);
    }

    #[test]
    fn save_creates_the_data_folder() {
        let dir = TempDir::new("folder");
        let file = dir.0.join("new").join("workspaces.json");
        save(&file, &sample()).unwrap();
        assert_eq!(load(&file).unwrap().workspaces, sample());
    }

    #[test]
    fn parse_tells_corrupt_from_newer() {
        for bytes in [
            "",
            "not json",
            "[]",
            "{}",
            r#"{"workspaces": []}"#,
            r#"{"version": "1", "workspaces": []}"#,
            r#"{"version": 0, "workspaces": []}"#,
            r#"{"version": 1.5, "workspaces": []}"#,
            r#"{"version": 1}"#,
            r#"{"version": 1, "workspaces": {}}"#,
            r#"{"version": 1, "workspaces": [{"id": "a"}]}"#,
            r#"{"version": 1, "workspaces": [{"id": "a", "name": "a", "items": [{"kind": "tag", "path": "p"}], "removed": []}]}"#,
        ] {
            assert_eq!(parse(bytes.as_bytes()), Err(Reason::Corrupt), "{bytes}");
        }
        assert_eq!(parse(&[0xFF, 0xFE]), Err(Reason::Corrupt));
        assert_eq!(parse(NEWER.as_bytes()), Err(Reason::Newer));
    }

    #[test]
    fn a_corrupt_file_is_kept_aside_and_reported() {
        let dir = TempDir::new("corrupt");
        fs::write(dir.file(), "{ cut off").unwrap();
        let loaded = load(&dir.file()).unwrap();
        assert_eq!(loaded.workspaces, []);
        let problem = loaded.problem.unwrap();
        assert_eq!(problem.reason, Reason::Corrupt);
        assert_eq!(
            Path::new(&problem.copy),
            dir.0.join("workspaces.corrupt.json")
        );
        assert_eq!(fs::read_to_string(&problem.copy).unwrap(), "{ cut off");
        assert_eq!(fs::read_to_string(dir.file()).unwrap(), "{ cut off");
    }

    #[test]
    fn a_newer_file_is_kept_aside_and_reported() {
        let dir = TempDir::new("newer");
        fs::write(dir.file(), NEWER).unwrap();
        let problem = load(&dir.file()).unwrap().problem.unwrap();
        assert_eq!(problem.reason, Reason::Newer);
        assert_eq!(
            Path::new(&problem.copy),
            dir.0.join("workspaces.newer.json")
        );
        assert_eq!(fs::read_to_string(&problem.copy).unwrap(), NEWER);
    }

    #[test]
    fn a_save_over_a_file_it_never_loaded_keeps_it_first() {
        for (name, text, reason) in [
            ("save-corrupt", "{ cut off", Reason::Corrupt),
            ("save-newer", NEWER, Reason::Newer),
        ] {
            let dir = TempDir::new(name);
            fs::write(dir.file(), text).unwrap();
            let problem = save(&dir.file(), &sample()).unwrap().unwrap();
            assert_eq!(problem.reason, reason);
            assert_eq!(fs::read_to_string(&problem.copy).unwrap(), text);
            assert_eq!(load(&dir.file()).unwrap().workspaces, sample());
        }
    }

    #[test]
    fn a_save_after_a_load_of_a_bad_file_reports_the_same_copy() {
        let dir = TempDir::new("once");
        fs::write(dir.file(), "bad").unwrap();
        let loaded = load(&dir.file()).unwrap().problem.unwrap();
        assert_eq!(load(&dir.file()).unwrap().problem.unwrap(), loaded);
        assert_eq!(save(&dir.file(), &sample()).unwrap().unwrap(), loaded);
        assert_eq!(dir.names(), ["workspaces.corrupt.json", "workspaces.json"]);
    }

    #[test]
    fn a_different_bad_file_doesnt_replace_an_earlier_copy() {
        let dir = TempDir::new("two");
        fs::write(dir.file(), "first").unwrap();
        let first = load(&dir.file()).unwrap().problem.unwrap();
        fs::write(dir.file(), "second").unwrap();
        let second = load(&dir.file()).unwrap().problem.unwrap();
        assert_ne!(first.copy, second.copy);
        assert_eq!(fs::read_to_string(&first.copy).unwrap(), "first");
        assert_eq!(fs::read_to_string(&second.copy).unwrap(), "second");
    }

    #[test]
    fn a_file_that_cant_be_read_is_an_error_and_is_not_replaced() {
        let dir = TempDir::new("unreadable");
        // Reading a folder fails with something other than a missing file.
        fs::create_dir(dir.file()).unwrap();
        assert!(load(&dir.file()).is_err());
        assert!(save(&dir.file(), &sample()).is_err());
        assert!(dir.file().is_dir());
    }

    /// Takes away the right to read `file`, or gives it back. The file can still be replaced.
    fn deny_read(file: &Path, denied: bool) {
        #[cfg(windows)]
        {
            let change = if denied {
                ["/deny", "*S-1-1-0:(RD)"]
            } else {
                ["/remove:d", "*S-1-1-0"]
            };
            let done = std::process::Command::new("icacls")
                .arg(file)
                .args(change)
                .output()
                .unwrap();
            assert!(done.status.success());
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = if denied { 0o000 } else { 0o644 };
            fs::set_permissions(file, fs::Permissions::from_mode(mode)).unwrap();
        }
    }

    #[test]
    fn a_file_that_exists_but_cant_be_read_is_not_replaced() {
        let dir = TempDir::new("denied");
        fs::write(dir.file(), "unknown").unwrap();
        deny_read(&dir.file(), true);
        // A user with full rights, such as root in a container, reads it anyway.
        let unreadable = fs::read(dir.file()).is_err();
        let saved = save(&dir.file(), &sample());
        deny_read(&dir.file(), false);
        if unreadable {
            assert!(saved.is_err());
            assert_eq!(fs::read_to_string(dir.file()).unwrap(), "unknown");
        }
    }

    #[test]
    fn a_file_that_cant_be_kept_aside_is_not_replaced() {
        let dir = TempDir::new("no-copy");
        fs::write(dir.file(), "bad").unwrap();
        // A file stands where the copy's folder should be, so `keep` fails.
        let inside = dir.file().join("workspaces.json");
        assert!(keep(&inside, b"bad", Reason::Corrupt).is_err());
        assert_eq!(fs::read_to_string(dir.file()).unwrap(), "bad");
    }
}
