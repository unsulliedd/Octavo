//! Workspace cover images: copies of the pictures the user chose, kept in one folder of the app's data folder and
//! named after their workspace's id.

use crate::images;
use crate::save::write_atomic;
use std::fs;
use std::io;
use std::path::Path;

/// Whether `name` can be a cover's file name: a single name, with nothing that leads out of the covers folder.
pub fn plain_name(name: &str) -> bool {
    !name.is_empty() && !name.contains("..") && !name.contains(['/', '\\', ':'])
}

/// Whether `id` can name a cover file: letters, digits, `-` and `_` only.
fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn invalid(what: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, what.to_string())
}

/// Deletes the covers of `id` in `dir`, except the file `keep`. A missing folder holds none.
fn remove_except(dir: &Path, id: &str, keep: Option<&str>) -> io::Result<()> {
    let entries = match fs::read_dir(dir) {
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(()),
        entries => entries?,
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if Path::new(&*name).file_stem() == Some(id.as_ref()) && keep != Some(&*name) {
            fs::remove_file(entry.path())?;
        }
    }
    Ok(())
}

/// Copies the image `source` into `dir` as `<id>.<extension>` and deletes any earlier cover of `id`; returns the new
/// file's name.
pub fn set(dir: &Path, id: &str, source: &Path) -> io::Result<String> {
    if !valid_id(id) {
        return Err(invalid("not a workspace id"));
    }
    let extension = images::content_type(source)
        .and(source.extension())
        .ok_or_else(|| invalid("not an image file"))?;
    let name = format!("{id}.{}", extension.to_string_lossy().to_ascii_lowercase());
    let bytes = fs::read(source)?;
    fs::create_dir_all(dir)?;
    write_atomic(&dir.join(&name), &bytes)?;
    remove_except(dir, id, Some(&name))?;
    Ok(name)
}

/// Deletes the cover of `id` in `dir`, if it has one.
pub fn remove(dir: &Path, id: &str) -> io::Result<()> {
    if !valid_id(id) {
        return Err(invalid("not a workspace id"));
    }
    remove_except(dir, id, None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::asset::{Allowed, respond, tests::uri};
    use std::path::PathBuf;
    use tauri::http::StatusCode;

    struct TempDir(PathBuf);
    impl TempDir {
        fn new(name: &str) -> Self {
            let dir =
                std::env::temp_dir().join(format!("octavo-covers-{name}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).unwrap();
            TempDir(dir)
        }
        fn covers(&self) -> PathBuf {
            self.0.join("covers")
        }
        fn names(&self) -> Vec<String> {
            let mut names: Vec<String> = fs::read_dir(self.covers())
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
    fn a_new_cover_replaces_the_earlier_one_and_leaves_other_workspaces_alone() {
        let dir = TempDir::new("set");
        let (png, jpg) = (dir.0.join("a.PNG"), dir.0.join("b.jpg"));
        fs::write(&png, "png").unwrap();
        fs::write(&jpg, "jpg").unwrap();
        assert_eq!(set(&dir.covers(), "w1", &png).unwrap(), "w1.png");
        assert_eq!(set(&dir.covers(), "w2", &png).unwrap(), "w2.png");
        assert_eq!(set(&dir.covers(), "w1", &jpg).unwrap(), "w1.jpg");
        assert_eq!(dir.names(), ["w1.jpg", "w2.png"]);
        assert_eq!(
            fs::read_to_string(dir.covers().join("w1.jpg")).unwrap(),
            "jpg"
        );
        fs::write(&jpg, "new").unwrap();
        assert_eq!(set(&dir.covers(), "w1", &jpg).unwrap(), "w1.jpg");
        assert_eq!(
            fs::read_to_string(dir.covers().join("w1.jpg")).unwrap(),
            "new"
        );
        assert!(png.exists() && jpg.exists());
    }

    #[test]
    fn remove_deletes_only_that_workspaces_cover() {
        let dir = TempDir::new("remove");
        let png = dir.0.join("a.png");
        fs::write(&png, "png").unwrap();
        set(&dir.covers(), "w1", &png).unwrap();
        set(&dir.covers(), "w2", &png).unwrap();
        remove(&dir.covers(), "w1").unwrap();
        assert_eq!(dir.names(), ["w2.png"]);
        remove(&dir.covers(), "w1").unwrap();
        assert!(remove(&dir.0.join("none"), "w1").is_ok());
    }

    #[test]
    fn bad_ids_and_files_that_arent_images_are_refused() {
        let dir = TempDir::new("refused");
        let (png, txt) = (dir.0.join("a.png"), dir.0.join("a.txt"));
        fs::write(&png, "png").unwrap();
        fs::write(&txt, "txt").unwrap();
        for id in ["", "..", "../w1", r"..\w1", "a/b", "a.b", "C:w1"] {
            assert!(set(&dir.covers(), id, &png).is_err(), "{id}");
            assert!(remove(&dir.covers(), id).is_err(), "{id}");
        }
        assert!(set(&dir.covers(), "w1", &txt).is_err());
        assert!(set(&dir.covers(), "w1", &dir.0.join("missing.png")).is_err());
        assert!(!dir.covers().exists());
    }

    #[test]
    fn only_plain_file_names_are_cover_names() {
        assert!(plain_name("w1.png"));
        for name in [
            "",
            "..",
            "../a.png",
            r"..\a.png",
            "a/b.png",
            r"a\b.png",
            "C:a.png",
            "a..png",
            r"C:\a.png",
            "/a.png",
        ] {
            assert!(!plain_name(name), "{name}");
        }
    }

    #[test]
    fn the_gate_allows_the_covers_folder_and_nothing_beside_or_above_it() {
        let dir = TempDir::new("gate");
        let source = dir.0.join("source.png");
        fs::write(&source, "png").unwrap();
        fs::write(dir.0.join("workspaces.json"), "{}").unwrap();
        let name = set(&dir.covers(), "w1", &source).unwrap();
        let allowed = Allowed::default();
        allowed.add(&dir.covers());
        assert_eq!(
            respond(&allowed, &uri(&dir.covers().join(&name))).status(),
            StatusCode::OK
        );
        for refused in [
            dir.0.join("workspaces.json"),
            source,
            dir.covers().join("..").join("source.png"),
            dir.0.clone(),
        ] {
            assert_eq!(
                respond(&allowed, &uri(&refused)).status(),
                StatusCode::FORBIDDEN,
                "{refused:?}"
            );
        }
    }
}
