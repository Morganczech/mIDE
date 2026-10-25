mod filesystem;
mod fonts;
mod formatter;
mod live_server;
mod omarchy;
mod search;
#[cfg(feature = "smoke-test")]
mod smoke;
mod sources;
mod terminal;
mod themes;

pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(filesystem::Workspace::default())
        .manage(terminal::TerminalState::default())
        .manage(live_server::LiveState::default())
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                use tauri::Manager;
                window.state::<terminal::TerminalState>().stop();
                window.state::<live_server::LiveState>().stop();
            }
        });
    #[cfg(not(feature = "smoke-test"))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        fonts::list_system_fonts,
        themes::import_theme,
        sources::import_sources,
        sources::export_sources,
        sources::open_source_url,
        omarchy::read_omarchy_theme,
        omarchy::watch_omarchy_theme,
        search::search_project,
        filesystem::open_project,
        filesystem::list_directory,
        filesystem::read_file,
        filesystem::read_image,
        filesystem::import_files,
        filesystem::copy_entry_path,
        filesystem::save_file,
        filesystem::create_entry,
        filesystem::rename_entry,
        filesystem::delete_entry,
        formatter::format_document,
        terminal::terminal_start,
        terminal::terminal_write,
        terminal::terminal_resize,
        terminal::terminal_ack,
        terminal::terminal_stop,
        terminal::terminal_running,
        live_server::live_server_start,
        live_server::live_server_stop,
        live_server::live_server_open
    ]);
    #[cfg(feature = "smoke-test")]
    let builder = builder
        .invoke_handler(tauri::generate_handler![
            fonts::list_system_fonts,
            themes::import_theme,
            sources::import_sources,
            sources::export_sources,
            sources::open_source_url,
            omarchy::read_omarchy_theme,
            omarchy::watch_omarchy_theme,
            search::search_project,
            filesystem::open_project,
            filesystem::list_directory,
            filesystem::read_file,
            filesystem::read_image,
            filesystem::import_files,
            filesystem::copy_entry_path,
            filesystem::save_file,
            filesystem::create_entry,
            filesystem::rename_entry,
            filesystem::delete_entry,
            formatter::format_document,
            terminal::terminal_start,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_ack,
            terminal::terminal_stop,
            terminal::terminal_running,
            live_server::live_server_start,
            live_server::live_server_stop,
            live_server::live_server_open,
            smoke::smoke_report
        ])
        .on_page_load(|webview, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Finished {
                let script = if std::env::var_os("MIDE_SMOKE_DRAG").is_some() {
                    include_str!("../../scripts/native-drag-smoke.js")
                } else if std::env::var_os("MIDE_SMOKE_UPGRADE").is_some() {
                    include_str!("../../scripts/native-upgrade-smoke.js")
                } else {
                    include_str!("../../scripts/native-smoke.js")
                };
                let _ = webview.eval(script);
            }
        });
    builder
        .run(tauri::generate_context!())
        .expect("Unable to start mIDE");
}
