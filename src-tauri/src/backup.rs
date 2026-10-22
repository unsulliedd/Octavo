//! Copies of documents as they were before Octavo first replaced them in a session, kept in the app's
//! data folder under one folder per day and removed after `KEEP_DAYS`.

use chrono::{Local, NaiveDate};
use std::collections::HashSet;
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const KEEP_DAYS: u64 = 30;

pub struct Backups {
    pub dir: PathBuf,
    /// Files already backed up in this session.
    done: Mutex<HashSet<PathBuf>>,
}

impl Backups {
    pub fn new(dir: PathBuf) -> Self {
        Backups {
            dir,
            done: Mutex::new(HashSet::new()),
        }
    }

    /// Copies `original`, the contents of `path` before it is replaced, unless `path` was already
    /// backed up in this session.
    pub fn keep(&self, path: &Path, original: &[u8]) -> io::Result<()> {
        self.keep_on(path, original, Local::now().date_naive())
    }

    fn keep_on(&self, path: &Path, original: &[u8], today: NaiveDate) -> io::Result<()> {
        let key = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        let mut done = self.done.lock().unwrap();
        if done.contains(&key) {
            return Ok(());
        }
        if done.is_empty() {
            self.prune(today);
        }
        let day = self.dir.join(today.format("%Y-%m-%d").to_string());
        fs::create_dir_all(&day)?;
        let name = Path::new(key.file_name().unwrap_or("document.md".as_ref()));
        let mut file = new_file(&day, name)?;
        file.write_all(original)?;
        file.sync_all()?;
        done.insert(key);
        Ok(())
    }

    /// Removes the day folders older than `KEEP_DAYS`.
    fn prune(&self, today: NaiveDate) {
        let Some(oldest) = today.checked_sub_days(chrono::Days::new(KEEP_DAYS)) else {
            return;
        };
        let Ok(entries) = fs::read_dir(&self.dir) else {
            return;
        };
        for entry in entries.flatten() {
            let name = entry.file_name();
            let old = NaiveDate::parse_from_str(&name.to_string_lossy(), "%Y-%m-%d")
                .is_ok_and(|d| d < oldest);
            if old {
                let _ = fs::remove_dir_all(entry.path());
            }
        }
    }
}

/// A new file in `dir` named `name`, or `name (2)`, `name (3)`… when that is taken.
fn new_file(dir: &Path, name: &Path) -> io::Result<fs::File> {
    let stem = name.file_stem().unwrap_or_default().to_string_lossy();
    let ext = name
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    for n in 1.. {
        let file = if n == 1 {
            format!("{stem}{ext}")
        } else {
            format!("{stem} ({n}){ext}")
        };
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(dir.join(file))
        {
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => continue,
            other => return other,
        }
    }
    unreachable!()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("octavo-backup-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn day(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn backs_up_each_file_once_per_session() {
        let root = temp("once");
        let docs = root.join("docs");
        fs::create_dir_all(docs.join("sub")).unwrap();
        let (a, b) = (docs.join("notes.md"), docs.join("sub").join("notes.md"));
        fs::write(&a, "a").unwrap();
        fs::write(&b, "b").unwrap();
        let backups = Backups::new(root.join("backups"));
        let today = day("2026-10-14");
        backups.keep_on(&a, b"first", today).unwrap();
        backups.keep_on(&a, b"second", today).unwrap();
        backups.keep_on(&b, b"other", today).unwrap();
        let folder = root.join("backups").join("2026-10-14");
        assert_eq!(
            fs::read_to_string(folder.join("notes.md")).unwrap(),
            "first"
        );
        assert_eq!(
            fs::read_to_string(folder.join("notes (2).md")).unwrap(),
            "other"
        );
        assert_eq!(fs::read_dir(&folder).unwrap().count(), 2);

        // A new session backs the file up again, without replacing the earlier copy.
        Backups::new(root.join("backups"))
            .keep_on(&a, b"later", today)
            .unwrap();
        assert_eq!(
            fs::read_to_string(folder.join("notes (3).md")).unwrap(),
            "later"
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn removes_day_folders_older_than_the_limit() {
        let root = temp("prune");
        let dir = root.join("backups");
        for d in ["2026-09-13", "2026-09-14", "unrelated"] {
            fs::create_dir_all(dir.join(d)).unwrap();
        }
        let doc = root.join("doc.md");
        fs::write(&doc, "x").unwrap();
        Backups::new(dir.clone())
            .keep_on(&doc, b"x", day("2026-10-14"))
            .unwrap();
        let mut left: Vec<String> = fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        left.sort();
        assert_eq!(left, ["2026-09-14", "2026-10-14", "unrelated"]);
        let _ = fs::remove_dir_all(&root);
    }
}
