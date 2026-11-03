pub mod commands;
pub mod serial_manager;

use serial_manager::SerialManager;
use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .setup(|app| {
            let serial_mgr = Arc::new(SerialManager::new(app.handle().clone()));
            app.manage(serial_mgr);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_ports,
            commands::open_port,
            commands::close_port,
            commands::send_data,
            commands::start_record,
            commands::stop_record,
            commands::select_directory
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
