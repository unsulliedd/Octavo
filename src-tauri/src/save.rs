//! Writing documents: the file is replaced in one step, only when its content changes, and only when
//! it still holds what the editor started from.

use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};

#[derive(Debug, PartialEq)]
pub enum SaveError {
    /// The file no longer holds the text the edits were made to.
    Changed,
    /// The file the edits were made to is gone.
    Missing,
    Io(String),
}

impl std::fmt::Display for SaveError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SaveError::Changed => write!(f, "The file changed on disk. Your edits were not saved."),
            SaveError::Missing => {
                write!(f, "The file no longer exists. Your edits were not saved.")
            }
            SaveError::Io(e) => write!(f, "{e}"),
        }
    }
}

impl From<io::Error> for SaveError {
    fn from(e: io::Error) -> Self {
        SaveError::Io(e.to_string())
    }
}

/// Writes `text` to `path`.
///
/// With `expected`, the file must still hold exactly that text, or nothing is written. A file that
/// already holds `text` is left untouched. Before an existing file is replaced, `backup` gets its
/// contents; if that fails, nothing is written. Returns whether the file was written.
pub fn save(
    path: &Path,
    text: &str,
    expected: Option<&str>,
    backup: impl FnOnce(&[u8]) -> io::Result<()>,
) -> Result<bool, SaveError> {
    let current = match fs::read(path) {
        Ok(bytes) => Some(bytes),
        Err(e) if e.kind() == io::ErrorKind::NotFound => None,
        Err(e) => return Err(e.into()),
    };
    if let Some(expected) = expected {
        match &current {
            None => return Err(SaveError::Missing),
            Some(bytes) if bytes.as_slice() != expected.as_bytes() => {
                return Err(SaveError::Changed);
            }
            Some(_) => {}
        }
    }
    if current.as_deref() == Some(text.as_bytes()) {
        return Ok(false);
    }
    if let Some(original) = &current {
        backup(original)
            .map_err(|e| SaveError::Io(format!("The original file couldn't be backed up: {e}")))?;
    }
    write_atomic(path, text.as_bytes())?;
    Ok(true)
}

/// Replaces the file at `path` with `contents`: they are written to a temporary file in the same
/// folder, flushed to disk and renamed over the file, so the file holds either the old or the new
/// contents, never part of them. A symbolic link is followed and its target replaced.
pub fn write_atomic(path: &Path, contents: &[u8]) -> io::Result<()> {
    let target = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let existing = fs::metadata(&target).ok();
    if existing
        .as_ref()
        .is_some_and(|m| m.permissions().readonly())
    {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "The file is read-only.",
        ));
    }
    let (tmp, mut file) = temp_file(&target)?;
    let written = (|| {
        file.write_all(contents)?;
        if let Some(meta) = &existing {
            file.set_permissions(meta.permissions())?;
        }
        file.sync_all()?;
        drop(file);
        fs::rename(&tmp, &target)
    })();
    if written.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    written?;
    sync_folder(&target);
    Ok(())
}

/// A new, empty file next to `target`, named after it.
fn temp_file(target: &Path) -> io::Result<(PathBuf, File)> {
    static COUNTER: AtomicU32 = AtomicU32::new(0);
    let dir = target
        .parent()
        .filter(|d| !d.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let name = target
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    loop {
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let tmp = dir.join(format!(".{name}.{}-{n}.octavo-tmp", std::process::id()));
        match OpenOptions::new().write(true).create_new(true).open(&tmp) {
            Ok(file) => return Ok((tmp, file)),
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e),
        }
    }
}

