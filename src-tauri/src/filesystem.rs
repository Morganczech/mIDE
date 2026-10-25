use serde::Serialize;
use std::{
    collections::hash_map::DefaultHasher,
    fs,
    hash::{Hash, Hasher},
    io::Write,
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

const MAX_FILE_SIZE: u64 = 16 * 1024 * 1024;
static SAVE_ID: AtomicU64 = AtomicU64::new(0);
#[derive(Default)]
pub struct Workspace(pub Mutex<Option<PathBuf>>);
#[derive(Debug, Serialize)]
pub struct AppError {
    pub code: &'static str,
    pub message: String,
}
pub type Result<T> = std::result::Result<T, AppError>;
impl AppError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}
impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        Self::new("IO", e.to_string())
    }
}
#[derive(Serialize)]
pub struct Project {
    name: String,
    path: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    name: String,
    path: String,
    is_directory: bool,
    is_symlink: bool,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub text: String,
    pub revision: String,
    pub bom: bool,
    pub line_ending: String,
}

impl Workspace {
    pub fn root(&self) -> Result<PathBuf> {
        self.0
            .lock()
            .map_err(|_| AppError::new("STATE", "Workspace unavailable"))?
            .clone()
            .ok_or_else(|| AppError::new("NO_PROJECT", "Open a folder first"))
    }
}
fn relative(path: &str) -> Result<&Path> {
    let p = Path::new(path);
    if p.components().any(|c| !matches!(c, Component::Normal(_))) && !path.is_empty() {
        return Err(AppError::new("PATH", "Path must stay inside the project"));
    }
    Ok(p)
}
pub fn existing(root: &Path, path: &str) -> Result<PathBuf> {
    let p = root.join(relative(path)?).canonicalize()?;
    if !p.starts_with(root) {
        return Err(AppError::new("PATH", "Symlink points outside the project"));
    }
    Ok(p)
}
fn target(root: &Path, path: &str) -> Result<PathBuf> {
    let rel = relative(path)?;
    let name = rel
        .file_name()
        .ok_or_else(|| AppError::new("PATH", "Project root cannot be modified"))?;
    let parent = root
        .join(rel.parent().unwrap_or(Path::new("")))
        .canonicalize()?;
    if !parent.starts_with(root) {
        return Err(AppError::new("PATH", "Path must stay inside the project"));
    }
    Ok(parent.join(name))
}
fn revision(bytes: &[u8]) -> String {
    let mut hash = DefaultHasher::new();
    bytes.hash(&mut hash);
    format!("{:016x}", hash.finish())
}
fn read_bytes(path: &Path) -> Result<Vec<u8>> {
    let file = fs::File::open(path)?;
    if file.metadata()?.len() > MAX_FILE_SIZE {
        return Err(AppError::new(
            "LARGE_FILE",
            "Files larger than 16 MiB are not supported",
        ));
    }
    use std::io::Read;
    let mut bytes = Vec::new();
    file.take(MAX_FILE_SIZE + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_FILE_SIZE {
        return Err(AppError::new("LARGE_FILE", "File is too large"));
    }
    Ok(bytes)
}
pub fn read_document(path: &Path) -> Result<Document> {
    let bytes = read_bytes(path)?;
    let bom = bytes.starts_with(&[0xef, 0xbb, 0xbf]);
    let data = if bom { &bytes[3..] } else { &bytes };
    if data.contains(&0) {
        return Err(AppError::new("BINARY", "This is a binary file"));
    }
    let text = std::str::from_utf8(data)
        .map_err(|_| AppError::new("ENCODING", "Only UTF-8 text files are supported"))?
        .to_owned();
    let line_ending = if text.contains("\r\n") { "CRLF" } else { "LF" }.to_owned();
    Ok(Document {
        text,
        revision: revision(&bytes),
        bom,
        line_ending,
    })
}
pub fn write_document(path: &Path, text: &str, expected: &str, bom: bool) -> Result<String> {
    if revision(&read_bytes(path)?) != expected {
        return Err(AppError::new(
            "CONFLICT",
            "File changed on disk. Reopen it before saving, or keep your changes in another file.",
        ));
    }
    let mut bytes = Vec::new();
    if bom {
        bytes.extend_from_slice(&[0xef, 0xbb, 0xbf]);
    }
    bytes.extend_from_slice(text.as_bytes());
    let parent = path
        .parent()
        .ok_or_else(|| AppError::new("PATH", "Invalid file path"))?;
    let temp = parent.join(format!(
        ".mide-save-{}-{}",
        std::process::id(),
        SAVE_ID.fetch_add(1, Ordering::Relaxed)
    ));
    let result = (|| -> Result<()> {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)?;
        file.set_permissions(fs::metadata(path)?.permissions())?;
        file.write_all(&bytes)?;
        file.sync_all()?;
        // Recheck after writing the temporary file, before replacing the original.
        if revision(&read_bytes(path)?) != expected {
            return Err(AppError::new(
                "CONFLICT",
                "File changed on disk while saving",
            ));
        }
        fs::rename(&temp, path)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result?;
    Ok(revision(&bytes))
}

#[tauri::command]
pub async fn open_project(
    app: AppHandle,
    path: Option<String>,
    workspace: State<'_, Workspace>,
    terminal: State<'_, crate::terminal::TerminalState>,
) -> Result<Option<Project>> {
    #[cfg(feature = "smoke-test")]
    if let Some(folder) = path
        .is_none()
        .then(|| std::env::var("MIDE_SMOKE_PROJECT").ok())
        .flatten()
    {
        let path = PathBuf::from(folder).canonicalize()?;
        let project = Project {
            name: "mide-native-smoke".into(),
            path: path.to_string_lossy().into_owned(),
        };
        terminal.stop();
        *workspace
            .0
            .lock()
            .map_err(|_| AppError::new("STATE", "Workspace unavailable"))? = Some(path);
        return Ok(Some(project));
    }
    let folder = if let Some(path) = path {
        let path = PathBuf::from(path);
        if !path.is_absolute() {
            return Err(AppError::new(
                "PATH",
                "Choose an absolute project folder path",
            ));
        }
        path
    } else {
        let folder = tauri::async_runtime::spawn_blocking(move || {
            app.dialog().file().blocking_pick_folder()
        })
        .await
        .map_err(|e| AppError::new("DIALOG", e.to_string()))?;
        let Some(folder) = folder else {
            return Ok(None);
        };
        folder
            .into_path()
            .map_err(|e| AppError::new("PATH", e.to_string()))?
    };
    let path = project_directory(&folder)?;
    terminal.stop();
    let project = Project {
        name: path
            .file_name()
            .unwrap_or(path.as_os_str())
            .to_string_lossy()
            .into_owned(),
        path: path.to_string_lossy().into_owned(),
    };
    *workspace
        .0
        .lock()
        .map_err(|_| AppError::new("STATE", "Workspace unavailable"))? = Some(path);
    Ok(Some(project))
}
fn project_directory(folder: &Path) -> Result<PathBuf> {
    let path = folder.canonicalize().map_err(|error| {
        AppError::new(
            "PROJECT",
            format!("Cannot open {}: {error}", folder.display()),
        )
    })?;
    if !path.is_dir() {
        return Err(AppError::new(
            "PROJECT",
            "This project path is not a folder",
        ));
    }
    fs::read_dir(&path).map_err(|error| {
        AppError::new(
            "PROJECT",
            format!("Cannot read {}: {error}", folder.display()),
        )
    })?;
    Ok(path)
}

#[tauri::command]
pub fn list_directory(workspace: State<'_, Workspace>, path: String) -> Result<Vec<Entry>> {
    let root = workspace.root()?;
    let directory = existing(&root, &path)?;
    let mut entries = Vec::new();
    for item in fs::read_dir(directory)? {
        let item = item?;
        let name = item.file_name().to_string_lossy().into_owned();
        let rel = if path.is_empty() {
            name.clone()
        } else {
            format!("{path}/{name}")
        };
        let is_symlink = item.file_type()?.is_symlink();
        entries.push(Entry {
            name,
            path: rel,
            is_directory: item.path().is_dir(),
            is_symlink,
        });
    }
    entries.sort_by(|a, b| {
        b.is_directory
            .cmp(&a.is_directory)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}
#[tauri::command]
pub fn read_file(workspace: State<'_, Workspace>, path: String) -> Result<Document> {
    read_document(&existing(&workspace.root()?, &path)?)
}
#[tauri::command]
pub fn save_file(
    workspace: State<'_, Workspace>,
    path: String,
    text: String,
    revision: String,
    bom: bool,
) -> Result<String> {
    write_document(&existing(&workspace.root()?, &path)?, &text, &revision, bom)
}
#[tauri::command]
pub fn create_entry(workspace: State<'_, Workspace>, path: String, directory: bool) -> Result<()> {
    let dest = target(&workspace.root()?, &path)?;
    if directory {
        fs::create_dir(dest)?;
    } else {
        fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(dest)?;
    }
    Ok(())
}
#[tauri::command]
pub fn rename_entry(
    workspace: State<'_, Workspace>,
    path: String,
    destination: String,
) -> Result<()> {
    move_entry(&workspace.root()?, &path, &destination)
}

fn move_entry(root: &Path, path: &str, destination: &str) -> Result<()> {
    let source = target(root, path)?;
    let dest = target(root, destination)?;
    if source == dest {
        return Ok(());
    }
    if fs::symlink_metadata(&dest).is_ok() {
        return Err(AppError::new(
            "EXISTS",
            "An item with that name already exists",
        ));
    }
    if source.is_dir() && dest.starts_with(&source) {
        return Err(AppError::new(
            "PATH",
            "A folder cannot be moved into itself",
        ));
    }
    fs::rename(source, dest)?;
    Ok(())
}
#[tauri::command]
pub fn delete_entry(workspace: State<'_, Workspace>, path: String) -> Result<()> {
    let dest = target(&workspace.root()?, &path)?;
    let metadata = fs::symlink_metadata(&dest)?;
    if metadata.is_symlink() || !metadata.is_dir() {
        fs::remove_file(dest)?;
    } else {
        fs::remove_dir_all(dest)?;
    }
    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageData {
    bytes: Vec<u8>,
    mime: &'static str,
    size: usize,
}

#[tauri::command]
pub fn read_image(workspace: State<'_, Workspace>, path: String) -> Result<ImageData> {
    image_data(&workspace.root()?, &path)
}

fn image_data(root: &Path, path: &str) -> Result<ImageData> {
    let source = existing(root, path)?;
    let extension = source
        .extension()
        .and_then(|v| v.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let mime = match extension.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        _ => return Err(AppError::new("IMAGE", "Unsupported image format")),
    };
    let bytes = read_bytes(&source)?;
    Ok(ImageData {
        size: bytes.len(),
        bytes,
        mime,
    })
}

#[derive(Serialize)]
pub struct ImportReport {
    copied: Vec<String>,
    failed: Vec<String>,
}

pub fn copy_external(root: &Path, source: &Path, directory: &str) -> Result<String> {
    if !source.is_absolute() {
        return Err(AppError::new("IMPORT", "Choose an absolute source path"));
    }
    let metadata = fs::symlink_metadata(source)?;
    if !metadata.is_file() {
        return Err(AppError::new(
            "IMPORT",
            "Only regular files can be imported",
        ));
    }
    let name = source
        .file_name()
        .and_then(|v| v.to_str())
        .ok_or_else(|| AppError::new("PATH", "Invalid filename"))?;
    let relative = if directory.is_empty() {
        name.to_owned()
    } else {
        format!("{directory}/{name}")
    };
    let destination = target(root, &relative)?;
    let mut input = fs::File::open(source)?;
    let mut output = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&destination)?;
    let result = std::io::copy(&mut input, &mut output).and_then(|_| output.sync_all());
    if let Err(error) = result {
        drop(output);
        let _ = fs::remove_file(destination);
        return Err(error.into());
    }
    Ok(relative)
}

#[tauri::command]
pub async fn import_files(
    workspace: State<'_, Workspace>,
    paths: Vec<String>,
    directory: String,
) -> Result<ImportReport> {
    let root = workspace.root()?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut report = ImportReport {
            copied: vec![],
            failed: vec![],
        };
        for path in paths {
            match copy_external(&root, Path::new(&path), &directory) {
                Ok(path) => report.copied.push(path),
                Err(error) => report.failed.push(format!(
                    "{}: {}",
                    Path::new(&path)
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy(),
                    error.message
                )),
            }
        }
        Ok(report)
    })
    .await
    .map_err(|e| AppError::new("IMPORT", e.to_string()))?
}

#[tauri::command]
pub fn copy_entry_path(
    app: AppHandle,
    workspace: State<'_, Workspace>,
    path: String,
    absolute: bool,
) -> Result<String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    let destination = target(&workspace.root()?, &path)?;
    fs::symlink_metadata(&destination)?;
    let text = if absolute {
        destination.to_string_lossy().into_owned()
    } else {
        path.replace('\\', "/")
    };
    app.clipboard()
        .write_text(text.clone())
        .map_err(|e| AppError::new("CLIPBOARD", e.to_string()))?;
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> PathBuf {
        let p = std::env::temp_dir().join(format!(
            "mide-test-{}-{}",
            std::process::id(),
            SAVE_ID.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&p).unwrap();
        p.canonicalize().unwrap()
    }
    #[test]
    fn rejects_escape_and_root_mutation() {
        let root = fixture();
        assert!(existing(&root, "../escape").is_err());
        assert!(existing(&root, "/etc/passwd").is_err());
        assert!(target(&root, "").is_err());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn preserves_bom_crlf_unicode_and_detects_conflict() {
        let root = fixture();
        let path = root.join("žluťoučký.ts");
        fs::write(&path, b"\xef\xbb\xbfconst a = 1;\r\n").unwrap();
        let doc = read_document(&path).unwrap();
        assert!(doc.bom);
        assert_eq!(doc.line_ending, "CRLF");
        write_document(&path, "const a = 2;\r\n", &doc.revision, doc.bom).unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"\xef\xbb\xbfconst a = 2;\r\n");
        assert_eq!(
            write_document(&path, "lost", &doc.revision, true)
                .unwrap_err()
                .code,
            "CONFLICT"
        );
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn rejects_binary_and_invalid_utf8() {
        let root = fixture();
        let path = root.join("binary");
        fs::write(&path, [0, 1]).unwrap();
        assert_eq!(read_document(&path).unwrap_err().code, "BINARY");
        fs::write(&path, [255]).unwrap();
        assert_eq!(read_document(&path).unwrap_err().code, "ENCODING");
        fs::remove_dir_all(root).unwrap();
    }
    #[cfg(unix)]
    #[test]
    fn rejects_symlink_outside_project() {
        let root = fixture();
        std::os::unix::fs::symlink(std::env::temp_dir(), root.join("outside")).unwrap();
        assert!(existing(&root, "outside").is_err());
        assert!(target(&root, "outside/file").is_err());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn moves_files_and_folders_without_replacing_destinations() {
        let root = fixture();
        fs::create_dir(root.join("assets")).unwrap();
        fs::create_dir(root.join("source")).unwrap();
        fs::write(root.join("source/a.svg"), b"image").unwrap();
        move_entry(&root, "source", "assets/source").unwrap();
        assert_eq!(
            fs::read(root.join("assets/source/a.svg")).unwrap(),
            b"image"
        );
        assert!(move_entry(&root, "assets", "assets/source/nested").is_err());
        assert!(move_entry(&root, "assets/source", "../outside").is_err());
        assert!(move_entry(&root, "assets/source", "").is_err());
        fs::write(root.join("a.svg"), b"existing").unwrap();
        assert_eq!(
            move_entry(&root, "assets/source/a.svg", "a.svg")
                .unwrap_err()
                .code,
            "EXISTS"
        );
        assert_eq!(fs::read(root.join("a.svg")).unwrap(), b"existing");
        move_entry(&root, "a.svg", "a.svg").unwrap();
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn imports_regular_files_without_modifying_sources_or_collisions() {
        let root = fixture();
        let outside = fixture();
        fs::create_dir(root.join("assets")).unwrap();
        fs::write(outside.join("žluťoučký.png"), [0, 1, 2, 255]).unwrap();
        let source = outside.join("žluťoučký.png");
        assert_eq!(
            copy_external(&root, &source, "assets").unwrap(),
            "assets/žluťoučký.png"
        );
        assert_eq!(
            fs::read(&source).unwrap(),
            fs::read(root.join("assets/žluťoučký.png")).unwrap()
        );
        assert!(copy_external(&root, &source, "assets").is_err());
        assert!(copy_external(&root, &outside, "assets").is_err());
        assert!(copy_external(&root, &source, "../escape").is_err());
        assert!(copy_external(&root, &source, "/tmp").is_err());
        assert!(copy_external(&root, &outside.join("missing"), "assets").is_err());
        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(outside).unwrap();
    }
    #[test]
    fn reads_image_bytes_with_a_size_limit() {
        let root = fixture();
        fs::write(root.join("icon.SVG"), b"<svg/>").unwrap();
        let image = image_data(&root, "icon.SVG").unwrap();
        assert_eq!(image.mime, "image/svg+xml");
        assert_eq!(image.size, 6);
        assert_eq!(image.bytes, b"<svg/>");
        fs::write(root.join("text.txt"), b"text").unwrap();
        assert_eq!(image_data(&root, "text.txt").unwrap_err().code, "IMAGE");
        fs::File::create(root.join("large.png"))
            .unwrap()
            .set_len(MAX_FILE_SIZE + 1)
            .unwrap();
        assert_eq!(
            image_data(&root, "large.png").unwrap_err().code,
            "LARGE_FILE"
        );
        assert!(image_data(&root, "../outside.png").is_err());
        fs::remove_dir_all(root).unwrap();
    }
    #[cfg(unix)]
    #[test]
    fn rejects_image_and_import_symlink_escapes() {
        let root = fixture();
        let outside = fixture();
        fs::write(outside.join("image.png"), b"image").unwrap();
        std::os::unix::fs::symlink(&outside, root.join("outside")).unwrap();
        assert!(image_data(&root, "outside/image.png").is_err());
        assert!(copy_external(&root, &outside.join("image.png"), "outside").is_err());
        std::os::unix::fs::symlink(outside.join("image.png"), outside.join("link.png")).unwrap();
        assert!(copy_external(&root, &outside.join("link.png"), "").is_err());
        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(outside).unwrap();
    }
    #[test]
    fn opens_existing_project_paths_and_rejects_missing_or_file_paths() {
        let root = fixture();
        fs::create_dir(root.join("žluťoučký project")).unwrap();
        assert_eq!(
            project_directory(&root.join("žluťoučký project")).unwrap(),
            root.join("žluťoučký project").canonicalize().unwrap()
        );
        fs::write(root.join("file.txt"), b"file").unwrap();
        assert!(project_directory(&root.join("file.txt")).is_err());
        assert!(project_directory(&root.join("missing")).is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
