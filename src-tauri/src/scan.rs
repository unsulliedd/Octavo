//! Lists the Markdown files under a folder. Symbolic links and junctions are not followed: a link can lead to a
//! network path, and reading one makes Windows send the user's credentials to that server.

use serde::Serialize;
use std::collections::VecDeque;
use std::ffi::OsStr;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

const SKIPPED: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "Library",
    "Temp",
    "obj",
    "dist",
];

/// How many folder entries one scan looks at, so that a scan of a whole drive stops.
const MAX_ENTRIES: usize = 200_000;

#[derive(Debug, Serialize)]
pub struct Scan {
    pub files: Vec<String>,
    /// The scan stopped at the limit, so more files may exist.
    pub truncated: bool,
}

fn is_markdown(path: &Path) -> bool {
    path.extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("md") || e.eq_ignore_ascii_case("markdown"))
}

fn is_scanned(folder: &OsStr, show_hidden: bool) -> bool {
    let name = folder.to_string_lossy();
    !SKIPPED.contains(&name.as_ref()) && (show_hidden || !name.starts_with('.'))
}

/// The Markdown files under `root`, nearest first. Fails only when `root` itself can't be read; a folder below it
/// that can't be read is left out.
pub fn scan(root: &Path, show_hidden: bool) -> io::Result<Scan> {
    scan_up_to(root, show_hidden, MAX_ENTRIES)
}

