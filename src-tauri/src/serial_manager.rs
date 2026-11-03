use chrono::Local;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs::{create_dir_all, OpenOptions};
use std::io::{BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, sync_channel, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// 串口基础信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortInfo {
    pub name: String,
    pub port_type: String,
}

/// 录制配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordConfig {
    pub dir_path: String,
    pub naming_rule: String,
    pub custom_filename: Option<String>,
    pub log_rx: bool,
    pub log_tx: bool,
    pub log_timestamp: bool,
    pub log_clean_ansi: bool,
}

/// 录制状态报告
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordStatus {
    pub recording: bool,
    pub file_path: String,
    pub duration_secs: u64,
    pub bytes_written: u64,
}

/// 录制汇总结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordSummary {
    pub file_path: String,
    pub duration_secs: u64,
    pub bytes_written: u64,
}

/// 串口数据上报
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerialRxPayload {
    pub text: String,
    pub hex: String,
}

/// 内部落盘日志项
enum LogItem {
    Rx(Vec<u8>),
    Tx(Vec<u8>),
}

/// 录制引擎句柄
struct RecordEngine {
    tx_sender: Sender<LogItem>,
    stop_flag: Arc<AtomicBool>,
    status: Arc<Mutex<RecordStatus>>,
}

/// 串口管理器状态核心
pub struct SerialManager {
    app_handle: AppHandle,
    is_connected: Arc<AtomicBool>,
    current_port_name: Arc<Mutex<Option<String>>>,
    port_writer: Arc<Mutex<Option<Box<dyn serialport::SerialPort + Send>>>>,
    reader_stop_flag: Arc<AtomicBool>,
    record_engine: Arc<Mutex<Option<RecordEngine>>>,
    ansi_regex: Regex,
}

