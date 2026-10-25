# Live Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the open project as static HTML, CSS, and JavaScript from mIDE, open it in the system browser, and reload those pages after a file is written.

**Architecture:** A Rust thread accepts HTTP on `127.0.0.1` and answers from the workspace root. HTML responses include a small Server-Sent Events script; a file watcher sends one `reload` message after disk writes settle. The status bar starts and stops that thread. The system browser is a separate process.

**Tech Stack:** Tauri 2, Rust (`std::net`, existing `notify` 6), React 19, TypeScript, Vitest. No new HTTP or WebSocket crate. No Node server.

## Global Constraints

- Listen only on `127.0.0.1`. Ports are `5500` through `5509` inclusive, in that order.
- `GET /` returns root `index.html`. A directory with no `index.html` returns a plain HTML list of child names, directories and files together, sorted by name, each name a link.
- Missing file: status 404 and body text `Not found`. The server keeps running.
- Reject `..`, a backslash, or a symlink whose canonical target is outside the project. Ignore the query string.
- Only `GET` is served. Any other method returns 405.
- Unknown file types are `application/octet-stream`.
- If every port is busy, do not start. The error strip says `Live Server could not find a free port.`
- If the browser cannot be opened, the server still runs and the error strip says `Could not open the browser. Open http://127.0.0.1:{port}`.
- If watching cannot start, pages still load and the error strip says `Live Server cannot watch files for reload.`
- Status copy is exact: `Go Live`, `Start Live Server`, `Port: {port}`, `Stop Live Server`, `Live Server started at http://127.0.0.1:{port}`, `Live Server stopped`.
- Dots are 6px and fixed: `#c44747` stopped, `#2f9e57` running.
- A click on Go Live, Stop, or Open in Browser during a start or stop that has not finished yet does nothing.
- `GET /__mide/live` is the event stream even when a project file has that path. Each reload message's data is `reload`.
- Watch recursively, ignore the initial scan, and coalesce create, modify, and remove events for 200ms. Unsaved editor buffers do not reload.
- `live_server_start` takes no path. With no project it returns an error and does not listen. `live_server_open` does not start or restart the server and fails if it is not running.
- Closing the window and switching projects stop the server. Focus Mode hides the status bar and leaves the server running.
- Open in Browser appears only for the project-root file whose path is `index.html`.
- No preview pane, no Node, no Vite, no project command, no HTTPS, no configurable port.
- Rust toolchain for this machine is `CARGO_HOME=/tmp/mide-cargo`, `RUSTUP_HOME=/tmp/mide-rustup`, and `PATH="/tmp/mide-cargo/bin:$PATH"`. Do not download rustup. Release builds need an unsandboxed shell because the sandbox redirects the cargo target directory.
- Do not push. Commit only the steps in this plan.

## File structure

- Create `src-tauri/src/live_server.rs` — path checks, content types, HTML injection, the accept loop, the watcher, and the three Tauri commands.
- Modify `src-tauri/src/lib.rs` — declare the module, store its state, stop it when the window is destroyed, and register the commands in both handler lists.
- Create `src/lib/live-server.ts` — labels, status text, and the root-`index.html` menu rule. Tests cover these without a browser.
- Modify `src/lib/backend.ts` — invoke wrappers.
- Modify `src/App.tsx` — status button, status row, project-switch stop, and the menu action.
- Modify `src/components/Explorer.tsx` — menu item.
- Modify `src/styles/app.css` — dot colors and the status row.
- Modify `README.md` and `DESIGN.md` — the two documentation sentences required by the spec.
- Test `src-tauri/src/live_server.rs` (`mod tests`) and `tests/live-server.test.ts`.

---

### Task 1: Request resolution

**Files:**
- Create: `src-tauri/src/live_server.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod live_server;`)
- Test: `src-tauri/src/live_server.rs` (`mod tests`)

**Interfaces:**
- Consumes: nothing
- Produces:
  - `pub struct LiveReply { pub status: u16, pub content_type: &'static str, pub location: Option<String>, pub body: Vec<u8>, pub events: bool }`
  - `pub fn respond(root: &Path, method: &str, target: &str) -> LiveReply`
  - `pub fn inject_reload(html: &str) -> String`
  - `pub const RELOAD_SCRIPT: &str` — the exact script in the spec

`respond` canonicalizes `root` itself. `events` is true only for `GET /__mide/live`. A directory URL other than `/` that does not end in `/` returns status 302 and `location` set to that path plus `/`, so relative links from nested pages work. `/` is already a directory URL and serves `index.html` or the listing directly.

- [ ] **Step 1: Write the failing test**

