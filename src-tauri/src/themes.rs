use crate::filesystem::{AppError, Result};
use std::io::Read;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn import_theme(app: AppHandle) -> Result<Option<String>> {
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(feature = "smoke-test")]
        let test_path = std::env::var_os("MIDE_SMOKE_THEME").map(std::path::PathBuf::from);
        #[cfg(not(feature = "smoke-test"))]
        let test_path: Option<std::path::PathBuf> = None;
        let path = if let Some(path) = test_path {
            path
        } else {
            let Some(file) = app
                .dialog()
                .file()
                .add_filter("mIDE theme", &["json"])
                .blocking_pick_file()
            else {
                return Ok(None);
            };
            file.into_path()
                .map_err(|_| AppError::new("PATH", "Invalid theme path"))?
        };
        let mut bytes = Vec::new();
        std::fs::File::open(path)?
            .take(65537)
            .read_to_end(&mut bytes)?;
        if bytes.len() > 65536 {
            return Err(AppError::new(
                "SIZE",
                "Theme file must be smaller than 64 KiB.",
            ));
        }
        let text = String::from_utf8(bytes)
            .map_err(|_| AppError::new("ENCODING", "Theme must be UTF-8 JSON."))?;
        Ok(Some(text))
    })
    .await
    .map_err(|_| AppError::new("THEME", "Unable to open theme file"))?
}