impl SerialManager {
    pub fn new(app_handle: AppHandle) -> Self {
        // ANSI escape sequence regex (CSI and 2-char escapes)
        let ansi_regex = Regex::new(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")
            .expect("Failed to compile ANSI cleaner regex");

        Self {
            app_handle,
            is_connected: Arc::new(AtomicBool::new(false)),
            current_port_name: Arc::new(Mutex::new(None)),
            port_writer: Arc::new(Mutex::new(None)),
            reader_stop_flag: Arc::new(AtomicBool::new(false)),
            record_engine: Arc::new(Mutex::new(None)),
            ansi_regex,
        }
    }

    /// 1. 枚举系统所有可用串口
    pub fn list_ports(&self) -> Vec<PortInfo> {
        match serialport::available_ports() {
            Ok(ports) => ports
                .into_iter()
                .map(|p| {
                    let port_type = match p.port_type {
                        serialport::SerialPortType::UsbPort(info) => {
                            let mut desc = "USB".to_string();
                            if let Some(prod) = info.product {
                                desc.push_str(&format!(" ({prod})"));
                            }
                            desc
                        }
                        serialport::SerialPortType::PciPort => "PCI".to_string(),
                        serialport::SerialPortType::BluetoothPort => "Bluetooth".to_string(),
                        serialport::SerialPortType::Unknown => "Standard".to_string(),
                    };
                    PortInfo {
                        name: p.port_name,
                        port_type,
                    }
                })
                .collect(),
            Err(e) => {
                log::warn!("Failed to enumerate ports: {e}");
                Vec::new()
            }
        }
    }

    /// 2. 打开串口，支持自定义任意非标波特率（如 74880、76880、1000000 等）
    pub fn open_port(
        &self,
        port_name: &str,
        baud_rate: u32,
        flow_control_str: Option<&str>,
        data_bits_num: Option<u8>,
        stop_bits_num: Option<u8>,
        parity_str: Option<&str>,
    ) -> Result<(), String> {
        // 如果已有打开的串口，先关闭
        if self.is_connected.load(Ordering::SeqCst) {
            self.close_port()?;
        }

        let flow_control = match flow_control_str.unwrap_or("none").to_lowercase().as_str() {
            s if s.contains("hardware") || s.contains("rts") => serialport::FlowControl::Hardware,
            s if s.contains("software") || s.contains("xon") => serialport::FlowControl::Software,
            _ => serialport::FlowControl::None,
        };

        let data_bits = match data_bits_num.unwrap_or(8) {
            5 => serialport::DataBits::Five,
            6 => serialport::DataBits::Six,
            7 => serialport::DataBits::Seven,
            _ => serialport::DataBits::Eight,
        };

        let stop_bits = match stop_bits_num.unwrap_or(1) {
            2 => serialport::StopBits::Two,
            _ => serialport::StopBits::One,
        };

        let parity = match parity_str.unwrap_or("none").to_lowercase().as_str() {
            "odd" => serialport::Parity::Odd,
            "even" => serialport::Parity::Even,
            _ => serialport::Parity::None,
        };

        let mut port = serialport::new(port_name, baud_rate)
            .flow_control(flow_control)
            .data_bits(data_bits)
            .stop_bits(stop_bits)
            .parity(parity)
            .timeout(Duration::from_millis(20))
            .open()
            .map_err(|e| format!("打开串口 {port_name} 失败: {e}"))?;

        // 尝试克隆供写入线程使用
        let writer_port = port
            .try_clone()
            .map_err(|e| format!("克隆串口写句柄失败: {e}"))?;

        *self.port_writer.lock().unwrap() = Some(writer_port);
        *self.current_port_name.lock().unwrap() = Some(port_name.to_string());
        self.is_connected.store(true, Ordering::SeqCst);
        self.reader_stop_flag.store(false, Ordering::SeqCst);

        // 建立串口裸字节采集 -> UI 解码节流线程的原生通道
        let (raw_tx, raw_rx) = sync_channel::<Vec<u8>>(2048);

        let reader_stop = Arc::clone(&self.reader_stop_flag);
        let reader_connected = Arc::clone(&self.is_connected);
        let record_engine_ref = Arc::clone(&self.record_engine);
        let app_handle_for_disconnect = self.app_handle.clone();
        let port_name_clone = port_name.to_string();

        // 线程 1: 串口裸字节高速读取采集线程 (纯原生 OS 线程)
        std::thread::Builder::new()
            .name("vili-serial-reader".to_string())
            .spawn(move || {
                let mut buf = [0u8; 4096];
                while !reader_stop.load(Ordering::Relaxed) {
                    match port.read(&mut buf) {
                        Ok(n) if n > 0 => {
                            let bytes = buf[..n].to_vec();

                            // 推送到落盘引擎（若正在录制且启用了 log_rx）
                            if let Ok(guard) = record_engine_ref.lock() {
                                if let Some(ref engine) = *guard {
                                    let _ = engine.tx_sender.send(LogItem::Rx(bytes.clone()));
                                }
                            }

                            // 推送到 UI 节流与解码通道
                            if raw_tx.send(bytes).is_err() {
                                break;
                            }
                        }
                        Ok(_) => {
                            std::thread::sleep(Duration::from_millis(2));
                        }
                        Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {
                            // 读超时属预期行为，继续循环
                        }
                        Err(e) => {
                            log::warn!("串口读取异常断开: {e}");
                            break;
                        }
                    }
                }

                reader_connected.store(false, Ordering::SeqCst);
                let _ = app_handle_for_disconnect.emit(
                    "port-status",
                    serde_json::json!({
                        "connected": false,
                        "port": port_name_clone,
                        "error": "串口已断开"
                    }),
                );
            })
            .map_err(|e| format!("启动串口读取线程失败: {e}"))?;

        // 线程 3: UI 渲染节流与增量 UTF-8 流式解码线程 (纯原生 OS 线程，杜绝 Tokio Runtime 依赖 panic)
        let app_handle_for_ui = self.app_handle.clone();
        let ui_stop = Arc::clone(&self.reader_stop_flag);

        std::thread::Builder::new()
            .name("vili-ui-throttler".to_string())
            .spawn(move || {
                let mut residual_buf = Vec::<u8>::with_capacity(8192);
                let mut throttled_text = String::with_capacity(8192);
                let mut throttled_hex = String::with_capacity(8192);
                let mut last_emit = Instant::now();

                while !ui_stop.load(Ordering::Relaxed) {
                    // 超时接收最多 33ms，避免死循环消耗 CPU
                    match raw_rx.recv_timeout(Duration::from_millis(33)) {
                        Ok(chunk) => {
                            for b in &chunk {
                                throttled_hex.push_str(&format!("{b:02X} "));
                            }
                            decode_incremental_utf8(&mut residual_buf, &chunk, &mut throttled_text);
                        }
                        Err(RecvTimeoutError::Timeout) => {}
                        Err(RecvTimeoutError::Disconnected) => break,
                    }

                    // 尽量处理队列中已存在的其它分包
                    while let Ok(chunk) = raw_rx.try_recv() {
                        for b in &chunk {
                            throttled_hex.push_str(&format!("{b:02X} "));
                        }
                        decode_incremental_utf8(&mut residual_buf, &chunk, &mut throttled_text);
                    }

                    // 每 ~33ms (约 30 FPS) 节流向前端推送一次帧数据
                    if last_emit.elapsed() >= Duration::from_millis(33) && !throttled_text.is_empty() {
                        let payload = SerialRxPayload {
                            text: std::mem::take(&mut throttled_text),
                            hex: std::mem::take(&mut throttled_hex),
                        };
                        let _ = app_handle_for_ui.emit("serial-rx", payload);
                        last_emit = Instant::now();
                    }
                }

                // 退出时把缓冲区剩余数据推送完成
                while let Ok(chunk) = raw_rx.try_recv() {
                    for b in &chunk {
                        throttled_hex.push_str(&format!("{b:02X} "));
                    }
                    decode_incremental_utf8(&mut residual_buf, &chunk, &mut throttled_text);
                }
                if !throttled_text.is_empty() {
                    let payload = SerialRxPayload {
                        text: throttled_text,
                        hex: throttled_hex,
                    };
                    let _ = app_handle_for_ui.emit("serial-rx", payload);
                }
            })
            .map_err(|e| format!("启动 UI 节流线程失败: {e}"))?;

        // 触发连接状态事件
        let _ = self.app_handle.emit(
            "port-status",
            serde_json::json!({
                "connected": true,
                "port": port_name,
                "baud_rate": baud_rate
            }),
        );

        Ok(())
    }

    /// 3. 关闭串口
    pub fn close_port(&self) -> Result<(), String> {
        self.reader_stop_flag.store(true, Ordering::SeqCst);
        self.is_connected.store(false, Ordering::SeqCst);

        // 释放写句柄
        if let Ok(mut writer) = self.port_writer.lock() {
            *writer = None;
        }

        let port_name = self.current_port_name.lock().unwrap().take();

        let _ = self.app_handle.emit(
            "port-status",
            serde_json::json!({
                "connected": false,
                "port": port_name.unwrap_or_default()
            }),
        );

        Ok(())
    }

    /// 4. 发送数据（支持 ASCII 文本转义换行与 HEX 十六进制裸字节）
    pub fn send_data(
        &self,
        content: &str,
        is_hex: bool,
        line_ending: &str,
    ) -> Result<usize, String> {
        if !self.is_connected.load(Ordering::SeqCst) {
            return Err("串口未打开，无法发送".to_string());
        }

        let bytes_to_send: Vec<u8> = if is_hex {
            // 解析 16 进制字符串（兼容 "AA BB 01"、"AABB01"、"0xAA, 0xBB"）
            let cleaned: String = content
                .chars()
                .filter(|c| c.is_ascii_hexdigit())
                .collect();
            if cleaned.len() % 2 != 0 {
                return Err("HEX 字符串长度必须为偶数（每个字节2位）".to_string());
            }
            (0..cleaned.len())
                .step_by(2)
                .map(|i| u8::from_str_radix(&cleaned[i..i + 2], 16))
                .collect::<Result<Vec<u8>, _>>()
                .map_err(|e| format!("解析 HEX 数据失败: {e}"))?
        } else {
            let mut raw = content.to_string();
            // 处理行尾符
            match line_ending {
                r"\r\n" | "\r\n" => raw.push_str("\r\n"),
                r"\n" | "\n" => raw.push('\n'),
                _ => {}
            }
            raw.into_bytes()
        };

        if bytes_to_send.is_empty() {
            return Ok(0);
        }

        // 写入串口
        let mut guard = self.port_writer.lock().map_err(|e| e.to_string())?;
        let writer = guard.as_mut().ok_or("串口写句柄不可用")?;
        writer
            .write_all(&bytes_to_send)
            .map_err(|e| format!("发送数据失败: {e}"))?;
        writer.flush().map_err(|e| format!("刷新串口失败: {e}"))?;

        // 如果开启了 TX 落盘录制，推送给落盘引擎
        if let Ok(rec_guard) = self.record_engine.lock() {
            if let Some(ref engine) = *rec_guard {
                let _ = engine.tx_sender.send(LogItem::Tx(bytes_to_send.clone()));
            }
        }

        Ok(bytes_to_send.len())
    }

    /// 5. 启动 Moserial 风格后台原子落盘录制引擎
    pub fn start_record(&self, config: RecordConfig) -> Result<String, String> {
        // 如果已在录制，先停止旧的
        if self.record_engine.lock().unwrap().is_some() {
            self.stop_record()?;
        }

        // 解析并创建日志目录
        let resolved_dir = resolve_path(&config.dir_path);
        create_dir_all(&resolved_dir)
            .map_err(|e| format!("无法创建日志目录 {}: {e}", resolved_dir.display()))?;

        // 确定落盘文件名
        let now = Local::now();
        let date_str = now.format("%Y%m%d").to_string();
        let time_str = now.format("%H%M%S").to_string();

        let filename = if let Some(custom) = &config.custom_filename {
            if !custom.trim().is_empty() {
                custom.trim().to_string()
            } else {
                format!("session_{date_str}_{time_str}.log")
            }
        } else {
            match config.naming_rule.as_str() {
                "serial_dump.log" => "serial_dump.log".to_string(),
                rule if rule.contains("{date}") || rule.contains("{time}") => rule
                    .replace("{date}", &date_str)
                    .replace("{time}", &time_str),
                _ => format!("session_{date_str}_{time_str}.log"),
            }
        };

        let file_path = resolved_dir.join(&filename);
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&file_path)
            .map_err(|e| format!("打开日志文件失败 {}: {e}", file_path.display()))?;

        let mut buf_writer = BufWriter::with_capacity(64 * 1024, file);
        let (tx_sender, rx_receiver) = channel::<LogItem>();
        let stop_flag = Arc::new(AtomicBool::new(false));
        let stop_flag_worker = Arc::clone(&stop_flag);

        let status = Arc::new(Mutex::new(RecordStatus {
            recording: true,
            file_path: file_path.to_string_lossy().to_string(),
            duration_secs: 0,
            bytes_written: 0,
        }));
        let status_worker = Arc::clone(&status);
        let app_handle_worker = self.app_handle.clone();
        let ansi_regex = self.ansi_regex.clone();

        let log_rx = config.log_rx;
        let log_tx = config.log_tx;
        let log_timestamp = config.log_timestamp;
        let log_clean_ansi = config.log_clean_ansi;

        // 线程 2: 独立磁盘落盘线程 (Disk Writer / Record 引擎，纯原生 OS 线程)
        std::thread::Builder::new()
            .name("vili-disk-writer".to_string())
            .spawn(move || {
                let start_time = Instant::now();
                let mut last_flush = Instant::now();
                let mut last_status_emit = Instant::now();
                let mut total_bytes: u64 = 0;

                let write_log_item = |item: LogItem,
                                      writer: &mut BufWriter<std::fs::File>,
                                      total: &mut u64| {
                    let (data, is_tx) = match item {
                        LogItem::Rx(d) if log_rx => (d, false),
                        LogItem::Tx(d) if log_tx => (d, true),
                        _ => return,
                    };

                    let mut text = String::from_utf8_lossy(&data).to_string();
                    if log_clean_ansi {
                        text = ansi_regex.replace_all(&text, "").to_string();
                    }

                    let formatted = if log_timestamp {
                        let prefix = if is_tx { "[TX] " } else { "[RX] " };
                        let ts = Local::now().format("%Y-%m-%d %H:%M:%S%.6f");
                        format!("[{ts}] {prefix}{text}")
                    } else {
                        text
                    };

                    let bytes = formatted.as_bytes();
                    if let Ok(()) = writer.write_all(bytes) {
                        *total += bytes.len() as u64;
                    }
                };

                while !stop_flag_worker.load(Ordering::Relaxed) {
                    match rx_receiver.recv_timeout(Duration::from_millis(50)) {
                        Ok(first_item) => {
                            write_log_item(first_item, &mut buf_writer, &mut total_bytes);

                            // 排空所有积压
                            while let Ok(more_item) = rx_receiver.try_recv() {
                                write_log_item(more_item, &mut buf_writer, &mut total_bytes);
                            }
                        }
                        Err(RecvTimeoutError::Timeout) => {}
                        Err(RecvTimeoutError::Disconnected) => break,
                    }

                    // 每 100ms 刷新一次缓冲区，保证强制退出不丢失最后包
                    if last_flush.elapsed() >= Duration::from_millis(100) {
                        let _ = buf_writer.flush();
                        last_flush = Instant::now();
                    }

                    // 每 1s 更新并向前端推送一次录制状态（时长与字节数）
                    if last_status_emit.elapsed() >= Duration::from_secs(1) {
                        let secs = start_time.elapsed().as_secs();
                        if let Ok(mut stat) = status_worker.lock() {
                            stat.duration_secs = secs;
                            stat.bytes_written = total_bytes;
                            let _ = app_handle_worker.emit("record-status", &*stat);
                        }
                        last_status_emit = Instant::now();
                    }
                }

                // 退出时彻底刷新落盘
                while let Ok(remaining) = rx_receiver.try_recv() {
                    write_log_item(remaining, &mut buf_writer, &mut total_bytes);
                }
                let _ = buf_writer.flush();
                let secs = start_time.elapsed().as_secs();
                if let Ok(mut stat) = status_worker.lock() {
                    stat.recording = false;
                    stat.duration_secs = secs;
                    stat.bytes_written = total_bytes;
                    let _ = app_handle_worker.emit("record-status", &*stat);
                }
            })
            .map_err(|e| format!("启动落盘录制线程失败: {e}"))?;

        let engine = RecordEngine {
            tx_sender,
            stop_flag,
            status,
        };

        let file_path_str = file_path.to_string_lossy().to_string();
        *self.record_engine.lock().unwrap() = Some(engine);

        // 立即触发一次录制开始状态
        let _ = self.app_handle.emit(
            "record-status",
            RecordStatus {
                recording: true,
                file_path: file_path_str.clone(),
                duration_secs: 0,
                bytes_written: 0,
            },
        );

        Ok(file_path_str)
    }