Add `mod live_server;` next to the other module declarations in `src-tauri/src/lib.rs`. Create `src-tauri/src/live_server.rs` with only this test module and a stub `respond` that the compiler can see fail at runtime:

```rust
use std::fs;
use std::path::{Path, PathBuf};

pub struct LiveReply {
    pub status: u16,
    pub content_type: &'static str,
    pub location: Option<String>,
    pub body: Vec<u8>,
    pub events: bool,
}

pub fn respond(_root: &Path, _method: &str, _target: &str) -> LiveReply {
    unimplemented!("request resolution")
}

pub fn inject_reload(html: &str) -> String {
    let _ = html;
    unimplemented!("reload injection")
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
export CARGO_HOME=/tmp/mide-cargo
export RUSTUP_HOME=/tmp/mide-rustup
export PATH="/tmp/mide-cargo/bin:$PATH"
cargo test --manifest-path src-tauri/Cargo.toml live_server::tests -- --test-threads=1
```

Expected: FAIL with `request resolution` or `reload injection`.

- [ ] **Step 3: Write the resolution code**

Replace the stubs in `src-tauri/src/live_server.rs` with the implementation below. Keep the tests.

```rust
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run the same `cargo test` command from Step 2.

Expected: PASS for every `live_server::tests` test.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/live_server.rs src-tauri/src/lib.rs
git commit -m "$(cat <<'EOF'
Resolve Live Server paths inside the open project.

EOF
)"
```

---

### Task 2: Bind, serve, and reload

**Files:**
- Modify: `src-tauri/src/live_server.rs`
- Test: `src-tauri/src/live_server.rs` (`mod tests`)

**Interfaces:**
- Consumes: `respond`, `LiveReply` from Task 1
- Produces:
  - `pub const LIVE_PORTS: std::ops::RangeInclusive<u16>` = `5500..=5509`
  - `pub fn bind_first(ports: &[u16]) -> std::io::Result<(std::net::TcpListener, u16)>`
  - `pub struct Debounce { ... }` with `pub fn new(delay: Duration) -> Self`, `pub fn arm(&mut self, now: Instant)`, and `pub fn poll(&mut self, now: Instant) -> bool`
  - `pub fn serve(listener: TcpListener, root: PathBuf, shutdown: Receiver<()>, reloads: Receiver<()>)`
  - `pub fn open_browser(url: &str) -> std::io::Result<()>`
  - `pub fn start_watch(root: &Path, events: Sender<()>) -> notify::Result<notify::RecommendedWatcher>`

`poll` returns true once when `delay` has elapsed since the oldest `arm` that has not yet fired. A burst of `arm` calls in that window still returns true only once. `serve` writes a normal HTTP response for every `LiveReply` whose `events` is false, including `Location` when `location` is set. For `events`, it writes SSE headers and keeps the socket. Each value received on `reloads` writes `data: reload\n\n` to every kept socket. `start_watch` ignores access events and ignores every event in the first 300ms after the watch starts. A later thread, added in Task 3, owns the 200ms `Debounce` between the watcher and `serve`.

- [ ] **Step 1: Write the failing test**

Append these tests inside the existing `mod tests`:

```rust
use std::io::{Read, Write};
use std::net::{Ipv4Addr, TcpListener, TcpStream};
use std::time::{Duration, Instant};

#[test]
fn ports_are_5500_through_5509() {
    assert_eq!(*LIVE_PORTS.start(), 5500);
    assert_eq!(*LIVE_PORTS.end(), 5509);
}

#[test]
fn bind_skips_a_busy_port() {
    let busy = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
    let busy_port = busy.local_addr().unwrap().port();
    let (_listener, port) = bind_first(&[busy_port, 0]).unwrap();
    assert_ne!(port, busy_port);
}

#[test]
fn bind_fails_when_every_port_is_busy() {
    let first = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
    let second = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
    let ports = [
        first.local_addr().unwrap().port(),
        second.local_addr().unwrap().port(),
    ];
    assert!(bind_first(&ports).is_err());
}

#[test]
fn debounce_collapses_a_burst_into_one_reload() {
    let mut debounce = Debounce::new(Duration::from_millis(200));
    let start = Instant::now();
    debounce.arm(start);
    debounce.arm(start + Duration::from_millis(50));
    assert!(!debounce.poll(start + Duration::from_millis(199)));
    assert!(debounce.poll(start + Duration::from_millis(200)));
    assert!(!debounce.poll(start + Duration::from_millis(250)));
}

#[test]
fn server_reloads_connected_pages_once() {
    let root = temp();
    fs::write(root.join("index.html"), "<html><body>Hi</body></html>").unwrap();
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
    let port = listener.local_addr().unwrap().port();
    let (shutdown_tx, shutdown_rx) = std::sync::mpsc::channel();
    let (reload_tx, reload_rx) = std::sync::mpsc::channel();
    let served = root.clone();
    let thread = std::thread::spawn(move || serve(listener, served, shutdown_rx, reload_rx));
    let mut page = TcpStream::connect((Ipv4Addr::LOCALHOST, port)).unwrap();
    page.write_all(b"GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n").unwrap();
    let mut buffer = Vec::new();
    page.read_to_end(&mut buffer).unwrap();
    assert!(String::from_utf8_lossy(&buffer).contains("EventSource"));
    let mut events = TcpStream::connect((Ipv4Addr::LOCALHOST, port)).unwrap();
    events.write_all(b"GET /__mide/live HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n").unwrap();
    events.set_read_timeout(Some(Duration::from_millis(200))).unwrap();
    reload_tx.send(()).unwrap();
    let mut event = String::new();
    let deadline = Instant::now() + Duration::from_secs(2);
    while Instant::now() < deadline && !event.contains("data: reload") {
        let mut chunk = [0; 256];
        match events.read(&mut chunk) {
            Ok(0) => break,
            Ok(count) => event.push_str(&String::from_utf8_lossy(&chunk[..count])),
            Err(error)
                if error.kind() == std::io::ErrorKind::WouldBlock
                    || error.kind() == std::io::ErrorKind::TimedOut => {}
            Err(_) => break,
        }
    }
    assert!(event.contains("data: reload\n"), "{event}");
    let _ = shutdown_tx.send(());
    thread.join().unwrap();
    let _ = fs::remove_dir_all(root);
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run the Task 1 cargo command.

Expected: FAIL because `LIVE_PORTS`, `bind_first`, `Debounce`, or `serve` is missing.

- [ ] **Step 3: Add the server**

Add these imports at the top of `src-tauri/src/live_server.rs`:

```rust
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::io::{Read, Write};
use std::net::{Ipv4Addr, TcpListener, TcpStream};
use std::process::{Command, Stdio};
use std::sync::mpsc::{Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
```

Add this code after `file_reply`:

```rust
pub const LIVE_PORTS: std::ops::RangeInclusive<u16> = 5500..=5509;

pub fn bind_first(ports: &[u16]) -> std::io::Result<(TcpListener, u16)> {
    let mut last = std::io::Error::from(std::io::ErrorKind::AddrInUse);
    for port in ports {
        match TcpListener::bind((Ipv4Addr::LOCALHOST, *port)) {
            Ok(listener) => return Ok((listener, listener.local_addr()?.port())),
            Err(error) if error.kind() == std::io::ErrorKind::AddrInUse => last = error,
            Err(error) => return Err(error),
        }
    }
    Err(last)
}

pub struct Debounce {
    delay: Duration,
    armed: Option<Instant>,
}

impl Debounce {
    pub fn new(delay: Duration) -> Self {
        Self { delay, armed: None }
    }

    pub fn arm(&mut self, now: Instant) {
        if self.armed.is_none() {
            self.armed = Some(now);
        }
    }

    pub fn poll(&mut self, now: Instant) -> bool {
        match self.armed {
            Some(started) if now.duration_since(started) >= self.delay => {
                self.armed = None;
                true
            }
            _ => false,
        }
    }
}

fn read_request(stream: &mut TcpStream) -> std::io::Result<(String, String)> {
    let mut buffer = Vec::new();
    let mut byte = [0];
    while buffer.len() < 8192 {
        if stream.read(&mut byte)? == 0 {
            break;
        }
        buffer.push(byte[0]);
        if buffer.ends_with(b"\r\n\r\n") {
            break;
        }
    }
    let text = String::from_utf8_lossy(&buffer);
    let mut parts = text.lines().next().unwrap_or("").split_whitespace();
    let method = parts.next().unwrap_or("").to_string();
    let target = parts.next().unwrap_or("/").to_string();
    if method.is_empty() {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "request"));
    }
    Ok((method, target))
}

fn write_reply(stream: &mut TcpStream, reply: &LiveReply) -> std::io::Result<()> {
    let reason = match reply.status {
        200 => "OK",
        302 => "Found",
        404 => "Not Found",
        405 => "Method Not Allowed",
        _ => "OK",
    };
    write!(stream, "HTTP/1.1 {} {reason}\r\n", reply.status)?;
    write!(stream, "Content-Type: {}\r\n", reply.content_type)?;
    if let Some(location) = &reply.location {
        write!(stream, "Location: {location}\r\n")?;
    }
    write!(stream, "Content-Length: {}\r\nConnection: close\r\n\r\n", reply.body.len())?;
    stream.write_all(&reply.body)
}

