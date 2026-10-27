use super::*;
use std::net::SocketAddr;

struct TestServer {
    root: PathBuf,
    address: SocketAddr,
    stop: Sender<()>,
    _reload: Sender<()>,
    worker: Option<thread::JoinHandle<()>>,
}
impl TestServer {
    fn new(limits: Limits) -> Self {
        let root = super::tests::temp();
        fs::write(root.join("hello.txt"), "hello").unwrap();
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let address = listener.local_addr().unwrap();
        let (stop, stop_rx) = mpsc::channel();
        let (reload, reload_rx) = mpsc::channel();
        let served = root.clone();
        let worker =
            thread::spawn(move || serve_with_limits(listener, served, stop_rx, reload_rx, limits));
        Self {
            root,
            address,
            stop,
            _reload: reload,
            worker: Some(worker),
        }
    }
    fn connect(&self) -> TcpStream {
        let stream = TcpStream::connect(self.address).unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(2)))
            .unwrap();
        stream
            .set_write_timeout(Some(Duration::from_secs(2)))
            .unwrap();
        stream
    }
    fn request(&self, path: &str) -> String {
        format!("GET {path} HTTP/1.1\r\nHost: {}\r\n\r\n", self.address)
    }
    fn exchange(&self, request: &str) -> String {
        let mut socket = self.connect();
        socket.write_all(request.as_bytes()).unwrap();
        let mut bytes = Vec::new();
        // Oversized requests may be reset on close with unread input still queued.
        // Accept that transport outcome only after receiving a complete HTTP reply.
        if let Err(error) = socket.read_to_end(&mut bytes) {
            assert_eq!(error.kind(), std::io::ErrorKind::ConnectionReset);
        }
        let text = String::from_utf8(bytes).unwrap();
        let (headers, body) = text.split_once("\r\n\r\n").expect("complete headers");
        let length: usize = headers
            .lines()
            .find_map(|line| line.strip_prefix("Content-Length: "))
            .unwrap()
            .parse()
            .unwrap();
        assert_eq!(body.len(), length);
        text
    }
    fn stop_promptly(&mut self) {
        self.stop.send(()).unwrap();
        let until = Instant::now() + Duration::from_secs(1);
        while !self.worker.as_ref().unwrap().is_finished() && Instant::now() < until {
            thread::sleep(Duration::from_millis(5));
        }
        assert!(
            self.worker.as_ref().unwrap().is_finished(),
            "stop blocked on a client"
        );
        self.worker.take().unwrap().join().unwrap();
    }
}
impl Drop for TestServer {
    fn drop(&mut self) {
        let _ = self.stop.send(());
        if let Some(worker) = self.worker.take() {
            worker.join().unwrap();
        }
        let _ = fs::remove_dir_all(&self.root);
    }
}

#[test]
fn host_and_http_framing_are_validated_before_serving() {
    let server = TestServer::new(Limits::default());
    let port = server.address.port();
    for host in [
        format!("127.0.0.1:{port}"),
        format!("localhost:{port}"),
        format!("LOCALHOST:{port}"),
    ] {
        assert!(server
            .exchange(&format!("GET /hello.txt HTTP/1.1\r\nhOsT: {host}\r\n\r\n"))
            .ends_with("hello"));
    }
    for headers in [
        "".to_string(),
        "Host: attacker.invalid:5500\r\n".into(),
        "Host: 127.0.0.1\r\n".into(),
        "Host: localhost:0\r\n".into(),
        format!("Host: {}\r\nHost: {}\r\n", server.address, server.address),
        format!("Host : {}\r\n", server.address),
        format!("Host: {}\r\n folded: value\r\n", server.address),
        format!("Host: {}\r\nTransfer-Encoding: chunked\r\n", server.address),
        format!("Host: {}\r\nContent-Length: 1\r\n", server.address),
        format!(
            "Host: {}\r\nContent-Length: 0\r\nContent-Length: 0\r\n",
            server.address
        ),
    ] {
        let result = server.exchange(&format!("GET /hello.txt HTTP/1.1\r\n{headers}\r\n"));
        assert!(result.starts_with("HTTP/1.1 4"), "{headers:?}: {result}");
        assert!(!result.ends_with("hello"));
    }
    for request in [
        "GET http://attacker.invalid/ HTTP/1.1",
        "GET //attacker.invalid/ HTTP/1.1",
        "GET / HTTP/1.0",
        "GET / HTTP/1.1 extra",
        "GET\t/ HTTP/1.1",
    ] {
        assert!(server
            .exchange(&format!("{request}\r\nHost: {}\r\n\r\n", server.address))
            .starts_with("HTTP/1.1 400"));
    }
    let result = server.exchange(&format!(
        "GET / HTTP/1.1\r\nHost: {}\r\nX-Pad: {}\r\n\r\n",
        server.address,
        "a".repeat(MAX_HEADER_BYTES)
    ));
    assert!(result.starts_with("HTTP/1.1 431"));
}

