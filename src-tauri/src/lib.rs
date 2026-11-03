mod serial_manager;

use serial_manager::{PortInfo, RecordConfig, RecordSummary, SerialManager};
use std::sync::Arc;
use tauri::{Manager, State};

#[tauri::command]
fn list_ports(manager: State<'_, Arc<SerialManager>>) -> Result<Vec<PortInfo>, String> {
    Ok(manager.list_ports())
}

#[tauri::command]
fn open_port(
    manager: State<'_, Arc<SerialManager>>,
    port: String,
    baud_rate: u32,
    flow_control: Option<String>,
    data_bits: Option<u8>,
    stop_bits: Option<u8>,
    parity: Option<String>,
) -> Result<(), String> {
    manager.open_port(
        &port,
        baud_rate,
        flow_control.as_deref(),
        data_bits,
        stop_bits,
        parity.as_deref(),
    )
}

#[tauri::command]
fn close_port(manager: State<'_, Arc<SerialManager>>) -> Result<(), String> {
    manager.close_port()
}

#[tauri::command]
fn send_data(
    manager: State<'_, Arc<SerialManager>>,
    content: String,
    is_hex: bool,
    line_ending: String,
) -> Result<usize, String> {
    manager.send_data(&content, is_hex, &line_ending)
}

#[tauri::command]
fn start_record(
    manager: State<'_, Arc<SerialManager>>,
    config: RecordConfig,
) -> Result<String, String> {
    manager.start_record(config)
}

#[tauri::command]
fn stop_record(manager: State<'_, Arc<SerialManager>>) -> Result<RecordSummary, String> {
    manager.stop_record()
}

#[tauri::command]
fn select_directory() -> Result<Option<String>, String> {
    let folder = rfd::FileDialog::new()
        .set_title("选择日志存储目录")
        .pick_folder();
    Ok(folder.map(|f| f.to_string_lossy().to_string()))
}

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
            list_ports,
            open_port,
            close_port,
            send_data,
            start_record,
            stop_record,
            select_directory
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
