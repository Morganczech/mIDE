use crate::filesystem::{AppError, Result};
use std::io::Read;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

const MAX_SIZE: usize = 1048576;

fn read_sources(reader: impl Read) -> Result<String> {
    let mut bytes = Vec::new();
    reader.take((MAX_SIZE + 1) as u64).read_to_end(&mut bytes)?;
    if bytes.len() > MAX_SIZE {
        return Err(AppError::new("SIZE", "Sources file must be at most 1 MiB."));
    }
    String::from_utf8(bytes).map_err(|_| AppError::new("ENCODING", "Sources must be UTF-8 JSON."))
}

#[tauri::command]
pub async fn import_sources(app: AppHandle) -> Result<Option<String>> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(file) = app
            .dialog()
            .file()
            .add_filter("mIDE Sources", &["json"])
            .blocking_pick_file()
        else {
            return Ok(None);
        };
        let path = file
            .into_path()
            .map_err(|_| AppError::new("PATH", "Invalid Sources path"))?;
        read_sources(std::fs::File::open(path)?).map(Some)
    })
    .await
    .map_err(|_| AppError::new("SOURCES", "Unable to open Sources file"))?
}

#[tauri::command]
pub async fn export_sources(app: AppHandle, text: String) -> Result<bool> {
    if text.len() > MAX_SIZE {
        return Err(AppError::new("SIZE", "Sources file must be at most 1 MiB."));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let Some(file) = app
            .dialog()
            .file()
            .add_filter("mIDE Sources", &["json"])
            .set_file_name("mide-sources.json")
            .blocking_save_file()
        else {
            return Ok(false);
        };
        let path = file
            .into_path()
            .map_err(|_| AppError::new("PATH", "Invalid Sources path"))?;
        std::fs::write(path, text)?;
        Ok(true)
    })
    .await
    .map_err(|_| AppError::new("SOURCES", "Unable to export Sources file"))?
}

fn validated_url(value: &str) -> Result<tauri::Url> {
    let url = tauri::Url::parse(value).map_err(|_| AppError::new("URL", "Invalid URL"))?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(AppError::new(
            "URL",
            "Only HTTP and HTTPS URLs without credentials can be opened.",
        ));
    }
    Ok(url)
}

#[tauri::command]
pub async fn open_source_url(url: String) -> Result<()> {
    let url = validated_url(&url)?;
    #[cfg(not(target_os = "windows"))]
    crate::live_server::open_browser(url.as_str())?;
    #[cfg(target_os = "windows")]
    {
        // ShellExecuteW opens a URL through the registered handler, without cmd.exe.
        use std::os::windows::ffi::OsStrExt;
        #[link(name = "shell32")]
        extern "system" {
            fn ShellExecuteW(
                hwnd: *mut std::ffi::c_void,
                operation: *const u16,
                file: *const u16,
                parameters: *const u16,
                directory: *const u16,
                show: i32,
            ) -> isize;
        }
        let wide: Vec<u16> = std::ffi::OsStr::new(url.as_str())
            .encode_wide()
            .chain(Some(0))
            .collect();
        // wide is NUL-terminated and remains alive for the duration of the call.
        let result = unsafe {
            ShellExecuteW(
                std::ptr::null_mut(),
                std::ptr::null(),
                wide.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                1,
            )
        };
        if result <= 32 {
            return Err(AppError::new("BROWSER", "Unable to open the browser."));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn external_urls() {
        assert!(validated_url("https://developer.mozilla.org/en-US/").is_ok());
        assert!(validated_url("http://localhost:3000").is_ok());
        for value in [
            "javascript:alert(1)",
            "file:///etc/passwd",
            "data:text/html,hi",
            "https://user:pass@example.com",
            "not a url",
        ] {
            assert!(validated_url(value).is_err());
        }
    }

    #[test]
    fn import_size_and_encoding() {
        assert_eq!(read_sources(b"{}".as_slice()).unwrap(), "{}");
        assert!(read_sources(vec![b' '; MAX_SIZE].as_slice()).is_ok());
        assert_eq!(
            read_sources(vec![b' '; MAX_SIZE + 1].as_slice())
                .unwrap_err()
                .code,
            "SIZE"
        );
        assert_eq!(
            read_sources([0xff].as_slice()).unwrap_err().code,
            "ENCODING"
        );
    }
}
