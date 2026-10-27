use crate::filesystem::{AppError, Result, Workspace};
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::fs;
use std::io::{Read, Write};
use std::net::{Ipv4Addr, TcpListener, TcpStream};
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::State;

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
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len() {
                return None;
            }
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
    if decoded.chars().any(char::is_control) || decoded.contains('\\') {
        return None;
    }
    if decoded.split('/').any(|part| part == "..") {
        return None;
    }
    let trimmed = decoded.trim_start_matches('/');
    let relative = PathBuf::from(trimmed);
    if relative
        .components()
        .any(|component| !matches!(component, Component::Normal(_) | Component::CurDir))
    {
        return None;
    }
    Some(relative)
}

// Hidden metadata is never public; only a root .well-known directory is exempt.
fn public_path(path: &Path) -> bool {
    path.components().enumerate().all(|(index, component)| {
        let Component::Normal(name) = component else {
            return false;
        };
        let Some(name) = name.to_str() else {
            return false;
        };
        !name.chars().any(char::is_control)
            && !name.contains('\\')
            && (!cfg!(windows) || !name.contains(':'))
            && (!name.starts_with('.') || (index == 0 && name == ".well-known"))
    })
}

fn public_canonical(root: &Path, path: &Path) -> bool {
    path.strip_prefix(root).is_ok_and(public_path)
}