/// Makes the rename itself durable where the platform needs it.
fn sync_folder(target: &Path) {
    #[cfg(unix)]
    if let Some(dir) = target.parent() {
        if let Ok(d) = File::open(dir) {
            let _ = d.sync_all();
        }
    }
    #[cfg(not(unix))]
    let _ = target;
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TempDir(PathBuf);
    impl TempDir {
        fn new(name: &str) -> Self {
            let dir =
                std::env::temp_dir().join(format!("octavo-save-{name}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).unwrap();
            TempDir(dir)
        }
        /// Files in the folder, so tests can check that no temporary file is left behind.
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

    #[test]
    fn replaces_the_file_and_leaves_no_temporary_file() {
        let dir = TempDir::new("replace");
        let doc = dir.0.join("doc.md");
        fs::write(&doc, "old\r\n").unwrap();
        assert_eq!(save(&doc, "new\r\n", Some("old\r\n"), |_| Ok(())), Ok(true));
        assert_eq!(fs::read_to_string(&doc).unwrap(), "new\r\n");
        assert_eq!(dir.names(), ["doc.md"]);
    }

    #[test]
    fn creates_a_new_file() {
        let dir = TempDir::new("create");
        let doc = dir.0.join("copy.md");
        assert_eq!(save(&doc, "text\n", None, |_| Ok(())), Ok(true));
        assert_eq!(fs::read_to_string(&doc).unwrap(), "text\n");
        assert_eq!(dir.names(), ["copy.md"]);
    }

    #[test]
    fn unchanged_content_is_not_written() {
        let dir = TempDir::new("unchanged");
        let doc = dir.0.join("doc.md");
        fs::write(&doc, "same\n").unwrap();
        let before = fs::metadata(&doc).unwrap().modified().unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        assert_eq!(save(&doc, "same\n", Some("same\n"), |_| Ok(())), Ok(false));
        assert_eq!(fs::metadata(&doc).unwrap().modified().unwrap(), before);
    }

    #[test]
    fn a_file_changed_on_disk_is_not_overwritten() {
        let dir = TempDir::new("changed");
        let doc = dir.0.join("doc.md");
        fs::write(&doc, "changed elsewhere\n").unwrap();
        assert_eq!(
            save(&doc, "mine\n", Some("original\n"), |_| Ok(())),
            Err(SaveError::Changed)
        );
        assert_eq!(fs::read_to_string(&doc).unwrap(), "changed elsewhere\n");
        assert_eq!(
            save(
                &dir.0.join("gone.md"),
                "mine\n",
                Some("original\n"),
                |_| Ok(())
            ),
            Err(SaveError::Missing)
        );
        assert_eq!(dir.names(), ["doc.md"]);
    }

    #[test]
    fn backs_up_only_a_file_it_replaces() {
        let dir = TempDir::new("backup");
        let doc = dir.0.join("doc.md");
        let mut seen = Vec::new();
        save(&doc, "new\n", None, |b| {
            seen.push(b.to_vec());
            Ok(())
        })
        .unwrap();
        save(&doc, "new\n", None, |b| {
            seen.push(b.to_vec());
            Ok(())
        })
        .unwrap();
        save(&doc, "newer\n", None, |b| {
            seen.push(b.to_vec());
            Ok(())
        })
        .unwrap();
        assert_eq!(seen, [b"new\n".to_vec()]);

        let failed = save(&doc, "lost\n", None, |_| Err(io::Error::other("full")));
        assert!(matches!(failed, Err(SaveError::Io(_))));
        assert_eq!(fs::read_to_string(&doc).unwrap(), "newer\n");
    }

    #[test]
    fn a_failed_write_keeps_the_old_file() {
        let dir = TempDir::new("failed");
        // Renaming a file over a folder fails after the temporary file was written.
        let target = dir.0.join("folder.md");
        fs::create_dir(&target).unwrap();
        fs::write(target.join("inside.md"), "keep").unwrap();
        assert!(write_atomic(&target, b"new").is_err());
        assert_eq!(
            fs::read_to_string(target.join("inside.md")).unwrap(),
            "keep"
        );
        assert_eq!(dir.names(), ["folder.md"]);
    }

    #[test]
    fn a_read_only_file_is_not_replaced() {
        let dir = TempDir::new("readonly");
        let doc = dir.0.join("doc.md");
        fs::write(&doc, "old").unwrap();
        let mut perms = fs::metadata(&doc).unwrap().permissions();
        perms.set_readonly(true);
        fs::set_permissions(&doc, perms.clone()).unwrap();
        assert!(write_atomic(&doc, b"new").is_err());
        assert_eq!(fs::read_to_string(&doc).unwrap(), "old");
        #[allow(clippy::permissions_set_readonly_false)]
        perms.set_readonly(false);
        fs::set_permissions(&doc, perms).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn keeps_permissions_and_follows_symbolic_links() {
        use std::os::unix::fs::PermissionsExt;
        let dir = TempDir::new("links");
        let real = dir.0.join("real.md");
        fs::write(&real, "old").unwrap();
        fs::set_permissions(&real, fs::Permissions::from_mode(0o640)).unwrap();
        let link = dir.0.join("link.md");
        std::os::unix::fs::symlink(&real, &link).unwrap();
        write_atomic(&link, b"new").unwrap();
        assert!(
            fs::symlink_metadata(&link)
                .unwrap()
                .file_type()
                .is_symlink()
        );
        assert_eq!(fs::read_to_string(&real).unwrap(), "new");
        assert_eq!(
            fs::metadata(&real).unwrap().permissions().mode() & 0o777,
            0o640
        );
    }
}