#[test]
fn sensitive_paths_are_hidden_but_well_known_assets_work() {
    let server = TestServer::new(Limits::default());
    for path in [
        ".env",
        ".env.local",
        ".git/config",
        "nested/.env",
        ".well-known/.env",
    ] {
        let file = server.root.join(path);
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(file, "AUDIT_DUMMY_SECRET").unwrap();
        let response = server.exchange(&server.request(&format!("/{path}")));
        assert!(response.starts_with("HTTP/1.1 404"), "{path}");
        assert!(!response.contains("AUDIT_DUMMY_SECRET"));
    }
    for target in [
        "/%2eenv",
        "/.git/",
        "/nested/%2eenv",
        "/../.env",
        "/%2e%2e/.env",
        "/bad%",
        "/bad%GG",
    ] {
        assert_eq!(respond(&server.root, "GET", target).status, 404, "{target}");
    }
    fs::write(server.root.join(".well-known/security.txt"), "contact").unwrap();
    assert!(server
        .exchange(&server.request("/.well-known/security.txt"))
        .ends_with("contact"));
    let listing = server.exchange(&server.request("/"));
    assert!(!listing.contains(".env"));
    assert!(!listing.contains(".git"));
    assert!(listing.contains(".well-known"));
}

#[cfg(unix)]
#[test]
fn symlink_aliases_and_indexes_cannot_expose_sensitive_targets() {
    use std::os::unix::fs::symlink;
    let server = TestServer::new(Limits::default());
    fs::write(server.root.join(".env"), "secret").unwrap();
    fs::create_dir(server.root.join(".git")).unwrap();
    fs::write(server.root.join(".git/config"), "secret").unwrap();
    symlink(".env", server.root.join("public.txt")).unwrap();
    symlink(".git", server.root.join("repo")).unwrap();
    symlink(".env", server.root.join("index.html")).unwrap();
    for path in ["/public.txt", "/repo/config", "/"] {
        assert_eq!(respond(&server.root, "GET", path).status, 404, "{path}");
    }
    fs::remove_file(server.root.join("index.html")).unwrap();
    let listing = String::from_utf8(respond(&server.root, "GET", "/").body).unwrap();
    assert!(!listing.contains("public.txt"));
    assert!(!listing.contains("repo"));
    symlink("hello.txt", server.root.join("safe.txt")).unwrap();
    assert_eq!(respond(&server.root, "GET", "/safe.txt").body, b"hello");
}

#[cfg(unix)]
#[test]
fn redirects_reject_crlf_and_round_trip_encoded_names() {
    let server = TestServer::new(Limits::default());
    fs::create_dir(server.root.join("dir\r\nX-Audit: injected")).unwrap();
    let result = server.exchange(&server.request("/dir%0D%0AX-Audit:%20injected"));
    assert!(result.starts_with("HTTP/1.1 404"));
    assert!(!result.contains("\r\nX-Audit:"));
    for name in ["space here", "žlutý?#%", "quote\"&"] {
        fs::create_dir(server.root.join(name)).unwrap();
        let target = format!("/{}", encode_segment(name));
        let response = respond(&server.root, "GET", &target);
        assert_eq!(response.location, Some(format!("{target}/")));
        assert_eq!(
            respond(&server.root, "GET", response.location.as_ref().unwrap()).status,
            200
        );
    }
    let mut malicious = reply(302, "text/plain", "");
    malicious.location = Some("/ok\r\nX-Audit: bad".into());
    let wire = String::from_utf8(response_bytes(malicious)).unwrap();
    assert!(wire.starts_with("HTTP/1.1 400"));
    assert!(!wire.contains("X-Audit"));
}

#[cfg(unix)]
#[test]
fn listing_links_are_relative_encoded_and_retrievable() {
    let server = TestServer::new(Limits::default());
    for name in [
        "javascript:alert(1)",
        "data:text,hello",
        "quote\"&?#.txt",
        "žluťoučký.txt",
    ] {
        fs::write(server.root.join(name), "fixture").unwrap();
        let listing = String::from_utf8(respond(&server.root, "GET", "/").body).unwrap();
        assert!(listing.contains(&format!("href=\"./{}\"", encode_segment(name))));
        assert!(!listing.contains("href=\"javascript:"));
        assert_eq!(
            respond(&server.root, "GET", &format!("/{}", encode_segment(name))).body,
            b"fixture"
        );
    }
}

