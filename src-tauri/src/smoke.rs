use tauri::AppHandle;
#[tauri::command]
pub fn smoke_report(app: AppHandle, report: String, success: bool) {
    let _ = std::fs::write(std::env::temp_dir().join("mide-native-report.txt"), report);
    if std::env::var("MIDE_SMOKE_KEEP_OPEN").is_err() {
        app.exit(if success { 0 } else { 1 });
    }
}