    /// 6. 停止录制并刷新落盘
    pub fn stop_record(&self) -> Result<RecordSummary, String> {
        let mut guard = self.record_engine.lock().unwrap();
        if let Some(engine) = guard.take() {
            engine.stop_flag.store(true, Ordering::SeqCst);
            // 稍等以保证线程完成 flush
            std::thread::sleep(Duration::from_millis(120));
            let stat = engine.status.lock().unwrap().clone();
            Ok(RecordSummary {
                file_path: stat.file_path,
                duration_secs: stat.duration_secs,
                bytes_written: stat.bytes_written,
            })
        } else {
            Err("当前未在录制".to_string())
        }
    }
}

/// 解析用户路径中的 ~ 符号
fn resolve_path(raw: &str) -> PathBuf {
    let raw = raw.trim();
    if raw.starts_with("~/") || raw == "~" {
        if let Some(home) = dirs_home() {
            if raw == "~" {
                return home;
            } else {
                return home.join(&raw[2..]);
            }
        }
    }
    Path::new(raw).to_path_buf()
}

fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .and_then(|h| if h.is_empty() { None } else { Some(PathBuf::from(h)) })
}

/// 增量 UTF-8 解码核心算法：针对跨串口分包切断的汉字等任意多字节字符进行缓存组包
pub fn decode_incremental_utf8(residual_buf: &mut Vec<u8>, chunk: &[u8], text_out: &mut String) {
    residual_buf.extend_from_slice(chunk);
    let mut offset = 0;
    while offset < residual_buf.len() {
        match std::str::from_utf8(&residual_buf[offset..]) {
            Ok(valid_str) => {
                text_out.push_str(valid_str);
                offset = residual_buf.len();
                break;
            }
            Err(e) => {
                let valid_len = e.valid_up_to();
                if valid_len > 0 {
                    if let Ok(valid_str) =
                        std::str::from_utf8(&residual_buf[offset..offset + valid_len])
                    {
                        text_out.push_str(valid_str);
                    }
                    offset += valid_len;
                }
                match e.error_len() {
                    Some(bad_len) => {
                        // 确认为损坏的非法字节，插入替换字符后跳过
                        text_out.push(std::char::REPLACEMENT_CHARACTER);
                        offset += bad_len;
                    }
                    None => {
                        // 处于末尾的残缺分包多字节序列，保留在 residual_buf 中等待下一包
                        break;
                    }
                }
            }
        }
    }
    residual_buf.drain(..offset);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_incremental_utf8_split_chinese_characters() {
        let full_text = "你好世界，Vilinox 工业级串口终端！";
        let bytes = full_text.as_bytes();

        let mut residual = Vec::new();
        let mut decoded = String::new();

        // 模拟极端网络与串口切片：每次只给 2 个字节，故意切断 3 字节汉字！
        for chunk in bytes.chunks(2) {
            decode_incremental_utf8(&mut residual, chunk, &mut decoded);
        }

        assert_eq!(decoded, full_text);
        assert!(residual.is_empty());
    }

    #[test]
    fn test_ansi_cleaning() {
        let ansi_regex = Regex::new(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])").unwrap();
        let raw_log = "\x1b[31;1m[ERROR]\x1b[0m ESP32 wifi connection failed: \x1b[33mtimeout\x1b[0m\r\n";
        let cleaned = ansi_regex.replace_all(raw_log, "").to_string();
        assert_eq!(cleaned, "[ERROR] ESP32 wifi connection failed: timeout\r\n");
    }

    #[test]
    fn test_resolve_path() {
        let p = resolve_path("/var/log/serial");
        assert_eq!(p, PathBuf::from("/var/log/serial"));

        let p_home = resolve_path("~/serial_logs/");
        assert!(p_home.to_string_lossy().contains("serial_logs"));
        assert!(!p_home.to_string_lossy().starts_with("~"));
    }

    #[test]
    fn test_open_real_device_if_present() {
        if std::path::Path::new("/dev/ttyUSB0").exists() {
            let res = serialport::new("/dev/ttyUSB0", 1_000_000)
                .flow_control(serialport::FlowControl::None)
                .data_bits(serialport::DataBits::Eight)
                .stop_bits(serialport::StopBits::One)
                .parity(serialport::Parity::None)
                .timeout(Duration::from_millis(20))
                .open();
            println!("\n>>> 实际硬件测试：打开 /dev/ttyUSB0 @ 1M (无流控) 结果: {:?} <<<\n", res.is_ok());
            assert!(res.is_ok(), "打开真实串口设备失败: {:?}", res.err());
        }
    }
}
