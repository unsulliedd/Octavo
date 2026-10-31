//! The `asset` protocol, which shows a document's images. A document can name any path here, so whether a path may
//! be read is decided from its text first: even asking whether a network path exists makes Windows send the user's
//! credentials to that server. A path that passes is then read only if no symbolic link leads to it, since a link
//! can point at a network path too.

use crate::images;
use percent_encoding::percent_decode_str;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::http::{Response, StatusCode, header::CONTENT_TYPE};

/// The folders and files the webview may load images from. A folder includes everything below it.
#[derive(Default)]
pub struct Allowed(Mutex<HashSet<PathBuf>>);

/// `path` as allowed paths compare. Windows paths ignore case, but only for ASCII letters, so that no other
/// server name can compare equal to an allowed one.
fn key(path: &Path) -> PathBuf {
    if cfg!(windows) {
        path.to_string_lossy().to_ascii_lowercase().into()
    } else {
        path.to_path_buf()
    }
}

impl Allowed {
    pub fn add(&self, path: &Path) {
        self.0.lock().unwrap().insert(key(path));
    }

    /// Whether `path` is an image file that is allowed or inside an allowed folder. Touches nothing on disk.
    fn allows(&self, path: &Path) -> bool {
        let allowed = self.0.lock().unwrap();
        images::is_image_file(path) && path.ancestors().any(|p| allowed.contains(&key(p)))
    }

    /// Whether a symbolic link leads to the allowed `path`. The entries below its allowed folder are looked at from
    /// the top down, so each is read without following a link above it.
    fn through_link(&self, path: &Path) -> bool {
        let steps: Vec<&Path> = {
            let allowed = self.0.lock().unwrap();
            let folder = |step: &&Path| *step != path && allowed.contains(&key(step));
            path.ancestors().take_while(|step| !folder(step)).collect()
        };
        steps
            .iter()
            .rev()
            .any(|step| std::fs::symlink_metadata(step).is_ok_and(|entry| entry.is_symlink()))
    }
}

