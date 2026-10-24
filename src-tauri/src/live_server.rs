use std::fs;
use std::path::{Component, Path, PathBuf};

pub const RELOAD_SCRIPT: &str = r##"<script>
(() => {
  const source = new EventSource("/__mide/live");
  source.onmessage = () => location.reload();
})();
</script>"##;

pub struct LiveReply {
    pub status: u16,
    pub content_type: &'static str,
    pub location: Option<String>,
    pub body: Vec<u8>,
    pub events: bool,
}

fn reply(status: u16, content_type: &'static str, body: impl AsRef<[u8]>) -> LiveReply {
    LiveReply {
        status,
        content_type,
        location: None,
        body: body.as_ref().to_vec(),
        events: false,
    }
}

pub fn inject_reload(html: &str) -> String {
    let lower = html.to_ascii_lowercase();
    match lower.rfind("</body>") {
        Some(index) => {
            let mut out = String::with_capacity(html.len() + RELOAD_SCRIPT.len());
            out.push_str(&html[..index]);
            out.push_str(RELOAD_SCRIPT);
            out.push_str(&html[index..]);
            out
        }
        None => {
            let mut out = html.to_string();
            out.push_str(RELOAD_SCRIPT);
            out
        }
    }
}

fn percent_decode(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[index + 1..index + 3]).ok()?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            index += 3;
        } else {
            out.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(out).ok()
}

fn relative_target(target: &str) -> Option<PathBuf> {
    let path = target.split(['?', '#']).next().unwrap_or("");
    let decoded = percent_decode(path)?;
    if decoded.contains('\0') || decoded.contains('\\') {
        return None;
    }
    if decoded.split('/').any(|part| part == "..") {
        return None;
    }
    let trimmed = decoded.trim_start_matches('/');
    let relative = PathBuf::from(trimmed);
    if relative.components().any(|component| !matches!(component, Component::Normal(_) | Component::CurDir)) {
        return None;
    }
    Some(relative)
}

fn inside(root: &Path, relative: &Path) -> Option<PathBuf> {
    let mut current = root.to_path_buf();
    if relative.as_os_str().is_empty() {
        return Some(current);
    }
    for component in relative.components() {
        match component {
            Component::Normal(part) => {
                current.push(part);
                if current.symlink_metadata().is_ok() {
                    current = current.canonicalize().ok()?;
                    if !current.starts_with(root) {
                        return None;
                    }
                }
            }
            Component::CurDir => {}
            _ => return None,
        }
    }
    Some(current)
}

fn content_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "html" | "htm" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "txt" => "text/plain; charset=utf-8",
        "wasm" => "application/wasm",
        _ => "application/octet-stream",
    }
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn directory_listing(path: &Path) -> Option<String> {
    let mut names = Vec::new();
    for entry in fs::read_dir(path).ok()? {
        let entry = entry.ok()?;
        if let Some(name) = entry.file_name().to_str() {
            names.push(name.to_string());
        }
    }
    names.sort();
    let mut html = String::from("<!DOCTYPE html><title>Index</title><ul>");
    for name in names {
        let escaped = escape_html(&name);
        html.push_str(&format!("<li><a href=\"{escaped}\">{escaped}</a></li>"));
    }
    html.push_str("</ul>");
    Some(inject_reload(&html))
}

fn not_found() -> LiveReply {
    reply(404, "text/plain; charset=utf-8", "Not found")
}

pub fn respond(root: &Path, method: &str, target: &str) -> LiveReply {
    if method != "GET" {
        return reply(405, "text/plain; charset=utf-8", "");
    }
    let bare = target.split(['?', '#']).next().unwrap_or("");
    if bare == "/__mide/live" {
        return LiveReply {
            status: 200,
            content_type: "text/event-stream",
            location: None,
            body: Vec::new(),
            events: true,
        };
    }
    let Some(root) = root.canonicalize().ok() else {
        return not_found();
    };
    let Some(relative) = relative_target(target) else {
        return not_found();
    };
    let Some(path) = inside(&root, &relative) else {
        return not_found();
    };
    if path.is_dir() {
        let directory_url = bare == "/" || bare.ends_with('/');
        if !directory_url {
            return LiveReply {
                status: 302,
                content_type: "text/plain; charset=utf-8",
                location: Some(format!("{bare}/")),
                body: Vec::new(),
                events: false,
            };
        }
        let index = path.join("index.html");
        if index.is_file() {
            return file_reply(&index);
        }
        return match directory_listing(&path) {
            Some(html) => reply(200, "text/html; charset=utf-8", html),
            None => not_found(),
        };
    }
    if path.is_file() {
        return file_reply(&path);
    }
    not_found()
}

fn file_reply(path: &Path) -> LiveReply {
    let Ok(bytes) = fs::read(path) else {
        return not_found();
    };
    let kind = content_type(path);
    if kind.starts_with("text/html") {
        let html = String::from_utf8_lossy(&bytes);
        reply(200, kind, inject_reload(&html))
    } else {
        reply(200, kind, bytes)
    }
}

