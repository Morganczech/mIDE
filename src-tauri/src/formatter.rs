use crate::filesystem::{AppError, Result};
use std::{
    io::Write,
    process::{Command, Stdio},
};
use tauri::{path::BaseDirectory, AppHandle, Manager};

#[tauri::command]
pub async fn format_document(app: AppHandle, path: String, text: String) -> Result<String> {
    if text.len() > 16 * 1024 * 1024 {
        return Err(AppError::new(
            "LARGE_FILE",
            "Document is too large to format",
        ));
    }
    let script = if cfg!(debug_assertions) {
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/formatter/format.mjs")
    } else {
        app.path()
            .resolve("formatter/format.mjs", BaseDirectory::Resource)
            .map_err(|e| AppError::new("RESOURCE", e.to_string()))?
    };
    tauri::async_runtime::spawn_blocking(move || {
        let mut command = Command::new("node");
        command.arg(script).arg(path).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
        #[cfg(windows)]
        { use std::os::windows::process::CommandExt; command.creation_flags(0x08000000); }
        let mut child = command.spawn().map_err(|e| AppError::new("FORMATTER", format!("Cannot start Node.js. Install Node.js 22.12+ and make it available on PATH. {e}")))?;
        let mut stdin = child.stdin.take().ok_or_else(|| AppError::new("FORMATTER", "Formatter input unavailable"))?;
        // Write and drain output concurrently to avoid pipe deadlocks on larger documents.
        let writer = std::thread::spawn(move || stdin.write_all(text.as_bytes()));
        let output = child.wait_with_output()?;
        writer.join().map_err(|_| AppError::new("FORMATTER", "Formatter input failed"))??;
        if !output.status.success() { return Err(AppError::new("FORMATTER", String::from_utf8_lossy(&output.stderr).into_owned())); }
        String::from_utf8(output.stdout).map_err(|e| AppError::new("FORMATTER", e.to_string()))
    }).await.map_err(|e| AppError::new("FORMATTER", e.to_string()))?
}
