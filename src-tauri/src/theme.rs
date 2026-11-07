//! Theme files of Settings › Colors: small JSON files the user picks with the system dialogs. Reading and writing one
//! touches nothing else: the webview gets no new access, and nothing is backed up or watched.

use crate::save::write_atomic;
use std::fs::File;
use std::io::{self, Read};
use std::path::Path;

/// The largest theme file read, in bytes.
pub const MAX_BYTES: u64 = 64 * 1024;

/// `e` in plain words; `denied` is said when the system refuses access.
fn plain(e: io::Error, denied: &str) -> String {
    match e.kind() {
        io::ErrorKind::NotFound => "The file or its folder wasn't found.".into(),
        // A refusal with a message of its own, such as a read-only file, keeps it.
        io::ErrorKind::PermissionDenied if e.get_ref().is_none() => denied.into(),
        _ => e.to_string(),
    }
}

/// Refuses a path that doesn't end in `.json`, so the commands can't reach other kinds of file.
fn json_only(path: &Path) -> Result<(), String> {
    match path.extension() {
        Some(e) if e.eq_ignore_ascii_case("json") => Ok(()),
        _ => Err("A theme file's name ends in .json.".into()),
    }
}

/// The text of the theme file at `path`. Files not named `.json`, over `MAX_BYTES` or not UTF-8 text are refused.
pub fn read(path: &Path) -> Result<String, String> {
    json_only(path)?;
    let denied = |e| plain(e, "Octavo isn't allowed to open this file.");
    let mut bytes = Vec::new();
    File::open(path)
        .map_err(denied)?
        .take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(denied)?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("It's larger than 64 KB, so it isn't an Octavo theme.".into());
    }
    String::from_utf8(bytes)
        .map_err(|_| "It isn't a text file, so it isn't an Octavo theme.".into())
}

/// Writes `text` to the theme file at `path`, replacing it whole. Only `.json` paths and text up to `MAX_BYTES`.
pub fn write(path: &Path, text: &str) -> Result<(), String> {
    json_only(path)?;
    if text.len() as u64 > MAX_BYTES {
        return Err("The theme is larger than 64 KB.".into());
    }
    write_atomic(path, text.as_bytes())
        .map_err(|e| plain(e, "Octavo isn't allowed to save in this folder."))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("octavo-theme-{name}-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_written_theme_reads_back_as_it_was() {
        let dir = dir("round");
        let file = dir.join("My colors.octavo-theme.json");
        let text = "\u{FEFF}{\r\n  \"octavoTheme\": 1,\r\n  \"name\": \"Gün ışığı\"\r\n}\r\n";
        write(&file, text).unwrap();
        assert_eq!(read(&file).unwrap(), text);
        write(&file, "{}").unwrap();
        assert_eq!(read(&file).unwrap(), "{}");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_file_over_64_kb_is_refused_and_one_at_64_kb_is_read() {
        let dir = dir("size");
        let file = dir.join("big.json");
        std::fs::write(&file, vec![b' '; MAX_BYTES as usize]).unwrap();
        assert_eq!(read(&file).unwrap().len(), MAX_BYTES as usize);
        std::fs::write(&file, vec![b' '; MAX_BYTES as usize + 1]).unwrap();
        assert!(read(&file).unwrap_err().contains("64 KB"));
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_missing_file_or_folder_says_so() {
        let dir = dir("missing");
        assert_eq!(
            read(&dir.join("gone.json")).unwrap_err(),
            "The file or its folder wasn't found."
        );
        assert_eq!(
            write(&dir.join("gone").join("theme.json"), "{}").unwrap_err(),
            "The file or its folder wasn't found."
        );
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn only_json_paths_are_read_or_written() {
        let dir = dir("json");
        for name in ["theme.txt", "theme", "notes.md"] {
            let file = dir.join(name);
            assert!(write(&file, "{}").is_err(), "{name}");
            assert!(!file.exists(), "{name}");
            std::fs::write(&file, "{}").unwrap();
            assert!(read(&file).is_err(), "{name}");
        }
        let upper = dir.join("Theme.JSON");
        write(&upper, "{}").unwrap();
        assert_eq!(read(&upper).unwrap(), "{}");
        assert!(write(&upper, &" ".repeat(MAX_BYTES as usize + 1)).is_err());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_binary_file_is_refused() {
        let dir = dir("binary");
        let file = dir.join("theme.json");
        std::fs::write(&file, [0xFF, 0xFE, b'{', 0]).unwrap();
        assert!(read(&file).unwrap_err().contains("isn't a text file"));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
