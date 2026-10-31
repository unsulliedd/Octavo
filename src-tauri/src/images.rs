//! Image files for documents: which ones the webview may load beyond a document's folder, and where images
//! added to a document are linked or copied.

use std::fs::OpenOptions;
use std::io::{self, Write};
use std::path::{Component, Path, PathBuf};

const IMAGE_TYPES: &[(&str, &str)] = &[
    ("png", "image/png"),
    ("jpg", "image/jpeg"),
    ("jpeg", "image/jpeg"),
    ("jfif", "image/jpeg"),
    ("gif", "image/gif"),
    ("webp", "image/webp"),
    ("svg", "image/svg+xml"),
    ("bmp", "image/bmp"),
    ("ico", "image/x-icon"),
    ("avif", "image/avif"),
    ("apng", "image/apng"),
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

/// The content type of the image file `path`, from its extension.
pub fn content_type(path: &Path) -> Option<&'static str> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    IMAGE_TYPES
        .iter()
        .find(|(e, _)| *e == extension)
        .map(|(_, kind)| *kind)
}

fn has_image_extension(path: &Path) -> bool {
    content_type(path).is_some()
}

pub fn is_image_file(path: &Path) -> bool {
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

/// Whether `file` is inside `dir`. With `ignore_case`, letters compare without regard to case, as Windows
/// paths do.
fn is_inside(file: &Path, dir: &Path, ignore_case: bool) -> bool {
    if !ignore_case {
        return file.starts_with(dir);
    }
    let lower = |p: &Path| PathBuf::from(p.to_string_lossy().to_lowercase());
    lower(file).starts_with(lower(dir))
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
    if is_inside(file, link_root(doc_dir), cfg!(windows)) {
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

    #[test]
    fn inside_a_folder_by_case_only_when_asked() {
        let repo = Path::new("/Users/Me/Notes");
        assert!(is_inside(
            Path::new("/Users/Me/Notes/img/a.png"),
            repo,
            false
        ));
        assert!(!is_inside(
            Path::new("/users/me/notes/img/a.png"),
            repo,
            false
        ));
        assert!(is_inside(
            Path::new("/users/me/notes/img/a.png"),
            repo,
            true
        ));
        assert!(is_inside(Path::new("/USERS/ME/NOTES/a.png"), repo, true));
        // A folder whose name only starts the same isn't inside.
        assert!(!is_inside(
            Path::new("/users/me/notes-old/a.png"),
            repo,
            true
        ));
        assert!(!is_inside(Path::new("/users/me/a.png"), repo, true));
    }

    #[cfg(windows)]
    #[test]
    fn links_an_image_whose_path_differs_only_in_letter_case() {
        let root = std::env::temp_dir().join(format!("octavo-case-{}", std::process::id()));
        let docs = root.join("Notes");
        std::fs::create_dir_all(root.join(".git")).unwrap();
        std::fs::create_dir_all(docs.join("img")).unwrap();
        std::fs::write(docs.join("img").join("a.png"), b"a").unwrap();
        let other_case = PathBuf::from(
            docs.join("img")
                .join("A.PNG")
                .to_string_lossy()
                .to_uppercase(),
        );
        assert_eq!(place(&docs, &other_case).unwrap(), other_case);
        assert_eq!(
            std::fs::read_dir(docs.join("img")).unwrap().count(),
            1,
            "nothing was copied"
        );
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn windows_paths() {
        assert_eq!(kept(&[r"C:\Docs\img\a.PNG"]), [r"C:\Docs\img\a.PNG"]);
        assert!(kept(&[r"C:\Docs\..\a.png", r"img\a.png"]).is_empty());
        assert_eq!(
            kept(&[r"\\server\share\img\a.png"]),
            [r"\\server\share\img\a.png"]
        );
        assert!(kept(&[r"\\server\share\..\a.png", r"\\server\share\a.md"]).is_empty());
    }

    // Runs through the C$ share where Windows offers it; there is nothing to test without one.
    #[cfg(windows)]
    #[test]
    fn places_and_saves_images_on_a_network_share() {
        let local = std::env::temp_dir().join(format!("octavo-share-{}", std::process::id()));
        let Some(rest) = local.to_str().and_then(|p| p.strip_prefix(r"C:\")) else {
            return;
        };
        let root = PathBuf::from(format!(r"\\localhost\C$\{rest}"));
        if !Path::new(r"\\localhost\C$\Windows").exists() {
            return;
        }
        let docs = root.join("docs");
        std::fs::create_dir_all(docs.join("img")).unwrap();
        std::fs::create_dir_all(local.join("elsewhere")).unwrap();
        std::fs::write(local.join("elsewhere").join("b.png"), b"b").unwrap();
        std::fs::write(docs.join("a.png"), b"a").unwrap();

        assert_eq!(image_dir(&docs), docs.join("img"));
        let saved = save_new(&image_dir(&docs), "shot.png", b"s").unwrap();
        assert_eq!(saved, docs.join("img").join("shot.png"));
        assert_eq!(
            place(&docs, &docs.join("a.png")).unwrap(),
            docs.join("a.png")
        );
        let copied = place(&docs, &local.join("elsewhere").join("b.png")).unwrap();
        assert_eq!(copied, docs.join("img").join("b.png"));
        assert_eq!(std::fs::read(&copied).unwrap(), b"b");
        std::fs::remove_dir_all(&local).unwrap();
    }
}
