//! Image files for documents: which ones the webview may load beyond a document's folder, and where images
//! added to a document are linked or copied.

use std::fs::OpenOptions;
use std::io::{self, Write};
use std::path::{Component, Path, PathBuf};

const IMAGE_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif", "apng",
];

/// The paths, out of `paths`, that are absolute image files without `..` components.
/// Anything else (other file types, relative paths, paths that climb with `..`) is left out.
pub fn image_files(paths: &[String]) -> Vec<PathBuf> {
    paths
        .iter()
        .map(PathBuf::from)
        .filter(|p| is_image_file(p))
        .collect()
}

fn has_image_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| IMAGE_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
}

fn is_image_file(path: &Path) -> bool {
    let normalized = path.components().all(|c| c != Component::ParentDir);
    path.is_absolute() && normalized && has_image_extension(path)
}

/// Writes a new image file in `dir`: `name`, or `name-1`, `name-2` and so on when that file exists. An
/// existing file is never replaced. `name` must be a plain image file name, without folders.
pub fn save_new(dir: &Path, name: &str, bytes: &[u8]) -> io::Result<PathBuf> {
    let file = Path::new(name);
    let plain = matches!(
        file.components().collect::<Vec<_>>()[..],
        [Component::Normal(_)]
    );
    if !plain || !has_image_extension(file) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "not an image file name",
        ));
    }
    let stem = file.file_stem().unwrap_or_default().to_string_lossy();
    let ext = file.extension().unwrap_or_default().to_string_lossy();
    for n in 0..1000 {
        let path = dir.join(if n == 0 {
            name.to_string()
        } else {
            format!("{stem}-{n}.{ext}")
        });
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut out) => {
                if let Err(e) = out.write_all(bytes) {
                    drop(out);
                    let _ = std::fs::remove_file(&path);
                    return Err(e);
                }
                return Ok(path);
            }
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e),
        }
    }
    Err(io::Error::new(
        io::ErrorKind::AlreadyExists,
        "no free file name",
    ))
}

/// Where new images for a document in `doc_dir` go: its `img`, `images` or `assets` folder, the first that
/// exists, or else `doc_dir` itself.
pub fn image_dir(doc_dir: &Path) -> PathBuf {
    ["img", "images", "assets"]
        .iter()
        .map(|name| doc_dir.join(name))
        .find(|dir| dir.is_dir())
        .unwrap_or_else(|| doc_dir.to_path_buf())
}

/// The folder whose files a document in `doc_dir` can link and still show them after a commit and clone: the
/// nearest folder holding `.git`, or `doc_dir` when the document isn't in a repository.
fn link_root(doc_dir: &Path) -> &Path {
    doc_dir
        .ancestors()
        .find(|dir| dir.join(".git").exists())
        .unwrap_or(doc_dir)
}

/// The image file a document in `doc_dir` links for `file`: `file` itself when it is inside the document's
/// repository (or folder), otherwise a copy of it in the document's image folder.
pub fn place(doc_dir: &Path, file: &Path) -> io::Result<PathBuf> {
    if !is_image_file(file) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "not an image file",
        ));
    }
    // Limitation: paths compare by their text, so a different letter case on Windows copies instead of linking
    if file.starts_with(link_root(doc_dir)) {
        return Ok(file.to_path_buf());
    }
    let name = file.file_name().unwrap_or_default().to_string_lossy();
    save_new(&image_dir(doc_dir), &name, &std::fs::read(file)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn kept(paths: &[&str]) -> Vec<String> {
        let paths: Vec<String> = paths.iter().map(|p| p.to_string()).collect();
        image_files(&paths)
            .into_iter()
            .map(|p| p.to_string_lossy().into_owned())
            .collect()
    }

    // On Windows these paths have no drive and aren't absolute; `windows_paths` covers that platform.
    #[cfg(unix)]
    #[test]
    fn keeps_absolute_image_paths() {
        assert_eq!(
            kept(&["/docs/img/a.png", "/docs/B.JPG", "/shared/diagram.svg"]),
            ["/docs/img/a.png", "/docs/B.JPG", "/shared/diagram.svg"]
        );
    }

    #[test]
    fn leaves_out_other_files_relative_paths_and_parent_dirs() {
        assert!(
            kept(&[
                "/home/u/.ssh/id_rsa",
                "/docs/notes.md",
                "/docs/png",
                "/docs/a.png.exe"
            ])
            .is_empty()
        );
        assert!(kept(&["img/a.png", "../a.png"]).is_empty());
        assert!(kept(&["/docs/../secret/a.png"]).is_empty());
    }

    #[test]
    fn saves_new_images_without_replacing_files() {
        let dir = std::env::temp_dir().join(format!("octavo-images-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let first = save_new(&dir, "shot.png", b"one").unwrap();
        let second = save_new(&dir, "shot.png", b"two").unwrap();
        assert_eq!(first, dir.join("shot.png"));
        assert_eq!(second, dir.join("shot-1.png"));
        assert_eq!(std::fs::read(&first).unwrap(), b"one");
        assert_eq!(std::fs::read(&second).unwrap(), b"two");
        for bad in ["../shot.png", "sub/shot.png", "notes.md", "shot", ""] {
            assert!(save_new(&dir, bad, b"x").is_err(), "{bad}");
        }
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn links_images_in_the_repository_and_copies_the_rest() {
        let root = std::env::temp_dir().join(format!("octavo-place-{}", std::process::id()));
        let repo = root.join("repo");
        let docs = repo.join("docs");
        std::fs::create_dir_all(repo.join(".git")).unwrap();
        std::fs::create_dir_all(repo.join("shared")).unwrap();
        std::fs::create_dir_all(root.join("downloads")).unwrap();
        std::fs::create_dir_all(&docs).unwrap();
        std::fs::write(repo.join("shared").join("a.png"), b"a").unwrap();
        std::fs::write(root.join("downloads").join("b.png"), b"b").unwrap();

        assert_eq!(image_dir(&docs), docs);
        let inside = repo.join("shared").join("a.png");
        assert_eq!(place(&docs, &inside).unwrap(), inside);
        let copied = place(&docs, &root.join("downloads").join("b.png")).unwrap();
        assert_eq!(copied, docs.join("b.png"));

        std::fs::create_dir_all(docs.join("images")).unwrap();
        assert_eq!(image_dir(&docs), docs.join("images"));
        let again = place(&docs, &root.join("downloads").join("b.png")).unwrap();
        assert_eq!(again, docs.join("images").join("b.png"));
        assert_eq!(std::fs::read(&again).unwrap(), b"b");
        assert!(place(&docs, &docs.join("notes.md")).is_err());
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn windows_paths() {
        assert_eq!(kept(&[r"C:\Docs\img\a.PNG"]), [r"C:\Docs\img\a.PNG"]);
        assert!(kept(&[r"C:\Docs\..\a.png", r"img\a.png"]).is_empty());
    }
}