fn write_tree(root: &Path) {
    fs::create_dir_all(root.join("css")).unwrap();
    fs::write(root.join("index.html"), "<html><body>Hi</body></html>").unwrap();
    fs::write(root.join("css/app.css"), "body{color:red}").unwrap();
    fs::write(root.join("app.js"), "console.log(1)").unwrap();
    fs::write(root.join("plain.txt"), "hello").unwrap();
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp() -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "mide-live-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn root_returns_index_and_injects_before_body() {
        let root = temp();
        write_tree(&root);
        let reply = respond(&root, "GET", "/");
        let text = String::from_utf8(reply.body).unwrap();
        assert_eq!(reply.status, 200);
        assert!(text.contains("Hi"));
        assert!(text.find("EventSource").unwrap() < text.to_ascii_lowercase().rfind("</body>").unwrap());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn query_string_is_ignored() {
        let root = temp();
        write_tree(&root);
        let reply = respond(&root, "GET", "/?cache=1");
        assert_eq!(reply.status, 200);
        assert!(String::from_utf8(reply.body).unwrap().contains("Hi"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn directory_without_index_lists_children_sorted() {
        let root = temp();
        fs::create_dir_all(root.join("docs/zeta")).unwrap();
        fs::write(root.join("docs/alpha.txt"), "a").unwrap();
        let reply = respond(&root, "GET", "/docs/");
        let text = String::from_utf8(reply.body).unwrap();
        assert_eq!(reply.status, 200);
        assert!(text.find("alpha.txt").unwrap() < text.find("zeta").unwrap());
        assert!(text.contains("href=\"alpha.txt\""));
        assert!(text.contains("EventSource"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn directory_without_slash_redirects() {
        let root = temp();
        fs::create_dir_all(root.join("docs")).unwrap();
        let reply = respond(&root, "GET", "/docs");
        assert_eq!(reply.status, 302);
        assert_eq!(reply.location.as_deref(), Some("/docs/"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn missing_file_is_plain_not_found() {
        let root = temp();
        write_tree(&root);
        let reply = respond(&root, "GET", "/missing.html");
        assert_eq!(reply.status, 404);
        assert_eq!(reply.body, b"Not found");
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn rejects_escape_and_outside_symlink() {
        let root = temp();
        write_tree(&root);
        std::os::unix::fs::symlink(std::env::temp_dir(), root.join("outside")).unwrap();
        for target in ["/../secret", "/css/../../etc/passwd", "/css\\app.css", "/outside/secret"] {
            let reply = respond(&root, "GET", target);
            assert_eq!(reply.status, 404, "{target}");
            assert_eq!(reply.body, b"Not found");
        }
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn live_stream_wins_over_a_project_file() {
        let root = temp();
        fs::create_dir_all(root.join("__mide")).unwrap();
        fs::write(root.join("__mide/live"), "not a stream").unwrap();
        let reply = respond(&root, "GET", "/__mide/live");
        assert!(reply.events);
        assert!(reply.body.is_empty());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn only_get_is_served() {
        let root = temp();
        write_tree(&root);
        let reply = respond(&root, "POST", "/");
        assert_eq!(reply.status, 405);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn content_types_and_no_injection_outside_html() {
        let root = temp();
        write_tree(&root);
        let css = respond(&root, "GET", "/css/app.css");
        assert_eq!(css.content_type, "text/css; charset=utf-8");
        assert_eq!(css.body, b"body{color:red}");
        let js = respond(&root, "GET", "/app.js");
        assert_eq!(js.content_type, "text/javascript; charset=utf-8");
        assert!(!String::from_utf8(js.body.clone()).unwrap().contains("EventSource"));
        let plain = respond(&root, "GET", "/plain.txt");
        assert_eq!(plain.content_type, "text/plain; charset=utf-8");
        fs::write(root.join("pic.webp"), [1, 2, 3]).unwrap();
        assert_eq!(respond(&root, "GET", "/pic.webp").content_type, "image/webp");
        fs::write(root.join("blob.bin"), [0]).unwrap();
        assert_eq!(
            respond(&root, "GET", "/blob.bin").content_type,
            "application/octet-stream"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn script_appends_when_body_is_absent_and_uses_the_last_body() {
        assert!(inject_reload("<p>Hi</p>").ends_with("</script>"));
        assert!(inject_reload("<p>Hi</p>").contains("EventSource"));
        let html = inject_reload("<BODY>one</body><body>two</BODY>");
        let lower = html.to_ascii_lowercase();
        let script_at = lower.find("eventsource").unwrap();
        let last_body = lower.rfind("</body>").unwrap();
        assert!(script_at < last_body);
        assert_eq!(lower.matches("</body>").count(), 2);
    }
}