/// The answer to a request for `uri_path`: the file it encodes after a leading `/`, or an empty failure that the
/// webview shows as a missing image.
// Limitation: an image behind a symbolic link shows as missing, even when the link stays on this computer.
pub fn respond(allowed: &Allowed, uri_path: &str) -> Response<Vec<u8>> {
    let failure = |status: StatusCode| Response::builder().status(status).body(Vec::new()).unwrap();
    let path = uri_path
        .strip_prefix('/')
        .and_then(|p| percent_decode_str(p).decode_utf8().ok());
    let path = path.as_deref().map(Path::new);
    let Some(path) = path.filter(|p| allowed.allows(p) && !allowed.through_link(p)) else {
        return failure(StatusCode::FORBIDDEN);
    };
    match std::fs::read(path) {
        Ok(bytes) => Response::builder()
            .header(CONTENT_TYPE, images::content_type(path).unwrap_or_default())
            .body(bytes)
            .unwrap(),
        Err(_) => failure(StatusCode::NOT_FOUND),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use percent_encoding::{NON_ALPHANUMERIC, utf8_percent_encode};

    fn allowed(paths: &[&str]) -> Allowed {
        let allowed = Allowed::default();
        paths.iter().for_each(|p| allowed.add(Path::new(p)));
        allowed
    }

    fn uri(path: &Path) -> String {
        format!(
            "/{}",
            utf8_percent_encode(&path.to_string_lossy(), NON_ALPHANUMERIC)
        )
    }

    /// None of these paths exist, so a path that passes was decided from its text.
    #[cfg(windows)]
    #[test]
    fn a_windows_path_passes_only_inside_a_listed_folder_or_as_a_listed_file() {
        let a = allowed(&[r"C:\docs", r"\\server\share\docs", r"D:\pics\one.png"]);
        for path in [
            r"C:\docs\a.png",
            r"C:\docs\img\deep\a.svg",
            r"C:/docs/img/a.png",
            r"c:\DOCS\IMG\A.PNG",
            r"\\server\share\docs\a.png",
            r"\\SERVER\Share\Docs\img\a.png",
            r"//server/share/docs/a.png",
            r"D:\pics\one.png",
            r"d:\PICS\ONE.PNG",
        ] {
            assert!(a.allows(Path::new(path)), "{path}");
        }
        for path in [
            r"\\other\share\docs\a.png",
            r"\\server\share\a.png",
            r"\\server\share\docs2\a.png",
            r"\\127.0.0.2\share\docs\a.png",
            r"//other/share/a.png",
            r"C:\docs2\a.png",
            r"C:\docs.png",
            r"C:\a.png",
            r"D:\pics\two.png",
            r"D:\pics\one.png.png",
            r"C:\docs\..\secret.png",
            r"C:\docs\img\..\..\secret.png",
            r"C:/docs/../secret.png",
            r"C:\docs\..\docs\a.png",
            r"\\server\share\docs\..\..\other\a.png",
            r"\\?\C:\docs\a.png",
            r"\\.\C:\docs\a.png",
            r"\??\C:\docs\a.png",
            r"\\?\UNC\server\share\docs\a.png",
            r"\\.\UNC\server\share\docs\a.png",
            r"//?/UNC/server/share/docs/a.png",
            r"\\.\pipe\a.png",
            r"docs\a.png",
            r"C:docs\a.png",
            r"\docs\a.png",
            "",
        ] {
            assert!(!a.allows(Path::new(path)), "{path}");
        }
    }

    #[cfg(windows)]
    #[test]
    fn only_ascii_letters_ignore_case() {
        let a = allowed(&[r"\\kserver\share"]);
        assert!(a.allows(Path::new(r"\\KSERVER\share\a.png")));
        assert!(
            !a.allows(Path::new("\\\\\u{212A}server\\share\\a.png")),
            "Kelvin sign"
        );
    }

    #[cfg(windows)]
    #[test]
    fn only_images_pass_and_nothing_windows_reads_specially() {
        let a = allowed(&[r"C:\docs"]);
        for path in [
            r"C:\docs\notes.txt",
            r"C:\docs\a",
            r"C:\docs\CON",
            r"C:\docs\NUL",
            r"C:\docs\COM1",
            r"C:\docs\a.png:stream",
            r"C:\docs\a.png.",
            r"C:\docs\a.png ",
        ] {
            assert!(!a.allows(Path::new(path)), "{path}");
        }
    }

    #[cfg(unix)]
    #[test]
    fn a_unix_path_passes_only_inside_a_listed_folder_or_as_a_listed_file() {
        let a = allowed(&["/docs", "/pics/one.png"]);
        for path in ["/docs/a.png", "/docs/img/a.svg", "/pics/one.png"] {
            assert!(a.allows(Path::new(path)), "{path}");
        }
        for path in [
            "/docs2/a.png",
            "/a.png",
            "/pics/two.png",
            "/docs/../a.png",
            "/docs/notes.txt",
            "/Docs/a.png",
            "docs/a.png",
            "",
        ] {
            assert!(!a.allows(Path::new(path)), "{path}");
        }
    }

    #[test]
    fn a_listed_file_is_served_with_its_type_and_others_are_refused() {
        let dir = std::env::temp_dir().join("octavo-asset-test");
        let listed = dir.join("listed folder");
        std::fs::create_dir_all(&listed).unwrap();
        std::fs::write(listed.join("a b.svg"), "<svg/>").unwrap();
        std::fs::write(listed.join("notes.txt"), "text").unwrap();
        std::fs::write(dir.join("outside.png"), "png").unwrap();
        let a = Allowed::default();
        a.add(&listed);

        let served = respond(&a, &uri(&listed.join("a b.svg")));
        assert_eq!(served.status(), StatusCode::OK);
        assert_eq!(served.headers()[CONTENT_TYPE], "image/svg+xml");
        assert_eq!(served.body(), b"<svg/>");

        assert_eq!(
            respond(&a, &uri(&listed.join("missing.png"))).status(),
            StatusCode::NOT_FOUND
        );
        for refused in [
            uri(&dir.join("outside.png")),
            uri(&listed.join("notes.txt")),
            uri(&listed.join("..").join("outside.png")),
            "/%FF.png".to_string(),
            "/".to_string(),
            String::new(),
        ] {
            let answer = respond(&a, &refused);
            assert_eq!(answer.status(), StatusCode::FORBIDDEN, "{refused}");
            assert!(answer.body().is_empty(), "{refused}");
        }
        std::fs::remove_dir_all(&dir).unwrap();
    }

    /// Links `at` to `target`. On Windows a folder link is a junction, which needs no special rights; a file link
    /// needs Developer Mode or elevation, so it can fail there.
    fn link(target: &Path, at: &Path) -> bool {
        #[cfg(unix)]
        return std::os::unix::fs::symlink(target, at).is_ok();
        #[cfg(windows)]
        return if target.is_dir() {
            std::process::Command::new("cmd")
                .args(["/C", "mklink", "/J"])
                .args([at, target])
                .output()
                .is_ok_and(|done| done.status.success())
        } else {
            std::os::windows::fs::symlink_file(target, at).is_ok()
        };
    }

    #[test]
    fn a_path_through_a_symbolic_link_is_refused() {
        let dir = std::env::temp_dir().join(format!("octavo-asset-link-{}", std::process::id()));
        let (listed, outside) = (dir.join("listed"), dir.join("outside"));
        std::fs::create_dir_all(&listed).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::write(listed.join("real.png"), "png").unwrap();
        std::fs::write(outside.join("a.png"), "png").unwrap();
        assert!(link(&outside, &listed.join("folder")));
        assert!(link(&outside, &dir.join("beside")));
        let mut refused = vec![
            listed.join("folder").join("a.png"),
            dir.join("beside").join("a.png"),
        ];
        if link(&outside.join("a.png"), &listed.join("file.png")) {
            refused.push(listed.join("file.png"));
        }
        let a = Allowed::default();
        a.add(&listed);
        a.add(&dir.join("beside").join("a.png"));

        assert_eq!(
            respond(&a, &uri(&listed.join("real.png"))).status(),
            StatusCode::OK
        );
        for path in refused {
            let answer = respond(&a, &uri(&path));
            assert_eq!(answer.status(), StatusCode::FORBIDDEN, "{path:?}");
        }
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_network_path_is_refused_as_written_or_encoded() {
        let a = allowed(&["C:/docs", "/docs"]);
        for uri_path in [
            "/%5C%5C127.0.0.2%5Cshare%5Ca.png",
            "///127.0.0.2/share/a.png",
            "/%2F%2F127.0.0.2%2Fshare%2Fa.png",
        ] {
            assert_eq!(
                respond(&a, uri_path).status(),
                StatusCode::FORBIDDEN,
                "{uri_path}"
            );
        }
    }
}
