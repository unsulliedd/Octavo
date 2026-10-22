//! What's new: a version's release notes written to a file in the app's data folder, so they open in a
//! tab like any document.

use std::io;
use std::path::{Path, PathBuf};

/// The notes file for `version` in `dir`. Only a plain version (letters, digits, dots and hyphens) names
/// one, so the name can't point outside `dir`.
pub fn file(dir: &Path, version: &str) -> Option<PathBuf> {
    let plain = !version.is_empty()
        && version.len() <= 32
        && !version.contains("..")
        && version
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-');
    plain.then(|| dir.join(format!("What's new in Octavo {version}.md")))
}

/// Writes `text` as the notes for `version`, replacing an earlier copy; returns the file's path.
pub fn write(dir: &Path, version: &str, text: &str) -> io::Result<PathBuf> {
    let path = file(dir, version).ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("not a version: {version}"),
        )
    })?;
    std::fs::create_dir_all(dir)?;
    std::fs::write(&path, text)?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_a_plain_version_names_a_file() {
        let dir = Path::new("notes");
        assert_eq!(
            file(dir, "0.5.1"),
            Some(dir.join("What's new in Octavo 0.5.1.md"))
        );
        assert_eq!(
            file(dir, "1.0.0-beta"),
            Some(dir.join("What's new in Octavo 1.0.0-beta.md"))
        );
        for bad in ["", "..", "../0.5.1", "0.5/1", "0.5\\1", "a b"] {
            assert_eq!(file(dir, bad), None, "{bad:?}");
        }
    }

    #[test]
    fn write_creates_the_folder_and_replaces_an_earlier_copy() {
        let dir = std::env::temp_dir().join(format!("octavo-notes-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let path = write(&dir, "0.5.1", "first").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "first");
        write(&dir, "0.5.1", "second").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "second");
        assert!(write(&dir, "../x", "no").is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