pub fn serve(listener: TcpListener, root: PathBuf, shutdown: Receiver<()>, reloads: Receiver<()>) {
    listener.set_nonblocking(true).ok();
    let clients: Arc<Mutex<Vec<TcpStream>>> = Arc::new(Mutex::new(Vec::new()));
    loop {
        if shutdown.try_recv().is_ok() {
            break;
        }
        while reloads.try_recv().is_ok() {
            if let Ok(mut clients) = clients.lock() {
                clients.retain_mut(|client| {
                    client.write_all(b"data: reload\n\n").is_ok() && client.flush().is_ok()
                });
            }
        }
        match listener.accept() {
            Ok((mut stream, _)) => {
                stream.set_read_timeout(Some(Duration::from_secs(5))).ok();
                let Ok((method, target)) = read_request(&mut stream) else {
                    continue;
                };
                let response = respond(&root, &method, &target);
                if response.events {
                    let headers = b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nConnection: keep-alive\r\n\r\n";
                    if stream.write_all(headers).is_ok() {
                        stream.set_nonblocking(true).ok();
                        if let Ok(mut clients) = clients.lock() {
                            clients.push(stream);
                        }
                    }
                } else {
                    write_reply(&mut stream, &response).ok();
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(20));
            }
            Err(_) => break,
        }
    }
    if let Ok(mut clients) = clients.lock() {
        clients.clear();
    }
}

pub fn open_browser(url: &str) -> std::io::Result<()> {
    browser_command(url)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
}

fn browser_command(url: &str) -> Command {
    #[cfg(target_os = "macos")]
    {
        let mut command = Command::new("open");
        command.arg(url);
        command
    }
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("cmd");
        command.args(["/C", "start", "", url]);
        command
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let mut command = Command::new("xdg-open");
        command.arg(url);
        command
    }
}

pub fn start_watch(root: &Path, events: Sender<()>) -> notify::Result<RecommendedWatcher> {
    let started = Instant::now();
    let mut watcher = notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
        let Ok(event) = result else {
            return;
        };
        if matches!(event.kind, EventKind::Access(_)) || started.elapsed() < Duration::from_millis(300) {
            return;
        }
        if matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)) {
            let _ = events.send(());
        }
    })?;
    watcher.watch(root, RecursiveMode::Recursive)?;
    Ok(watcher)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run the Task 1 cargo command.

Expected: PASS. The SSE test must contain `data: reload`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/live_server.rs
git commit -m "$(cat <<'EOF'
Serve project files and reload connected browsers.

EOF
)"
```

---

### Task 3: Tauri commands

**Files:**
- Modify: `src-tauri/src/live_server.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/src/live_server.rs` (`mod tests`)

**Interfaces:**
- Consumes: `bind_first`, `LIVE_PORTS`, `serve`, `open_browser`, `start_watch`, `Debounce` from Task 2; `filesystem::AppError`, `filesystem::Result`, and `filesystem::Workspace` from `src-tauri/src/filesystem.rs`
- Produces:
  - `pub struct LiveState`
  - `impl LiveState { pub fn stop(&self) }`
  - `pub struct LiveServerInfo { pub port: u16, pub url: String, pub browser_error: Option<String>, pub watch_error: Option<String> }` with `#[serde(rename_all = "camelCase")]`
  - `pub fn live_server_start(live: State<LiveState>, workspace: State<Workspace>) -> Result<LiveServerInfo>`
  - `pub fn live_server_stop(live: State<LiveState>) -> Result<()>`
  - `pub fn live_server_open(live: State<LiveState>) -> Result<()>`

`browser_error` and `watch_error` carry the exact failure sentences while `port` and `url` still report a running server. `live_server_start` on an already running server returns the current port and does not bind again. `stop` is safe when nothing is running. The command tests call the functions through `LiveState` directly; they do not construct a Tauri `State`.

- [ ] **Step 1: Write the failing test**

Append:

```rust
#[test]
fn start_without_a_project_does_not_listen() {
    let live = LiveState::default();
    let workspace = crate::filesystem::Workspace::default();
    let error = live.start(&workspace).unwrap_err();
    assert_eq!(error.message, "Open a folder first");
}

#[test]
fn stop_without_a_server_is_harmless() {
    LiveState::default().stop();
}
```

Add the method the test calls, as a stub, so the test compiles and fails on the message:

```rust
impl LiveState {
    pub fn start(&self, _workspace: &crate::filesystem::Workspace) -> crate::filesystem::Result<LiveServerInfo> {
        Err(crate::filesystem::AppError::new("LIVE_SERVER", "not implemented"))
    }
}
```

Do not add this stub if Step 3 is implemented in the same edit. The test must fail before that implementation.

- [ ] **Step 2: Run the test to verify it fails**

Run the Task 1 cargo command.

Expected: FAIL with `not implemented` or a missing `LiveState`.

- [ ] **Step 3: Implement the commands**

Add:

```rust
use crate::filesystem::{AppError, Result, Workspace};
use serde::Serialize;
use std::sync::mpsc;
use tauri::State;

#[derive(Default)]
pub struct LiveState(Mutex<Option<Running>>);

struct Running {
    port: u16,
    shutdown: Sender<()>,
    thread: thread::JoinHandle<()>,
    watcher: Option<RecommendedWatcher>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveServerInfo {
    pub port: u16,
    pub url: String,
    pub browser_error: Option<String>,
    pub watch_error: Option<String>,
}

impl LiveState {
    pub fn stop(&self) {
        let running = self.0.lock().ok().and_then(|mut guard| guard.take());
        if let Some(running) = running {
            let _ = running.shutdown.send(());
            let _ = running.thread.join();
            drop(running.watcher);
        }
    }

    pub fn start(&self, workspace: &Workspace) -> Result<LiveServerInfo> {
        let root = workspace.root()?;
        let existing_port = self
            .0
            .lock()
            .map_err(|_| AppError::new("STATE", "Live Server unavailable"))?
            .as_ref()
            .map(|running| running.port);
        if let Some(port) = existing_port {
            return Ok(info(port, None, None));
        }
        let ports: Vec<u16> = LIVE_PORTS.collect();
        let (listener, port) = bind_first(&ports).map_err(|_| {
            AppError::new("LIVE_SERVER", "Live Server could not find a free port.")
        })?;
        let (shutdown_tx, shutdown_rx) = mpsc::channel();
        let (reload_tx, reload_rx) = mpsc::channel();
        let (watch_tx, watch_rx) = mpsc::channel();
        let (watcher, watch_message) = match start_watch(&root, watch_tx) {
            Ok(watcher) => {
                thread::spawn(move || {
                    let mut debounce = Debounce::new(Duration::from_millis(200));
                    loop {
                        match watch_rx.recv_timeout(Duration::from_millis(50)) {
                            Ok(()) => debounce.arm(Instant::now()),
                            Err(mpsc::RecvTimeoutError::Timeout) => {}
                            Err(mpsc::RecvTimeoutError::Disconnected) => break,
                        }
                        if debounce.poll(Instant::now()) && reload_tx.send(()).is_err() {
                            break;
                        }
                    }
                });
                (Some(watcher), None)
            }
            Err(_) => (None, Some("Live Server cannot watch files for reload.".to_string())),
        };
        let served = root.clone();
        let thread = thread::spawn(move || serve(listener, served, shutdown_rx, reload_rx));
        let url = format!("http://127.0.0.1:{port}/");
        let running = Running {
            port,
            shutdown: shutdown_tx,
            thread,
            watcher,
        };
        *self
            .0
            .lock()
            .map_err(|_| AppError::new("STATE", "Live Server unavailable"))? = Some(running);
        let browser_error = open_browser(&url)
            .err()
            .map(|_| format!("Could not open the browser. Open {url}"));
        Ok(info(port, browser_error, watch_message))
    }

    pub fn open(&self) -> Result<()> {
        let port = self
            .0
            .lock()
            .map_err(|_| AppError::new("STATE", "Live Server unavailable"))?
            .as_ref()
            .map(|running| running.port)
            .ok_or_else(|| AppError::new("LIVE_SERVER", "Live Server is not running."))?;
        let url = format!("http://127.0.0.1:{port}/");
        open_browser(&url).map_err(|_| {
            AppError::new("LIVE_SERVER", format!("Could not open the browser. Open {url}"))
        })
    }
}

fn info(port: u16, browser_error: Option<String>, watch_error: Option<String>) -> LiveServerInfo {
    LiveServerInfo {
        port,
        url: format!("http://127.0.0.1:{port}/"),
        browser_error,
        watch_error,
    }
}

#[tauri::command]
pub fn live_server_start(live: State<LiveState>, workspace: State<Workspace>) -> Result<LiveServerInfo> {
    live.start(&workspace)
}

#[tauri::command]
pub fn live_server_stop(live: State<LiveState>) -> Result<()> {
    live.stop();
    Ok(())
}

#[tauri::command]
pub fn live_server_open(live: State<LiveState>) -> Result<()> {
    live.open()
}
```