#[test]
fn incomplete_requests_do_not_block_other_clients_or_stop() {
    let mut server = TestServer::new(Limits::default());
    let mut slow = server.connect();
    slow.write_all(b"GET / HTTP/1.1\r\nHost: ").unwrap();
    assert!(server
        .exchange(&server.request("/hello.txt"))
        .ends_with("hello"));
    server.stop_promptly();
    let mut byte = [0];
    assert!(matches!(slow.read(&mut byte), Ok(0) | Err(_)));
}

#[test]
fn request_deadline_is_absolute_even_with_trickled_bytes() {
    let limits = Limits {
        request_timeout: Duration::from_millis(120),
        ..Limits::default()
    };
    let server = TestServer::new(limits);
    let mut slow = server.connect();
    slow.write_all(b"GET /").unwrap();
    for _ in 0..8 {
        thread::sleep(Duration::from_millis(30));
        if slow.write_all(b"a").is_err() {
            break;
        }
    }
    let mut byte = [0];
    match slow.read(&mut byte) {
        Ok(0) => {}
        Err(e) if e.kind() == std::io::ErrorKind::ConnectionReset => {}
        other => panic!("request did not expire: {other:?}"),
    }
    assert!(server
        .exchange(&server.request("/hello.txt"))
        .ends_with("hello"));
}

#[test]
fn nonreading_client_does_not_block_peers_or_stop() {
    let mut server = TestServer::new(Limits::default());
    let file = fs::File::create(server.root.join("large.bin")).unwrap();
    file.set_len(MAX_FILE_BYTES).unwrap();
    let mut slow = server.connect();
    slow.write_all(server.request("/large.bin").as_bytes())
        .unwrap();
    thread::sleep(Duration::from_millis(100));
    assert!(server
        .exchange(&server.request("/hello.txt"))
        .ends_with("hello"));
    server.stop_promptly();
}

#[test]
fn write_deadline_reclaims_a_slot_from_a_nonreading_client() {
    let server = TestServer::new(Limits {
        clients: 1,
        events: 0,
        write_timeout: Duration::from_millis(100),
        ..Limits::default()
    });
    fs::File::create(server.root.join("large.bin"))
        .unwrap()
        .set_len(MAX_FILE_BYTES)
        .unwrap();
    let mut slow = server.connect();
    slow.write_all(server.request("/large.bin").as_bytes())
        .unwrap();
    thread::sleep(Duration::from_millis(350));
    assert!(server
        .exchange(&server.request("/hello.txt"))
        .ends_with("hello"));
}

#[test]
fn connection_cap_is_enforced_and_slot_is_reclaimed() {
    let server = TestServer::new(Limits {
        clients: 1,
        ..Limits::default()
    });
    let mut slow = server.connect();
    slow.write_all(b"GET /").unwrap();
    thread::sleep(Duration::from_millis(50));
    let mut excess = server.connect();
    let mut byte = [0];
    assert_eq!(excess.read(&mut byte).unwrap(), 0);
    drop(slow);
    thread::sleep(Duration::from_millis(50));
    assert!(server
        .exchange(&server.request("/hello.txt"))
        .ends_with("hello"));
}

fn read_headers(stream: &mut TcpStream) -> String {
    let mut result = Vec::new();
    let mut byte = [0];
    while !result.ends_with(b"\r\n\r\n") {
        stream.read_exact(&mut byte).unwrap();
        result.push(byte[0]);
    }
    String::from_utf8(result).unwrap()
}

#[test]
fn sse_cap_and_disconnect_cleanup_preserve_normal_requests() {
    let mut server = TestServer::new(Limits {
        events: 1,
        ..Limits::default()
    });
    let mut first = server.connect();
    first
        .write_all(server.request("/__mide/live").as_bytes())
        .unwrap();
    assert!(read_headers(&mut first).starts_with("HTTP/1.1 200"));
    assert!(server
        .exchange(&server.request("/__mide/live"))
        .starts_with("HTTP/1.1 503"));
    assert!(server
        .exchange(&server.request("/hello.txt"))
        .ends_with("hello"));
    drop(first);
    thread::sleep(Duration::from_millis(50));
    let mut replacement = server.connect();
    replacement
        .write_all(server.request("/__mide/live").as_bytes())
        .unwrap();
    assert!(read_headers(&mut replacement).starts_with("HTTP/1.1 200"));
    server.stop_promptly();
}

#[test]
fn large_files_and_directories_have_finite_limits() {
    let server = TestServer::new(Limits::default());
    fs::File::create(server.root.join("huge.bin"))
        .unwrap()
        .set_len(MAX_FILE_BYTES + 1)
        .unwrap();
    assert_eq!(respond(&server.root, "GET", "/huge.bin").status, 413);
    fs::create_dir(server.root.join("many")).unwrap();
    for i in 0..=MAX_DIRECTORY_ENTRIES {
        fs::write(server.root.join(format!("many/{i}")), "").unwrap();
    }
    assert_ne!(respond(&server.root, "GET", "/many/").status, 200);
}
