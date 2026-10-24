use crate::filesystem::{AppError, Result, Workspace};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::{
    io::{Read, Write},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Condvar, Mutex,
    },
};
use tauri::{ipc::Channel, State};

static NEXT_ID: AtomicU64 = AtomicU64::new(1);
const MAX_PENDING: usize = 256 * 1024;
#[derive(Default)]
pub struct TerminalState(Mutex<Option<Session>>);
struct Flow {
    pending: usize,
    closed: bool,
}
struct Session {
    id: u64,
    master: Box<dyn MasterPty + Send>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    child: Box<dyn Child + Send + Sync>,
    flow: Arc<(Mutex<Flow>, Condvar)>,
}
#[derive(Clone, Serialize)]
#[serde(tag = "type", content = "data", rename_all = "lowercase")]
pub enum Output {
    Data(Vec<u8>),
    Exit,
    Error(String),
}
impl Session {
    fn stop(&mut self) {
        let (lock, wake) = &*self.flow;
        if let Ok(mut flow) = lock.lock() {
            flow.closed = true;
            wake.notify_all();
        }
        if self.child.try_wait().ok().flatten().is_some() {
            return;
        }
        #[cfg(unix)]
        if let Some(pid) = self.child.process_id() {
            // PTYs create a new session. Include background jobs, which may have
            // process groups different from the shell's foreground group.
            unsafe {
                let session_id = libc::getsid(pid as i32);
                if session_id == pid as i32 {
                    if let Ok(output) = std::process::Command::new("ps")
                        .args(["-e", "-o", "pid="])
                        .output()
                    {
                        for candidate in String::from_utf8_lossy(&output.stdout)
                            .split_whitespace()
                            .filter_map(|value| value.parse::<i32>().ok())
                        {
                            if candidate != pid as i32 && libc::getsid(candidate) == session_id {
                                libc::kill(candidate, libc::SIGHUP);
                                libc::kill(candidate, libc::SIGKILL);
                            }
                        }
                    }
                }
                if let Some(group) = self
                    .master
                    .process_group_leader()
                    .filter(|group| *group > 0)
                {
                    libc::kill(-group, libc::SIGHUP);
                    libc::kill(-group, libc::SIGKILL);
                }
                libc::kill(-(pid as i32), libc::SIGHUP);
                libc::kill(-(pid as i32), libc::SIGKILL);
            }
        }
        #[cfg(windows)]
        if let Some(pid) = self.child.process_id() {
            use std::os::windows::process::CommandExt;
            let _ = std::process::Command::new("taskkill.exe")
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .creation_flags(0x08000000)
                .output();
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
impl Drop for TerminalState {
    fn drop(&mut self) {
        if let Ok(Some(session)) = self.0.get_mut() {
            session.stop();
        }
    }
}
impl TerminalState {
    pub fn stop(&self) {
        if let Ok(mut slot) = self.0.lock() {
            if let Some(mut session) = slot.take() {
                session.stop();
            }
        }
    }
    pub fn running(&self) -> bool {
        self.0
            .lock()
            .ok()
            .and_then(|mut slot| {
                slot.as_mut()
                    .map(|s| s.child.try_wait().ok().flatten().is_none())
            })
            .unwrap_or(false)
    }
}
fn pty_error(e: impl std::fmt::Display) -> AppError {
    AppError::new("TERMINAL", e.to_string())
}
fn size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        rows: rows.clamp(1, 500),
        cols: cols.clamp(1, 1000),
        pixel_width: 0,
        pixel_height: 0,
    }
}
fn shell() -> String {
    #[cfg(unix)]
    {
        // Reentrant account lookup; no shared libc passwd buffer across IPC threads.
        unsafe {
            let mut entry: libc::passwd = std::mem::zeroed();
            let mut result = std::ptr::null_mut();
            let mut buffer = vec![0u8; 16384];
            if libc::getpwuid_r(
                libc::geteuid(),
                &mut entry,
                buffer.as_mut_ptr().cast(),
                buffer.len(),
                &mut result,
            ) == 0
                && !result.is_null()
                && !entry.pw_shell.is_null()
            {
                let value = std::ffi::CStr::from_ptr(entry.pw_shell).to_string_lossy();
                if !value.is_empty() {
                    return value.into_owned();
                }
            }
        }
        std::env::var("SHELL")
            .ok()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "/bin/sh".into())
    }
    #[cfg(windows)]
    {
        std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".into())
    }
}
#[tauri::command]
pub fn terminal_start(
    workspace: State<'_, Workspace>,
    terminal: State<'_, TerminalState>,
    output: Channel<Output>,
    cols: u16,
    rows: u16,
) -> Result<u64> {
    let root = workspace.root()?;
    let mut slot = terminal.0.lock().map_err(pty_error)?;
    if slot.is_some() {
        return Err(AppError::new(
            "TERMINAL",
            "A terminal session already exists",
        ));
    }
    let pair = native_pty_system()
        .openpty(size(cols, rows))
        .map_err(pty_error)?;
    let mut command = CommandBuilder::new(shell());
    command.cwd(root);
    #[cfg(unix)]
    {
        command.arg("-i");
        command.env("TERM", "xterm-256color");
    }
    let child = pair.slave.spawn_command(command).map_err(pty_error)?;
    drop(pair.slave);
    let mut reader = pair.master.try_clone_reader().map_err(pty_error)?;
    let writer = pair.master.take_writer().map_err(pty_error)?;
    let flow = Arc::new((
        Mutex::new(Flow {
            pending: 0,
            closed: false,
        }),
        Condvar::new(),
    ));
    let read_flow = flow.clone();
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    *slot = Some(Session {
        id,
        master: pair.master,
        writer: Arc::new(Mutex::new(writer)),
        child,
        flow,
    });
    std::thread::spawn(move || {
        let mut buffer = [0u8; 8192];
        loop {
            let (lock, wake) = &*read_flow;
            let Ok(mut flow) = lock.lock() else { break };
            while flow.pending >= MAX_PENDING && !flow.closed {
                flow = match wake.wait(flow) {
                    Ok(value) => value,
                    Err(_) => return,
                };
            }
            if flow.closed {
                break;
            }
            drop(flow);
            match reader.read(&mut buffer) {
                Ok(0) => {
                    let _ = output.send(Output::Exit);
                    break;
                }
                Ok(count) => {
                    if let Ok(mut flow) = lock.lock() {
                        flow.pending += count;
                    }
                    if output.send(Output::Data(buffer[..count].to_vec())).is_err() {
                        break;
                    }
                }
                Err(error) => {
                    #[cfg(unix)]
                    if error.raw_os_error() == Some(libc::EIO) {
                        let _ = output.send(Output::Exit);
                        break;
                    }
                    let _ = output.send(Output::Error(error.to_string()));
                    break;
                }
            }
        }
    });
    Ok(id)
}
#[tauri::command]
pub async fn terminal_write(
    terminal: State<'_, TerminalState>,
    id: u64,
    data: String,
) -> Result<()> {
    if data.len() > 1024 * 1024 {
        return Err(AppError::new("TERMINAL", "Input is too large"));
    }
    let writer = {
        let slot = terminal.0.lock().map_err(pty_error)?;
        slot.as_ref()
            .filter(|s| s.id == id)
            .map(|s| s.writer.clone())
    };
    if let Some(writer) = writer {
        tauri::async_runtime::spawn_blocking(move || -> Result<()> {
            let mut writer = writer.lock().map_err(pty_error)?;
            writer.write_all(data.as_bytes())?;
            writer.flush()?;
            Ok(())
        })
        .await
        .map_err(pty_error)??;
    }
    Ok(())
}
#[tauri::command]
pub fn terminal_resize(
    terminal: State<'_, TerminalState>,
    id: u64,
    cols: u16,
    rows: u16,
) -> Result<()> {
    let slot = terminal.0.lock().map_err(pty_error)?;
    if let Some(session) = slot.as_ref().filter(|s| s.id == id) {
        session.master.resize(size(cols, rows)).map_err(pty_error)?;
    }
    Ok(())
}
#[tauri::command]
pub fn terminal_ack(terminal: State<'_, TerminalState>, id: u64, bytes: usize) {
    if let Ok(slot) = terminal.0.lock() {
        if let Some(session) = slot.as_ref().filter(|s| s.id == id) {
            let (lock, wake) = &*session.flow;
            if let Ok(mut flow) = lock.lock() {
                flow.pending = flow.pending.saturating_sub(bytes);
                wake.notify_one();
            }
        }
    }
}
#[tauri::command]
pub fn terminal_stop(terminal: State<'_, TerminalState>, id: u64) -> Result<()> {
    let mut slot = terminal.0.lock().map_err(pty_error)?;
    if slot.as_ref().is_some_and(|s| s.id == id) {
        if let Some(mut session) = slot.take() {
            session.stop();
        }
    }
    Ok(())
}
#[tauri::command]
pub fn terminal_running(terminal: State<'_, TerminalState>) -> bool {
    terminal.running()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn clamps_dimensions_and_selects_real_shell() {
        assert_eq!(size(0, 0).cols, 1);
        assert_eq!(size(u16::MAX, u16::MAX).rows, 500);
        assert!(!shell().is_empty());
    }
    #[test]
    fn real_pty_accepts_input_and_resize() {
        let pair = native_pty_system().openpty(size(80, 24)).unwrap();
        let mut cmd = CommandBuilder::new(shell());
        #[cfg(unix)]
        {
            cmd.arg("-c");
            cmd.arg("read value; printf 'mide-%s' \"$value\"");
        }
        #[cfg(windows)]
        {
            cmd.arg("/C");
            cmd.arg("set /p value= & echo mide-ready");
        }
        let mut child = pair.slave.spawn_command(cmd).unwrap();
        drop(pair.slave);
        pair.master.resize(size(100, 30)).unwrap();
        let mut writer = pair.master.take_writer().unwrap();
        writer.write_all(b"ready\r").unwrap();
        let mut reader = pair.master.try_clone_reader().unwrap();
        let mut result = Vec::new();
        let mut buffer = [0u8; 1024];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(n) => result.extend_from_slice(&buffer[..n]),
            }
        }
        assert!(child.wait().unwrap().success());
        assert!(String::from_utf8_lossy(&result).contains("mide-ready"));
    }
}