fn scan_up_to(root: &Path, show_hidden: bool, max_entries: usize) -> io::Result<Scan> {
    fs::read_dir(root)?;
    let mut found = Scan {
        files: Vec::new(),
        truncated: false,
    };
    let mut entries_seen = 0;
    let mut folders = VecDeque::from([PathBuf::from(root)]);
    while let Some(folder) = folders.pop_front() {
        let Ok(entries) = fs::read_dir(&folder) else {
            continue;
        };
        for entry in entries.flatten() {
            if entries_seen == max_entries {
                found.truncated = true;
                return Ok(found);
            }
            entries_seen += 1;
            let Ok(kind) = entry.file_type() else {
                continue;
            };
            let path = entry.path();
            if kind.is_symlink() {
                continue;
            } else if kind.is_dir() {
                if is_scanned(&entry.file_name(), show_hidden) {
                    folders.push_back(path);
                }
            } else if is_markdown(&path) {
                found.files.push(path.to_string_lossy().into_owned());
            }
        }
    }
    Ok(found)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::asset::tests::link;

    struct TempDir(PathBuf);
    impl TempDir {
        /// A folder holding `files`, each a path relative to it.
        fn new(name: &str, files: &[&str]) -> Self {
            let dir =
                std::env::temp_dir().join(format!("octavo-scan-{name}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).unwrap();
            for file in files {
                let path = dir.join(file);
                fs::create_dir_all(path.parent().unwrap()).unwrap();
                fs::write(path, "x").unwrap();
            }
            TempDir(dir)
        }
        /// The files a scan found, relative to the folder, with forward slashes.
        fn found(&self, scan: &Scan) -> Vec<String> {
            let mut names: Vec<String> = scan
                .files
                .iter()
                .map(|f| {
                    let name = Path::new(f).strip_prefix(&self.0).unwrap();
                    name.to_string_lossy().replace('\\', "/")
                })
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
    fn finds_markdown_at_every_depth_ignoring_case() {
        let dir = TempDir::new(
            "kinds",
            &[
                "a.md",
                "b.MD",
                "c.markdown",
                "d.MarkDown",
                "sub/deep/e.md",
                "f.txt",
                "g.mdx",
                "md",
                "h.md.bak",
            ],
        );
        fs::create_dir(dir.0.join("folder.md")).unwrap();
        let found = scan(&dir.0, false).unwrap();
        assert_eq!(
            dir.found(&found),
            ["a.md", "b.MD", "c.markdown", "d.MarkDown", "sub/deep/e.md"]
        );
        assert!(!found.truncated);
    }

    #[test]
    fn skips_the_skip_list_but_not_files_with_those_names() {
        let mut files: Vec<String> = SKIPPED.iter().map(|s| format!("{s}/a.md")).collect();
        files.extend(["sub/node_modules/b.md".into(), "dist.md".into()]);
        files.push("kept/target".into());
        let files: Vec<&str> = files.iter().map(String::as_str).collect();
        let dir = TempDir::new("skip", &files);
        assert_eq!(dir.found(&scan(&dir.0, false).unwrap()), ["dist.md"]);
    }

    #[test]
    fn a_root_on_the_skip_list_is_still_scanned() {
        let dir = TempDir::new("root", &["dist/a.md"]);
        let root = dir.0.join("dist");
        assert_eq!(scan(&root, false).unwrap().files.len(), 1);
    }

    #[test]
    fn dot_folders_are_included_only_when_asked_and_git_never() {
        let dir = TempDir::new(
            "hidden",
            &[".claude/a.md", ".git/b.md", ".notes.md", "sub/.agent/c.md"],
        );
        assert_eq!(dir.found(&scan(&dir.0, false).unwrap()), [".notes.md"]);
        assert_eq!(
            dir.found(&scan(&dir.0, true).unwrap()),
            [".claude/a.md", ".notes.md", "sub/.agent/c.md"]
        );
    }

    #[test]
    fn a_folder_link_is_not_followed() {
        let dir = TempDir::new("link", &["inside/a.md", "outside/b.md"]);
        let root = dir.0.join("inside");
        assert!(link(&dir.0.join("outside"), &root.join("linked")));
        assert_eq!(dir.found(&scan(&root, false).unwrap()), ["inside/a.md"]);
    }

    #[test]
    fn a_file_link_is_not_listed() {
        let dir = TempDir::new("file-link", &["inside/a.md", "outside/b.md"]);
        let root = dir.0.join("inside");
        // A file link can need rights the test run lacks; see `link`.
        if link(&dir.0.join("outside").join("b.md"), &root.join("c.md")) {
            assert_eq!(dir.found(&scan(&root, false).unwrap()), ["inside/a.md"]);
        }
    }

    #[test]
    fn a_root_that_cant_be_read_fails() {
        let dir = TempDir::new("no-root", &["a.md"]);
        assert!(scan(&dir.0.join("missing"), false).is_err());
        assert!(scan(&dir.0.join("a.md"), false).is_err());
    }

    /// Takes all access to `folder` away, or gives it back. The group is named by its number, which is the same in
    /// every Windows language.
    fn lock(folder: &Path, locked: bool) {
        #[cfg(windows)]
        {
            let change = if locked {
                ["/deny", "*S-1-1-0:(OI)(CI)(F)"]
            } else {
                ["/remove:d", "*S-1-1-0"]
            };
            let done = std::process::Command::new("icacls")
                .arg(folder)
                .args(change)
                .output()
                .unwrap();
            assert!(done.status.success());
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = if locked { 0o000 } else { 0o755 };
            fs::set_permissions(folder, fs::Permissions::from_mode(mode)).unwrap();
        }
    }

    #[test]
    fn a_folder_that_cant_be_read_is_left_out() {
        let dir = TempDir::new("locked", &["a.md", "locked/b.md", "open/c.md"]);
        let locked = dir.0.join("locked");
        lock(&locked, true);
        // A user with full rights, such as root in a container, reads it anyway.
        let unreadable = fs::read_dir(&locked).is_err();
        let found = scan(&dir.0, false);
        lock(&locked, false);
        if unreadable {
            assert_eq!(dir.found(&found.unwrap()), ["a.md", "open/c.md"]);
        }
    }

    #[test]
    fn the_scan_stops_at_the_limit_and_says_so() {
        let dir = TempDir::new("cap", &["a.md", "b.md", "c.md", "d.txt", "sub/e.md"]);
        let cut = scan_up_to(&dir.0, false, 3).unwrap();
        assert!(cut.truncated);
        assert!(cut.files.len() <= 3);

        // Files that aren't Markdown count too, so a large folder with little Markdown stops as well.
        let dir = TempDir::new("cap-other", &["a.txt", "b.txt", "c.txt"]);
        assert!(scan_up_to(&dir.0, false, 2).unwrap().truncated);
    }

    #[test]
    fn a_scan_that_reaches_the_limit_exactly_is_complete() {
        let dir = TempDir::new("cap-exact", &["a.md", "sub/b.md"]);
        let whole = scan_up_to(&dir.0, false, 3).unwrap();
        assert!(!whole.truncated);
        assert_eq!(dir.found(&whole), ["a.md", "sub/b.md"]);
        assert!(scan_up_to(&dir.0, false, 2).unwrap().truncated);
    }

    #[test]
    fn nearer_files_come_first_so_a_cut_scan_keeps_them() {
        let dir = TempDir::new("order", &["a/near.md", "b/sub/deep.md"]);
        assert_eq!(
            dir.found(&scan_up_to(&dir.0, false, 4).unwrap()),
            ["a/near.md"]
        );
    }
}