In `src-tauri/src/lib.rs`:

- `.manage(terminal::TerminalState::default())` is followed by `.manage(live_server::LiveState::default())`.
- The `Destroyed` branch also calls `window.state::<live_server::LiveState>().stop();`.
- Both `generate_handler!` lists gain `live_server::live_server_start`, `live_server::live_server_stop`, and `live_server::live_server_open`.

- [ ] **Step 4: Run the test to verify it passes**

Run the Task 1 cargo command.

Expected: PASS, including `start_without_a_project_does_not_listen` and `stop_without_a_server_is_harmless`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/live_server.rs src-tauri/src/lib.rs
git commit -m "$(cat <<'EOF'
Start and stop Live Server with the open project.

EOF
)"
```

---

### Task 4: Status control

**Files:**
- Create: `src/lib/live-server.ts`
- Create: `tests/live-server.test.ts`
- Modify: `src/lib/backend.ts`
- Modify: `src/App.tsx`
- Modify: `src/styles/app.css`

**Interfaces:**
- Consumes: `LiveServerInfo` fields `port`, `url`, `browserError`, `watchError` from Task 3
- Produces:
  - `export interface LiveServerInfo { port: number; url: string; browserError: string | null; watchError: string | null }`
  - `export function liveControl(running: { port: number } | null): { label: string; name: string; running: boolean }`
  - `export function startedStatus(info: LiveServerInfo): { message: string; error: string }`
  - `export const LIVE_STOPPED = "Live Server stopped"`
  - `backend.liveServerStart()`, `backend.liveServerStop()`, `backend.liveServerOpen()`

- [ ] **Step 1: Write the failing test**

Create `tests/live-server.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { LIVE_STOPPED, liveControl, startedStatus, type LiveServerInfo } from "../src/lib/live-server";

const running: LiveServerInfo = {
  port: 5500,
  url: "http://127.0.0.1:5500/",
  browserError: null,
  watchError: null,
};

