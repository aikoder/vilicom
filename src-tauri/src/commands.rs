use crate::serial_manager::{PortInfo, RecordConfig, RecordSummary, SerialManager};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn list_ports(manager: State<'_, Arc<SerialManager>>) -> Result<Vec<PortInfo>, String> {
    Ok(manager.list_ports())
}

#[tauri::command]
pub fn open_port(
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
pub fn close_port(manager: State<'_, Arc<SerialManager>>) -> Result<(), String> {
    manager.close_port()
}

#[tauri::command]
pub fn send_data(
    manager: State<'_, Arc<SerialManager>>,
    content: String,
    is_hex: bool,
    line_ending: String,
) -> Result<usize, String> {
    manager.send_data(&content, is_hex, &line_ending)
}

#[tauri::command]
pub fn start_record(
    manager: State<'_, Arc<SerialManager>>,
    config: RecordConfig,
) -> Result<String, String> {
    manager.start_record(config)
}

#[tauri::command]
pub fn stop_record(manager: State<'_, Arc<SerialManager>>) -> Result<RecordSummary, String> {
    manager.stop_record()
}

#[tauri::command]
pub fn select_directory() -> Result<Option<String>, String> {
    let folder = rfd::FileDialog::new()
        .set_title("选择日志存储目录")
        .pick_folder();
    Ok(folder.map(|f| f.to_string_lossy().to_string()))
}