fn encode_segment(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || b"-._~".contains(&byte) {
            encoded.push(byte as char);
        } else {
            use std::fmt::Write;
            let _ = write!(encoded, "%{byte:02X}");
        }
    }
    encoded
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
                    if !public_canonical(root, &current) {
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

const MAX_FILE_BYTES: u64 = 16 * 1024 * 1024;
const MAX_DIRECTORY_ENTRIES: usize = 2048;

fn directory_listing(root: &Path, path: &Path) -> Option<String> {
    let mut names = Vec::new();
    for (count, entry) in fs::read_dir(path).ok()?.enumerate() {
        if count >= MAX_DIRECTORY_ENTRIES {
            return None;
        }
        let entry = entry.ok()?;
        if let Some(name) = entry.file_name().to_str() {
            let relative = entry.path().strip_prefix(root).ok()?.to_owned();
            if public_path(&relative) && inside(root, &relative).is_some() {
                names.push(name.to_string());
            }
        }
    }
    names.sort();
    let mut html = String::from("<!DOCTYPE html><title>Index</title><ul>");
    for name in names {
        let escaped = escape_html(&name);
        let href = escape_html(&format!("./{}", encode_segment(&name)));
        html.push_str(&format!("<li><a href=\"{href}\">{escaped}</a></li>"));
    }
    html.push_str("</ul>");
    Some(inject_reload(&html))
}

fn not_found() -> LiveReply {
    reply(404, "text/plain; charset=utf-8", "Not found")
}

fn redirect_location(relative: &Path) -> String {
    let mut location = String::from("/");
    for component in relative.components() {
        if let Component::Normal(part) = component {
            location.push_str(&encode_segment(&part.to_string_lossy()));
            location.push('/');
        }
    }
    location
}

fn directory_index_reply(
    root: &Path,
    dir: &Path,
) -> std::result::Result<Option<LiveReply>, LiveReply> {
    let index = dir.join("index.html");
    if index.symlink_metadata().is_err() {
        return Ok(None);
    }
    let canonical = index.canonicalize().map_err(|_| not_found())?;
    if !public_canonical(root, &canonical) || !canonical.is_file() {
        return Err(not_found());
    }
    Ok(Some(file_reply(&canonical)))
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
    if !public_path(&relative) {
        return not_found();
    }
    let Some(path) = inside(&root, &relative) else {
        return not_found();
    };
    if path.is_dir() {
        let directory_url = bare == "/" || bare.ends_with('/');
        if !directory_url {
            return LiveReply {
                status: 302,
                content_type: "text/plain; charset=utf-8",
                location: Some(redirect_location(&relative)),
                body: Vec::new(),
                events: false,
            };
        }
        match directory_index_reply(&root, &path) {
            Ok(Some(reply)) => return reply,
            Ok(None) => {}
            Err(reply) => return reply,
        }
        return match directory_listing(&root, &path) {
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
    let Ok(file) = fs::File::open(path) else {
        return not_found();
    };
    let Ok(metadata) = file.metadata() else {
        return not_found();
    };
    if !metadata.is_file() {
        return not_found();
    }
    if metadata.len() > MAX_FILE_BYTES {
        return reply(
            413,
            "text/plain; charset=utf-8",
            "File exceeds 16 MiB limit",
        );
    }
    let mut bytes = Vec::new();
    if file
        .take(MAX_FILE_BYTES + 1)
        .read_to_end(&mut bytes)
        .is_err()
    {
        return not_found();
    }
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return reply(
            413,
            "text/plain; charset=utf-8",
            "File exceeds 16 MiB limit",
        );
    }
    let kind = content_type(path);
    if kind.starts_with("text/html") {
        let html = String::from_utf8_lossy(&bytes);
        reply(200, kind, inject_reload(&html))
    } else {
        LiveReply {
            status: 200,
            content_type: kind,
            location: None,
            body: bytes,
            events: false,
        }
    }
}

pub const LIVE_PORTS: std::ops::RangeInclusive<u16> = 5500..=5509;

pub fn bind_first(ports: &[u16]) -> std::io::Result<(TcpListener, u16)> {
    let mut last = std::io::Error::from(std::io::ErrorKind::AddrInUse);
    for port in ports {
        match TcpListener::bind((Ipv4Addr::LOCALHOST, *port)) {
            Ok(listener) => {
                let port = listener.local_addr()?.port();
                return Ok((listener, port));
            }
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

const MAX_HEADER_BYTES: usize = 8192;

// Deliberately accept only bodyless origin-form requests. No proxying or pipelining.
fn parse_request(bytes: &[u8], port: u16) -> std::result::Result<(&str, &str), u16> {
    let text = std::str::from_utf8(bytes).map_err(|_| 400u16)?;
    let text = text.strip_suffix("\r\n\r\n").ok_or(400u16)?;
    let mut lines = text.split("\r\n");
    let mut request = lines.next().ok_or(400u16)?.split(' ');
    let method = request.next().ok_or(400u16)?;
    let target = request.next().ok_or(400u16)?;
    if request.next() != Some("HTTP/1.1")
        || request.next().is_some()
        || method.is_empty()
        || !method.bytes().all(|b| b.is_ascii_uppercase())
        || !target.starts_with('/')
        || target.starts_with("//")
        || target.bytes().any(|b| b.is_ascii_control() || b == b' ')
    {
        return Err(400);
    }
    let mut host = None;
    let mut length = None;
    for line in lines {
        let (name, value) = line.split_once(':').ok_or(400u16)?;
        if name.is_empty()
            || !name
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"!#$%&'*+-.^_`|~".contains(&b))
            || value.bytes().any(|b| b.is_ascii_control() && b != b'\t')
        {
            return Err(400);
        }
        let value = value.trim_matches([' ', '\t']);
        if name.eq_ignore_ascii_case("host") && host.replace(value).is_some() {
            return Err(400);
        }
        if name.eq_ignore_ascii_case("transfer-encoding") {
            return Err(400);
        }
        if name.eq_ignore_ascii_case("content-length")
            && (length.replace(value).is_some() || value != "0")
        {
            return Err(400);
        }
    }
    let host = host.ok_or(400u16)?;
    if !host.eq_ignore_ascii_case(&format!("localhost:{port}"))
        && host != format!("127.0.0.1:{port}")
    {
        return Err(403);
    }
    Ok((method, target))
}

fn response_bytes(response: LiveReply) -> Vec<u8> {
    // Defense in depth: never serialize a control character into a header.
    if response
        .location
        .as_ref()
        .is_some_and(|s| s.chars().any(char::is_control))
    {
        return response_bytes(reply(400, "text/plain; charset=utf-8", "Invalid location"));
    }
    let reason = match response.status {
        200 => "OK",
        302 => "Found",
        400 => "Bad Request",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        413 => "Content Too Large",
        431 => "Request Header Fields Too Large",
        503 => "Service Unavailable",
        _ => "Error",
    };
    let mut headers = format!("HTTP/1.1 {} {reason}\r\nContent-Type: {}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n", response.status, response.content_type);
    if let Some(location) = response.location {
        headers.push_str(&format!("Location: {location}\r\n"));
    }
    if response.events {
        headers.push_str("Connection: keep-alive\r\n\r\n");
    } else {
        headers.push_str(&format!(
            "Content-Length: {}\r\nConnection: close\r\n\r\n",
            response.body.len()
        ));
    }
    let mut bytes = headers.into_bytes();
    bytes.extend_from_slice(&response.body);
    bytes
}

#[derive(Clone, Copy)]
struct Limits {
    clients: usize,
    events: usize,
    request_timeout: Duration,
    write_timeout: Duration,
}
impl Default for Limits {
    fn default() -> Self {
        Self {
            clients: 16,
            events: 8,
            request_timeout: Duration::from_secs(5),
            write_timeout: Duration::from_secs(10),
        }
    }
}

struct Connection {
    stream: TcpStream,
    input: Vec<u8>,
    output: Vec<u8>,
    written: usize,
    responded: bool,
    events: bool,
    reload_pending: bool,
    deadline: Instant,
    heartbeat: Instant,
}
impl Connection {
    fn new(stream: TcpStream, limits: Limits) -> std::io::Result<Self> {
        stream.set_nonblocking(true)?;
        Ok(Self {
            stream,
            input: Vec::new(),
            output: Vec::new(),
            written: 0,
            responded: false,
            events: false,
            reload_pending: false,
            deadline: Instant::now() + limits.request_timeout,
            heartbeat: Instant::now(),
        })
    }

    fn queue(&mut self, response: LiveReply, limits: Limits) {
        self.events = response.events;
        self.output = response_bytes(response);
        self.responded = true;
        self.input.clear();
        self.written = 0;
        self.deadline = Instant::now() + limits.write_timeout;
    }

    // Each tick does bounded nonblocking IO. Slow clients cannot hold up stop or peers.
    fn tick(
        &mut self,
        root: &Path,
        port: u16,
        limits: Limits,
        sse_available: bool,
        reload: bool,
    ) -> bool {
        let now = Instant::now();
        if (!self.responded || !self.output.is_empty()) && now >= self.deadline {
            return false;
        }
        if !self.responded {
            let mut buffer = [0; 4096];
            match self.stream.read(&mut buffer) {
                Ok(0) => return false,
                Ok(count) => self.input.extend_from_slice(&buffer[..count]),
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => return true,
                Err(_) => return false,
            }
            if let Some(end) = self
                .input
                .windows(4)
                .position(|w| w == b"\r\n\r\n")
                .map(|i| i + 4)
            {
                let response = if end > MAX_HEADER_BYTES {
                    reply(431, "text/plain; charset=utf-8", "Headers too large")
                } else {
                    match parse_request(&self.input[..end], port) {
                        Ok((method, target)) => {
                            let response = respond(root, method, target);
                            if response.events && !sse_available {
                                reply(
                                    503,
                                    "text/plain; charset=utf-8",
                                    "Too many live reload connections",
                                )
                            } else {
                                response
                            }
                        }
                        Err(status) => {
                            reply(status, "text/plain; charset=utf-8", "Invalid request")
                        }
                    }
                };
                self.queue(response, limits);
            } else if self.input.len() >= MAX_HEADER_BYTES {
                self.queue(
                    reply(431, "text/plain; charset=utf-8", "Headers too large"),
                    limits,
                );
            } else {
                return true;
            }
        }
        if self.events {
            self.reload_pending |= reload;
            let mut probe = [0];
            match self.stream.peek(&mut probe) {
                Ok(_) => return false, // EOF or unexpected pipelined input
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
                Err(_) => return false,
            }
            if self.output.is_empty() && (self.reload_pending || now >= self.heartbeat) {
                self.output = if self.reload_pending {
                    b"data: reload\n\n".to_vec()
                } else {
                    b": heartbeat\n\n".to_vec()
                };
                self.reload_pending = false;
                self.written = 0;
                self.deadline = now + limits.write_timeout;
                self.heartbeat = now + Duration::from_secs(15);
            }
        }
        if !self.output.is_empty() {
            let end = (self.written + 64 * 1024).min(self.output.len());
            match self.stream.write(&self.output[self.written..end]) {
                Ok(0) => return false,
                Ok(count) => self.written += count,
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => return true,
                Err(_) => return false,
            }
            if self.written == self.output.len() {
                if !self.events {
                    return false;
                }
                self.output.clear();
                self.written = 0;
            }
        }
        true
    }
}

pub fn serve(listener: TcpListener, root: PathBuf, shutdown: Receiver<()>, reloads: Receiver<()>) {
    serve_with_limits(listener, root, shutdown, reloads, Limits::default());
}

fn serve_with_limits(
    listener: TcpListener,
    root: PathBuf,
    shutdown: Receiver<()>,
    reloads: Receiver<()>,
    limits: Limits,
) {
    if listener.set_nonblocking(true).is_err() {
        return;
    }
    let Ok(address) = listener.local_addr() else {
        return;
    };
    let mut clients: Vec<Connection> = Vec::new();
    loop {
        match shutdown.try_recv() {
            Ok(()) | Err(mpsc::TryRecvError::Disconnected) => break,
            Err(mpsc::TryRecvError::Empty) => {}
        }
        // Bound the accept batch so a connection flood cannot starve cancellation.
        for _ in 0..limits.clients {
            match listener.accept() {
                Ok((stream, _)) if clients.len() < limits.clients => {
                    if let Ok(client) = Connection::new(stream, limits) {
                        clients.push(client);
                    }
                }
                Ok(_) => {} // Drop excess connections without allocating a worker or response.
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => break,
                Err(_) => return,
            }
        }
        let mut reload = false;
        for _ in 0..256 {
            if reloads.try_recv().is_err() {
                break;
            }
            reload = true;
        }
        let mut events = clients.iter().filter(|c| c.events).count();
        clients.retain_mut(|client| {
            let was_event = client.events;
            let keep = client.tick(
                &root,
                address.port(),
                limits,
                events < limits.events,
                reload,
            );
            if was_event {
                events -= 1;
            }
            if keep && client.events {
                events += 1;
            }
            keep
        });
        thread::sleep(Duration::from_millis(5));
    }
    // Dropping all sockets cancels both incomplete requests and blocked writes/SSE.
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
        if matches!(event.kind, EventKind::Access(_))
            || started.elapsed() < Duration::from_millis(300)
        {
            return;
        }
        if matches!(
            event.kind,
            EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
        ) {
            let _ = events.send(());
        }
    })?;
    watcher.watch(root, RecursiveMode::Recursive)?;
    Ok(watcher)
}

#[derive(Default)]
pub struct LiveState(Mutex<Option<Running>>);

struct Running {
    port: u16,
    shutdown: Sender<()>,
    thread: thread::JoinHandle<()>,
    watcher: Option<RecommendedWatcher>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveServerInfo {
    pub port: u16,
    pub url: String,
    pub browser_error: Option<String>,
    pub watch_error: Option<String>,
}

fn stop_running(running: Running) {
    let _ = running.shutdown.send(());
    let _ = running.thread.join();
    drop(running.watcher);
}

fn store_running(slot: &mut Option<Running>, running: Running) -> bool {
    if slot.is_some() {
        stop_running(running);
        return false;
    }
    *slot = Some(running);
    true
}

impl LiveState {
    pub fn stop(&self) {
        let running = self.0.lock().ok().and_then(|mut guard| guard.take());
        if let Some(running) = running {
            stop_running(running);
        }
    }

    pub fn start(&self, workspace: &Workspace) -> Result<LiveServerInfo> {
        let root = workspace.root()?;
        let mut slot = self
            .0
            .lock()
            .map_err(|_| AppError::new("STATE", "Live Server unavailable"))?;
        if let Some(port) = slot.as_ref().map(|running| running.port) {
            return Ok(info(port, None, None));
        }
        let ports: Vec<u16> = LIVE_PORTS.collect();
        let (listener, port) = bind_first(&ports)
            .map_err(|_| AppError::new("LIVE_SERVER", "Live Server could not find a free port."))?;
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
            Err(_) => (
                None,
                Some("Live Server cannot watch files for reload.".to_string()),
            ),
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
        if !store_running(&mut slot, running) {
            let port = slot
                .as_ref()
                .map(|running| running.port)
                .ok_or_else(|| AppError::new("STATE", "Live Server unavailable"))?;
            return Ok(info(port, None, None));
        }
        drop(slot);
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
            AppError::new(
                "LIVE_SERVER",
                format!("Could not open the browser. Open {url}"),
            )
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
pub fn live_server_start(
    live: State<'_, LiveState>,
    workspace: State<'_, Workspace>,
) -> Result<LiveServerInfo> {
    live.start(&workspace)
}

#[tauri::command]
pub fn live_server_stop(live: State<'_, LiveState>) -> Result<()> {
    live.stop();
    Ok(())
}

#[tauri::command]
pub fn live_server_open(live: State<'_, LiveState>) -> Result<()> {
    live.open()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(prefix: &str) -> PathBuf {
        use std::sync::atomic::{AtomicU64, Ordering};
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let path = std::env::temp_dir().join(format!(
            "{prefix}-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed),
        ));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path
    }

    pub(super) fn temp() -> PathBuf {
        scratch("mide-live")
    }

    fn write_tree(root: &Path) {
        fs::create_dir_all(root.join("css")).unwrap();
        fs::write(root.join("index.html"), "<html><body>Hi</body></html>").unwrap();
        fs::write(root.join("css/app.css"), "body{color:red}").unwrap();
        fs::write(root.join("app.js"), "console.log(1)").unwrap();
        fs::write(root.join("plain.txt"), "hello").unwrap();
    }

    #[test]
    fn root_returns_index_and_injects_before_body() {
        let root = temp();
        write_tree(&root);
        let reply = respond(&root, "GET", "/");
        let text = String::from_utf8(reply.body).unwrap();
        assert_eq!(reply.status, 200);
        assert!(text.contains("Hi"));
        assert!(
            text.find("EventSource").unwrap() < text.to_ascii_lowercase().rfind("</body>").unwrap()
        );
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
        assert!(text.contains("href=\"./alpha.txt\""));
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
        for target in [
            "/../secret",
            "/css/../../etc/passwd",
            "/css\\app.css",
            "/outside/secret",
        ] {
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
        assert!(!String::from_utf8(js.body.clone())
            .unwrap()
            .contains("EventSource"));
        let plain = respond(&root, "GET", "/plain.txt");
        assert_eq!(plain.content_type, "text/plain; charset=utf-8");
        fs::write(root.join("pic.webp"), [1, 2, 3]).unwrap();
        assert_eq!(
            respond(&root, "GET", "/pic.webp").content_type,
            "image/webp"
        );
        fs::write(root.join("blob.bin"), [0]).unwrap();
        assert_eq!(
            respond(&root, "GET", "/blob.bin").content_type,
            "application/octet-stream"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn index_html_symlink_outside_project_is_not_served() {
        let root = temp();
        let outside = scratch("mide-outside");
        fs::write(outside.join("secret.html"), "<html>secret</html>").unwrap();
        std::os::unix::fs::symlink(outside.join("secret.html"), root.join("index.html")).unwrap();
        fs::create_dir_all(root.join("docs")).unwrap();
        std::os::unix::fs::symlink(outside.join("secret.html"), root.join("docs/index.html"))
            .unwrap();
        for target in ["/", "/docs/"] {
            let reply = respond(&root, "GET", target);
            assert_eq!(reply.status, 404, "{target}");
            assert_eq!(reply.body, b"Not found", "{target}");
        }
        let _ = fs::remove_dir_all(&outside);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn directory_redirect_normalizes_location_path() {
        let root = temp();
        fs::create_dir_all(root.join("evil.com")).unwrap();
        let reply = respond(&root, "GET", "//evil.com");
        assert_eq!(reply.status, 302);
        assert_eq!(reply.location.as_deref(), Some("/evil.com/"));
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
        page.write_all(format!("GET / HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n\r\n").as_bytes())
            .unwrap();
        let mut buffer = Vec::new();
        page.read_to_end(&mut buffer).unwrap();
        assert!(String::from_utf8_lossy(&buffer).contains("EventSource"));
        let mut events = TcpStream::connect((Ipv4Addr::LOCALHOST, port)).unwrap();
        events
            .write_all(
                format!("GET /__mide/live HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n\r\n").as_bytes(),
            )
            .unwrap();
        events
            .set_read_timeout(Some(Duration::from_millis(200)))
            .unwrap();
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

    #[test]
    fn serve_returns_when_the_shutdown_sender_is_dropped() {
        let root = temp();
        fs::write(root.join("index.html"), "<html><body>Hi</body></html>").unwrap();
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let (shutdown_tx, shutdown_rx) = std::sync::mpsc::channel();
        let (reload_tx, reload_rx) = std::sync::mpsc::channel();
        let served = root.clone();
        let thread = thread::spawn(move || serve(listener, served, shutdown_rx, reload_rx));
        drop(shutdown_tx);
        let started = Instant::now();
        while !thread.is_finished() {
            if started.elapsed() > Duration::from_secs(2) {
                panic!("serve did not return after the shutdown sender was dropped");
            }
            thread::sleep(Duration::from_millis(20));
        }
        thread.join().unwrap();
        drop(reload_tx);
        let _ = fs::remove_dir_all(root);
    }
}

#[cfg(test)]
mod security_tests;