describe("live server control", () => {
  it("labels the stopped and running button", () => {
    expect(liveControl(null)).toEqual({
      label: "Go Live",
      name: "Start Live Server",
      running: false,
    });
    expect(liveControl({ port: 5502 })).toEqual({
      label: "Port: 5502",
      name: "Stop Live Server",
      running: true,
    });
  });

  it("sets the started message and keeps server failures beside it", () => {
    expect(startedStatus(running)).toEqual({
      message: "Live Server started at http://127.0.0.1:5500/",
      error: "",
    });
    expect(
      startedStatus({
        ...running,
        browserError: "Could not open the browser. Open http://127.0.0.1:5500/",
        watchError: "Live Server cannot watch files for reload.",
      }).error,
    ).toBe(
      "Live Server cannot watch files for reload. Could not open the browser. Open http://127.0.0.1:5500/",
    );
  });

  it("uses the stopped sentence", () => {
    expect(LIVE_STOPPED).toBe("Live Server stopped");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- tests/live-server.test.ts
```

Expected: FAIL because `src/lib/live-server.ts` does not exist.

- [ ] **Step 3: Implement the control**

Create `src/lib/live-server.ts`:

```ts
export interface LiveServerInfo {
  port: number;
  url: string;
  browserError: string | null;
  watchError: string | null;
}

export function liveControl(running: { port: number } | null) {
  if (running) {
    return {
      label: `Port: ${running.port}`,
      name: "Stop Live Server",
      running: true,
    };
  }
  return { label: "Go Live", name: "Start Live Server", running: false };
}

export function startedStatus(info: LiveServerInfo) {
  return {
    message: `Live Server started at ${info.url}`,
    error: [info.watchError, info.browserError].filter(Boolean).join(" "),
  };
}

export const LIVE_STOPPED = "Live Server stopped";
```

Add to the `backend` object in `src/lib/backend.ts`, and import the info type:

```ts
import type { LiveServerInfo } from "./live-server";
```

```ts
  liveServerStart: () => invoke<LiveServerInfo>("live_server_start"),
  liveServerStop: () => invoke<void>("live_server_stop"),
  liveServerOpen: () => invoke<void>("live_server_open"),
```

In `src/App.tsx`, import `LIVE_STOPPED`, `liveControl`, and `startedStatus`. Add state next to the other UI state:

```tsx
const [live, setLive] = useState<{ port: number; url: string } | null>(null);
const [liveMessage, setLiveMessage] = useState("");
const liveRef = useRef(live);
const liveBusy = useRef(false);
liveRef.current = live;
```

Add this function beside `openFolder`:

```tsx
const toggleLive = async () => {
  if (liveBusy.current) return;
  liveBusy.current = true;
  try {
    if (liveRef.current) {
      await backend.liveServerStop();
      setLive(null);
      setLiveMessage(LIVE_STOPPED);
    } else {
      const info = await backend.liveServerStart();
      const status = startedStatus(info);
      setLive({ port: info.port, url: info.url });
      setLiveMessage(status.message);
      setError(status.error);
    }
  } catch (caught) {
    setError(errorMessage(caught));
  } finally {
    liveBusy.current = false;
  }
};
```

In `openFolder`, after `const next = await backend.openProject();` and `if (!next) return;`, stop a running server before replacing the project:

```tsx
if (liveRef.current) {
  await backend.liveServerStop();
  setLive(null);
  setLiveMessage(LIVE_STOPPED);
}
```

Immediately after the existing error strip, render a separate row:

```tsx
{liveMessage && (
  <div className="status-strip" role="status">
    <span>{liveMessage}</span>
    <button aria-label="Dismiss status" onClick={() => setLiveMessage("")}>
      Dismiss
    </button>
  </div>
)}
```

Inside the status footer, after the cursor-position span, render the button only when `project` is set (the footer already has that condition):

```tsx
<button
  className={liveControl(live).running ? "live-server running" : "live-server"}
  aria-label={liveControl(live).name}
  onClick={() => void toggleLive()}
>
  <span className="dot" aria-hidden="true" />
  {liveControl(live).label}
</button>
```

Add CSS. Extend the error-strip selectors so the status row matches them, and add the fixed dots:

```css
.error-strip,
.status-strip {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 14px;
  background: var(--raised);
  border-bottom: 1px solid var(--border);
}
.error-strip span,
.status-strip span {
  flex: 1;
  overflow-wrap: anywhere;
}
.error-strip button,
.status-strip button {
  text-decoration: underline;
  text-underline-offset: 3px;
}
.status .live-server {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  color: var(--muted);
}
.status .live-server .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #c44747;
  flex: none;
}
.status .live-server.running .dot {
  background: #2f9e57;
}
.status .live-server:hover {
  background: transparent;
}
```

Remove the old standalone `.error-strip`, `.error-strip span`, and `.error-strip button` rules so they are not duplicated.

The button lives in the existing footer. `.focus-mode > .status` already hides that footer, so Focus Mode needs no extra rule. Do not stop the server when Focus Mode changes.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- tests/live-server.test.ts
npx tsc --noEmit
```

Expected: PASS, and `tsc` exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/live-server.ts src/lib/backend.ts src/App.tsx src/styles/app.css tests/live-server.test.ts
git commit -m "$(cat <<'EOF'
Show Live Server status and start it from the status bar.

EOF
)"
```

---

### Task 5: Open in Browser

**Files:**
- Modify: `src/lib/live-server.ts`
- Modify: `tests/live-server.test.ts`
- Modify: `src/components/Explorer.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `toggleLive`'s busy ref and `liveRef` from Task 4. Add `export function canOpenInBrowser(entry: { path: string; isDirectory: boolean } | null): boolean`.
- Produces: `FileAction` includes `"browser"`. The menu label is `Open in Browser`.

- [ ] **Step 1: Write the failing test**

Append to `tests/live-server.test.ts`:

```ts
import { canOpenInBrowser } from "../src/lib/live-server";

it("offers the browser only for the root index", () => {
  expect(canOpenInBrowser({ path: "index.html", isDirectory: false })).toBe(true);
  expect(canOpenInBrowser({ path: "docs/index.html", isDirectory: false })).toBe(false);
  expect(canOpenInBrowser({ path: "index.html", isDirectory: true })).toBe(false);
  expect(canOpenInBrowser({ path: "app.css", isDirectory: false })).toBe(false);
  expect(canOpenInBrowser(null)).toBe(false);
});
```

Keep the import with the existing import from `../src/lib/live-server`.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- tests/live-server.test.ts
```

Expected: FAIL because `canOpenInBrowser` is not exported.

- [ ] **Step 3: Add the menu item**

In `src/lib/live-server.ts`:

```ts
export function canOpenInBrowser(
  entry: { path: string; isDirectory: boolean } | null,
) {
  return !!entry && !entry.isDirectory && entry.path === "index.html";
}
```

In `src/components/Explorer.tsx`, extend `FileAction`:

```ts
export type FileAction =
  | "file"
  | "folder"
  | "rename"
  | "delete"
  | "refresh"
  | "browser";
```

Import `canOpenInBrowser`. Build the actions array so the browser item is first when it applies:

```ts
const actions: [FileAction, string][] = [
  ...(menu?.entry && canOpenInBrowser(menu.entry)
    ? ([["browser", "Open in Browser"]] as [FileAction, string][])
    : []),
  ["file", "New File"],
  ["folder", "New Folder"],
  // the existing rename, delete, and refresh entries stay after these
];
```

In `fileAction` in `src/App.tsx`, handle the action before the refresh branch:

```tsx
if (action === "browser") {
  if (liveBusy.current) return;
  liveBusy.current = true;
  try {
    if (liveRef.current) {
      await backend.liveServerOpen();
    } else {
      const info = await backend.liveServerStart();
      const status = startedStatus(info);
      setLive({ port: info.port, url: info.url });
      setLiveMessage(status.message);
      setError(status.error);
    }
  } finally {
    liveBusy.current = false;
  }
  return;
}
```

This branch stays inside `run`, so a thrown `liveServerOpen` error still reaches the error strip. It shares `liveBusy` with `toggleLive`, so a second click while the first start or stop is unfinished returns immediately.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- tests/live-server.test.ts
npx tsc --noEmit
```

Expected: PASS, and `tsc` exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/live-server.ts tests/live-server.test.ts src/components/Explorer.tsx src/App.tsx
git commit -m "$(cat <<'EOF'
Open the project root from the index.html menu.

EOF
)"
```

---

### Task 6: Documentation and release binary

**Files:**
- Modify: `README.md`
- Modify: `DESIGN.md`

**Interfaces:**
- Consumes: the behavior from Tasks 1–5
- Produces: the README Use paragraph and the DESIGN.md sentence required by the spec

- [ ] **Step 1: Update the docs**

In `README.md`, after the paragraph that begins `Open a folder, then click a file`, add:

```markdown
Go Live, at the trailing end of the status bar, serves the open folder at `http://127.0.0.1` on the first free port from 5500 through 5509 and opens that address in the system browser. The button then shows the port; click it again to stop. Saving a file reloads the open pages. The project-root `index.html` also has Open in Browser in its right-click menu. Switching projects or closing the window stops the server. Focus Mode hides the control and leaves the server running.
```

In `DESIGN.md`, after the sentence `Errors stay in a compact dismissible strip.`, add:

```markdown
The status bar can start a local static server for the open folder and reload the system browser after a file is written. Its 6px red and green dots are fixed status colors.
```

- [ ] **Step 2: Run the full checks**

```bash
npm test
export CARGO_HOME=/tmp/mide-cargo
export RUSTUP_HOME=/tmp/mide-rustup
export PATH="/tmp/mide-cargo/bin:$PATH"
cargo test --manifest-path src-tauri/Cargo.toml live_server::tests -- --test-threads=1
```

Expected: Vitest passes and the Rust `live_server` tests pass.

- [ ] **Step 3: Rebuild the binary the app is launched from**

Run this in an unsandboxed shell:

```bash
export CARGO_HOME=/tmp/mide-cargo
export RUSTUP_HOME=/tmp/mide-rustup
export PATH="/tmp/mide-cargo/bin:$PATH"
npm run tauri build -- --no-bundle
cp -f /tmp/cursor-sandbox-cache/5fd3137a98bf1cc279f24ea955f28851/cargo-target/release/mide src-tauri/target/release/mide
chmod +x src-tauri/target/release/mide
```

If `tauri build` prints a different target path, copy that `release/mide` binary instead. The user launches `/home/gruut/Projects/mide/src-tauri/target/release/mide` and must close the running app before the new binary is visible.

- [ ] **Step 4: Manual check**

Close mIDE and launch `src-tauri/target/release/mide`. Open a folder that contains `index.html` and a CSS file.

- The status button reads Go Live and its dot is `#c44747`.
- The click opens `http://127.0.0.1:{port}/` in the system browser. The button reads `Port: {port}` and the dot is `#2f9e57`. The status row says `Live Server started at http://127.0.0.1:{port}`.
- Save the CSS file. The browser page reloads.
- Click the button again. The dot is red and the status row says `Live Server stopped`.
- Start it again, then switch projects. The server stops.
- Right-click root `index.html`. Open in Browser is the first item. Another file does not show it.

- [ ] **Step 5: Commit**

```bash
git add README.md DESIGN.md
git commit -m "$(cat <<'EOF'
Document the status-bar Live Server.

EOF
)"
```

Do not commit the release binary.
