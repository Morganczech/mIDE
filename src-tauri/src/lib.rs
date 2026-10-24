mod live_server;
mod filesystem;
mod fonts;
mod formatter;
mod omarchy;
mod search;
#[cfg(feature = "smoke-test")]
mod smoke;
mod terminal;
mod themes;

pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(filesystem::Workspace::default())
        .manage(terminal::TerminalState::default())
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                use tauri::Manager;
                window.state::<terminal::TerminalState>().stop();
            }
        });
    #[cfg(not(feature = "smoke-test"))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        fonts::list_system_fonts,
        themes::import_theme,
        omarchy::read_omarchy_theme,
        omarchy::watch_omarchy_theme,
        search::search_project,
        filesystem::open_project,
        filesystem::list_directory,
        filesystem::read_file,
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
        terminal::terminal_running
    ]);
    #[cfg(feature = "smoke-test")]
    let builder = builder
        .invoke_handler(tauri::generate_handler![
            fonts::list_system_fonts,
            themes::import_theme,
            omarchy::read_omarchy_theme,
            omarchy::watch_omarchy_theme,
            search::search_project,
            filesystem::open_project,
            filesystem::list_directory,
            filesystem::read_file,
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
            smoke::smoke_report
        ])
        .on_page_load(|webview, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Finished {
                let _ = webview.eval(include_str!("../../scripts/native-smoke.js"));
            }
        });
    builder
        .run(tauri::generate_context!())
        .expect("Unable to start mIDE");
}
