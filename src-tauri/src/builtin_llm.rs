use futures_util::StreamExt;
#[cfg(not(target_os = "macos"))]
use libloading::Library;
use serde::{Deserialize, Serialize};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::{Mutex, atomic::{AtomicBool, Ordering}};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri::ipc::Channel;
use sysinfo::System;

use crate::AppState;

/// Detect whether the system glibc is too old for official llama.cpp binaries.
/// Official Ubuntu binaries require GLIBC >= 2.34; Ubuntu 20.04 (focal) ships 2.31.
/// When true, only bundled (self-compiled) runtimes should be used — no downloads.
#[cfg(target_os = "linux")]
fn is_bundled_runtime_only() -> bool {
    use std::process::Command as StdCommand;
    // `ldd --version` prints glibc version on the first line
    if let Ok(out) = StdCommand::new("ldd").arg("--version").output() {
        let first = String::from_utf8_lossy(&out.stdout);
        // Parse version like "ldd (Ubuntu GLIBC 2.31-0ubuntu9) 2.31"
        if let Some(ver) = first.split_whitespace().last() {
            let parts: Vec<u32> = ver.split('.').filter_map(|s| s.parse().ok()).collect();
            if parts.len() >= 2 {
                let (major, minor) = (parts[0], parts[1]);
                return major < 2 || (major == 2 && minor < 34);
            }
        }
    }
    false
}
#[cfg(not(target_os = "linux"))]
fn is_bundled_runtime_only() -> bool { false }

#[derive(Debug, Serialize)]
pub struct BuiltinLlmStatus {
    #[serde(rename = "runtimeInstalled")]
    pub runtime_installed: bool,
    #[serde(rename = "modelInstalled")]
    pub model_installed: bool,
    #[serde(rename = "modelId")]
    pub model_id: String,
    #[serde(rename = "runningModelId")]
    pub running_model_id: Option<String>,
    #[serde(rename = "runningThisModel")]
    pub running_this_model: bool,
    pub running: bool,
    #[serde(rename = "baseUrl")]
    pub base_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct BuiltinLlmOptions {
    #[serde(rename = "modelId")]
    pub model_id: Option<String>,
    pub mode: Option<String>,
    #[serde(rename = "computeMode")]
    pub compute_mode: Option<String>,
    #[serde(rename = "gpuBackend")]
    pub gpu_backend: Option<String>,
    #[serde(rename = "gpuLayers")]
    pub gpu_layers: Option<i32>,
    #[serde(rename = "cudaVersion")]
    pub cuda_version: Option<String>,
    #[serde(rename = "modelUrl")]
    pub model_url: Option<String>,
    #[serde(rename = "runtimeUrl")]
    pub runtime_url: Option<String>,
    #[serde(rename = "cudartUrl")]
    pub cudart_url: Option<String>,
}

pub struct BuiltinLlmManager {
    child: Mutex<Option<Child>>,
    port: Mutex<Option<u16>>,
    model_path: Mutex<Option<PathBuf>>,
    compute_mode: Mutex<Option<String>>,
    gpu_backend: Mutex<Option<String>>,
    gpu_layers: Mutex<Option<i32>>,
    cuda_version: Mutex<Option<String>>,
}

impl BuiltinLlmManager {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
            port: Mutex::new(None),
            model_path: Mutex::new(None),
            compute_mode: Mutex::new(None),
            gpu_backend: Mutex::new(None),
            gpu_layers: Mutex::new(None),
            cuda_version: Mutex::new(None),
        }
    }

    fn is_running(&self) -> bool {
        let mut guard = self.child.lock().unwrap();
        if let Some(child) = guard.as_mut() {
            match child.try_wait() {
                Ok(Some(_)) => {
                    *guard = None;
                    false
                }
                Ok(None) => true,
                Err(_) => false,
            }
        } else {
            false
        }
    }

    fn current_port(&self) -> Option<u16> {
        *self.port.lock().unwrap()
    }

    fn current_model_path(&self) -> Option<PathBuf> {
        self.model_path.lock().unwrap().clone()
    }

    fn set_running(
        &self,
        child: Child,
        port: u16,
        model_path: PathBuf,
        compute_mode: String,
        gpu_backend: String,
        gpu_layers: i32,
        cuda_version: String,
    ) {
        *self.child.lock().unwrap() = Some(child);
        *self.port.lock().unwrap() = Some(port);
        *self.model_path.lock().unwrap() = Some(model_path);
        *self.compute_mode.lock().unwrap() = Some(compute_mode);
        *self.gpu_backend.lock().unwrap() = Some(gpu_backend);
        *self.gpu_layers.lock().unwrap() = Some(gpu_layers);
        *self.cuda_version.lock().unwrap() = Some(cuda_version);
    }

    pub fn stop(&self) {
        let port_to_clean = *self.port.lock().unwrap();
        if let Some(mut child) = self.child.lock().unwrap().take() {
            // On Windows, kill the entire process tree using taskkill
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                let pid = child.id();
                let _ = Command::new("taskkill")
                    .args(["/F", "/T", "/PID", &pid.to_string()])
                    .creation_flags(0x08000000)
                    .output();
            }
            #[cfg(not(target_os = "windows"))]
            {
                let _ = child.kill();
            }
            let _ = child.wait();
        } else if let Some(port) = port_to_clean {
            // Fallback: child handle lost but we know the port — find and kill the
            // process listening on that port (only our instance, not others)
            #[cfg(target_os = "windows")]
            {
                if let Some(pid) = find_pid_by_port(port) {
                    use std::os::windows::process::CommandExt;
                    let _ = Command::new("taskkill")
                        .args(["/F", "/T", "/PID", &pid.to_string()])
                        .creation_flags(0x08000000)
                        .output();
                }
            }
            #[cfg(not(target_os = "windows"))]
            {
                if let Some(pid) = find_pid_by_port(port) {
                    let _ = Command::new("kill")
                        .args(["-9", &pid.to_string()])
                        .output();
                }
            }
        }
        *self.port.lock().unwrap() = None;
        *self.model_path.lock().unwrap() = None;
        *self.compute_mode.lock().unwrap() = None;
        *self.gpu_backend.lock().unwrap() = None;
        *self.gpu_layers.lock().unwrap() = None;
        *self.cuda_version.lock().unwrap() = None;
    }
}

impl Drop for BuiltinLlmManager {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Find the PID of a process listening on a given TCP port (Windows only).
/// Uses `netstat -ano` and parses output to find LISTENING entries on the port.
#[cfg(target_os = "windows")]
fn find_pid_by_port(port: u16) -> Option<u32> {
    use std::os::windows::process::CommandExt;
    let output = Command::new("netstat")
        .args(["-ano", "-p", "TCP"])
        .creation_flags(0x08000000)
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let needle = format!(":{}", port);
    for line in text.lines() {
        let line = line.trim();
        if !line.contains("LISTENING") {
            continue;
        }
        // Format: TCP  0.0.0.0:PORT  0.0.0.0:0  LISTENING  PID
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 5 {
            if let Some(addr) = parts.get(1) {
                if addr.ends_with(&needle) {
                    if let Some(pid_str) = parts.last() {
                        return pid_str.parse::<u32>().ok();
                    }
                }
            }
        }
    }
    None
}

/// Find the PID of a process listening on a given TCP port (macOS / Linux).
/// Uses `lsof -i :PORT -sTCP:LISTEN -t` which outputs only the PID.
#[cfg(not(target_os = "windows"))]
fn find_pid_by_port(port: u16) -> Option<u32> {
    let output = Command::new("lsof")
        .args(["-i", &format!(":{}", port), "-sTCP:LISTEN", "-t"])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    text.trim().lines().next()?.trim().parse::<u32>().ok()
}

fn normalize_cuda_version(raw: Option<&str>) -> &'static str {
    match raw {
        Some("13.1") => "13.1",
        _ => "12.4",
    }
}

fn runtime_dir(llm_dir: &Path, compute_mode: &str, gpu_backend: &str, cuda_version: &str) -> PathBuf {
    let base = llm_dir.join("runtime");
    match compute_mode {
        "gpu" | "hybrid" => {
            if gpu_backend.eq_ignore_ascii_case("cuda") {
                base.join(format!("cuda-{cuda_version}"))
            } else if gpu_backend.eq_ignore_ascii_case("metal") {
                base.join("metal")
            } else {
                base.join("vulkan")
            }
        }
        _ => base.join("cpu"),
    }
}

/// Check if CUDA runtime DLLs (cublas) are present in the given directory (recursive).
#[cfg(target_os = "windows")]
fn cuda_dlls_present(dir: &Path) -> bool {
    if !dir.exists() { return false; }
    for entry in walkdir::WalkDir::new(dir).max_depth(3).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() { continue; }
        let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
        if name.starts_with("cublas64") && name.ends_with(".dll") {
            return true;
        }
    }
    false
}

/// Build a PATH string that prepends the runtime directory (and optionally the exe's parent dir)
/// so that CUDA/Vulkan DLLs next to the exe or in the runtime root are found by Windows DLL loader.
#[cfg(target_os = "windows")]
fn prepend_runtime_to_path(exe_path: &Path, rt_dir: &Path) -> std::ffi::OsString {
    use std::ffi::OsString;
    let system_path = std::env::var_os("PATH").unwrap_or_default();
    let mut new_path = OsString::new();
    // Add the exe's parent directory first (highest priority)
    if let Some(parent) = exe_path.parent() {
        new_path.push(parent);
        new_path.push(";");
    }
    // Add the runtime root directory
    new_path.push(rt_dir);
    new_path.push(";");
    new_path.push(&system_path);
    new_path
}

fn normalize_compute_mode(raw: Option<&str>) -> &'static str {
    match raw {
        Some("gpu") => "gpu",
        Some("hybrid") => "hybrid",
        _ => "cpu",
    }
}

fn normalize_gpu_backend(raw: Option<&str>) -> &'static str {
    match raw {
        Some("cuda") | Some("CUDA") => "cuda",
        Some("metal") | Some("Metal") => "metal",
        _ => {
            #[cfg(target_os = "macos")]
            { "metal" }
            #[cfg(not(target_os = "macos"))]
            { "vulkan" }
        }
    }
}

// models_dir is now a direct user-configurable path stored in AppState.models_dir
// No wrapper needed — pass it directly to model_file_path etc.

fn sanitize_model_id(raw: Option<String>) -> String {
    let raw = raw.unwrap_or_else(|| "qwen3_0_6b_q4_k_m".to_string());
    let raw = raw.trim();
    if raw.is_empty() {
        return "qwen3_0_6b_q4_k_m".to_string();
    }

    let mut out = String::with_capacity(raw.len());
    for ch in raw.chars() {
        let ok = ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' || ch == '.';
        out.push(if ok { ch } else { '_' });
    }

    let out = out.trim_matches('.').trim_matches('_').trim_matches('-');
    if out.is_empty() {
        return "qwen3_0_6b_q4_k_m".to_string();
    }
    out.chars().take(80).collect::<String>()
}

fn is_builtin_qwen3_model_id(model_id: &str) -> bool {
    matches!(
        model_id,
        "qwen3_0_6b_q4_k_m"
            | "qwen3_1_7b_q4_k_m"
            | "qwen3_4b_q4_k_m"
            | "qwen3_8b_q4_k_m"
            | "qwen3_14b_q4_k_m"
            | "qwen3_32b_q4_k_m"
    )
}

fn model_file_name(model_id: &str) -> &'static str {
    match model_id {
        "qwen3_0_6b_q4_k_m" => "Qwen3-0.6B-Q4_K_M.gguf",
        "qwen3_1_7b_q4_k_m" => "Qwen3-1.7B-Q4_K_M.gguf",
        "qwen3_4b_q4_k_m" => "Qwen3-4B-Q4_K_M.gguf",
        "qwen3_8b_q4_k_m" => "Qwen3-8B-Q4_K_M.gguf",
        "qwen3_14b_q4_k_m" => "Qwen3-14B-Q4_K_M.gguf",
        "qwen3_32b_q4_k_m" => "Qwen3-32B-Q4_K_M.gguf",
        _ => "Qwen3-0.6B-Q4_K_M.gguf",
    }
}

fn legacy_model_file_name(model_id: &str) -> Option<&'static str> {
    match model_id {
        "q8_0" => Some("Qwen3-Embedding-0.6B-Q8_0.gguf"),
        _ => None,
    }
}

fn model_urls(model_id: &str) -> [&'static str; 3] {
    // Mirror 1: ModelScope (fast in China)
    // Mirror 2: HuggingFace (fast overseas)
    // Mirror 3: HuggingFace (retry)
    // Actual download order is determined by probe_fastest_mirror() at runtime
    match model_id {
        "qwen3_0_6b_q4_k_m" => [
            "https://www.modelscope.cn/models/unsloth/Qwen3-0.6B-GGUF/resolve/master/Qwen3-0.6B-Q4_K_M.gguf",
            "https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_K_M.gguf",
            "https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_K_M.gguf",
        ],
        "qwen3_1_7b_q4_k_m" => [
            "https://www.modelscope.cn/models/unsloth/Qwen3-1.7B-GGUF/resolve/master/Qwen3-1.7B-Q4_K_M.gguf",
            "https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf",
            "https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf",
        ],
        "qwen3_4b_q4_k_m" => [
            "https://www.modelscope.cn/models/unsloth/Qwen3-4B-GGUF/resolve/master/Qwen3-4B-Q4_K_M.gguf",
            "https://huggingface.co/unsloth/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf",
            "https://huggingface.co/unsloth/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf",
        ],
        "qwen3_8b_q4_k_m" => [
            "https://www.modelscope.cn/models/unsloth/Qwen3-8B-GGUF/resolve/master/Qwen3-8B-Q4_K_M.gguf",
            "https://huggingface.co/unsloth/Qwen3-8B-GGUF/resolve/main/Qwen3-8B-Q4_K_M.gguf",
            "https://huggingface.co/unsloth/Qwen3-8B-GGUF/resolve/main/Qwen3-8B-Q4_K_M.gguf",
        ],
        "qwen3_14b_q4_k_m" => [
            "https://www.modelscope.cn/models/unsloth/Qwen3-14B-GGUF/resolve/master/Qwen3-14B-Q4_K_M.gguf",
            "https://huggingface.co/unsloth/Qwen3-14B-GGUF/resolve/main/Qwen3-14B-Q4_K_M.gguf",
            "https://huggingface.co/unsloth/Qwen3-14B-GGUF/resolve/main/Qwen3-14B-Q4_K_M.gguf",
        ],
        "qwen3_32b_q4_k_m" => [
            "https://www.modelscope.cn/models/unsloth/Qwen3-32B-GGUF/resolve/master/Qwen3-32B-Q4_K_M.gguf",
            "https://huggingface.co/unsloth/Qwen3-32B-GGUF/resolve/main/Qwen3-32B-Q4_K_M.gguf",
            "https://huggingface.co/unsloth/Qwen3-32B-GGUF/resolve/main/Qwen3-32B-Q4_K_M.gguf",
        ],
        _ => ["", "", ""],
    }
}

fn model_file_path(models_dir: &Path, model_id: &str) -> PathBuf {
    if is_builtin_qwen3_model_id(model_id) {
        return models_dir.join(model_file_name(model_id));
    }
    let id = model_id.trim_end_matches(".gguf");
    models_dir.join(format!("{id}.gguf"))
}

fn model_candidate_paths(models_dir: &Path, model_id: &str) -> Vec<PathBuf> {
    let mut out = vec![model_file_path(models_dir, model_id)];
    if let Some(legacy) = legacy_model_file_name(model_id) {
        out.push(models_dir.join(legacy));
    }
    out
}

fn model_id_from_path(models_dir: &Path, path: &Path) -> Option<String> {
    for id in [
        "qwen3_0_6b_q4_k_m",
        "qwen3_1_7b_q4_k_m",
        "qwen3_4b_q4_k_m",
        "qwen3_8b_q4_k_m",
        "qwen3_14b_q4_k_m",
        "qwen3_32b_q4_k_m",
    ] {
        if path == model_file_path(models_dir, id) {
            return Some(id.to_string());
        }
    }

    let models = models_dir;
    if let Ok(rel) = path.strip_prefix(&models) {
        if let Some(stem) = rel.file_stem().and_then(|s| s.to_str()) {
            let id = sanitize_model_id(Some(stem.to_string()));
            if !id.is_empty() {
                return Some(id);
            }
        }
    }
    None
}

fn find_llama_server(runtime: &Path) -> Option<PathBuf> {
    let candidates = [
        runtime.join("llama-server.exe"),
        runtime.join("server.exe"),
        runtime.join("llama-server"),
        runtime.join("server"),
    ];
    for c in candidates {
        if c.exists() {
            return Some(c);
        }
    }

    for entry in walkdir::WalkDir::new(runtime).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
        if name == "llama-server.exe" || name == "server.exe" || name == "llama-server" || name == "server" {
            return Some(entry.path().to_path_buf());
        }
    }

    None
}

#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgress {
    written: u64,
    total: Option<u64>,
    label: String,
    speed: Option<u64>,
}

fn report_progress(app: &AppHandle, ch: &Channel<DownloadProgress>, progress: DownloadProgress) {
    let _ = app.emit("builtin-llm-download-progress", &progress);
    let _ = ch.send(progress);
}

/// Race HEAD requests to all unique mirrors and return indices sorted by response time (fastest first).
/// Falls back to original order if all probes fail or time out.
async fn probe_fastest_mirror(client: &reqwest::Client, urls: &[&str]) -> Vec<usize> {
    use std::collections::HashMap;
    let mut seen: HashMap<&str, usize> = HashMap::new();
    let mut tasks = vec![];

    for (i, &url) in urls.iter().enumerate() {
        if url.is_empty() { continue; }
        // deduplicate: only probe each unique URL once, map back to first index
        if seen.contains_key(url) { continue; }
        seen.insert(url, i);
        let client = client.clone();
        let url_owned = url.to_string();
        tasks.push((i, tokio::spawn(async move {
            let start = Instant::now();
            match tokio::time::timeout(
                Duration::from_secs(8),
                client.head(&url_owned).send()
            ).await {
                Ok(Ok(resp)) if resp.status().is_success() || resp.status() == reqwest::StatusCode::METHOD_NOT_ALLOWED => Some(start.elapsed()),
                _ => None,
            }
        })));
    }

    let mut results = vec![];
    for (i, handle) in tasks {
        if let Ok(Some(dur)) = handle.await {
            results.push((i, dur));
        }
    }
    results.sort_by_key(|(_, d)| *d);
    log::debug!("[builtin_llm] Mirror probe results: {:?}", results.iter().map(|(i, d)| (urls[*i].chars().take(50).collect::<String>(), d.as_millis())).collect::<Vec<_>>());
    results.iter().map(|(i, _)| *i).collect()
}

async fn download_to_file(app: &AppHandle, ch: &Channel<DownloadProgress>, urls: &[&str], dest_file: &Path, label: &str, cancel: &AtomicBool) -> Result<(), String> {
    if let Some(parent) = dest_file.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Aireader/0.1")
        .build()
        .map_err(|e| e.to_string())?;

    let tmp_path = dest_file.with_extension("part");
    let mut errors: Vec<String> = vec![];

    // Probe mirrors to find the fastest one (handles China vs overseas automatically)
    let order = probe_fastest_mirror(&client, urls).await;
    let ordered_urls: Vec<&str> = if order.is_empty() {
        urls.to_vec()
    } else {
        let mut result: Vec<&str> = order.iter().filter_map(|&i| urls.get(i).copied()).collect();
        // Append any URLs that didn't respond (as last-resort fallbacks)
        for (i, &url) in urls.iter().enumerate() {
            if !url.is_empty() && !order.contains(&i) {
                result.push(url);
            }
        }
        result
    };

    for url in &ordered_urls {
        if cancel.load(Ordering::Relaxed) {
            let _ = std::fs::remove_file(&tmp_path);
            return Err("Download cancelled".to_string());
        }

        // Report "connecting" so frontend knows download is attempting
        report_progress(app, ch, DownloadProgress {
            written: 0,
            total: None,
            label: label.to_string(),
            speed: None,
        });

        let resp = match client.get(*url).send().await {
            Ok(r) => r,
            Err(e) => {
                errors.push(format!("{url} -> {e}"));
                continue;
            }
        };

        if !resp.status().is_success() {
            errors.push(format!("{url} -> HTTP {}", resp.status()));
            continue;
        }

        let expected_len = resp.content_length();

        // Report initial progress with total size once known
        report_progress(app, ch, DownloadProgress {
            written: 0,
            total: expected_len,
            label: label.to_string(),
            speed: None,
        });

        let mut file = std::fs::File::create(&tmp_path).map_err(|e| e.to_string())?;
        let mut stream = resp.bytes_stream();
        let mut written: u64 = 0;
        let mut last_emit = Instant::now();
        let mut last_speed_written: u64 = 0;
        let mut last_speed_time = Instant::now();
        let mut current_speed: Option<u64> = None;
        while let Some(item) = stream.next().await {
            if cancel.load(Ordering::Relaxed) {
                drop(file);
                let _ = std::fs::remove_file(&tmp_path);
                return Err("Download cancelled".to_string());
            }
            let chunk = item.map_err(|e| e.to_string())?;
            use std::io::Write;
            file.write_all(&chunk).map_err(|e| e.to_string())?;
            written = written.saturating_add(chunk.len() as u64);
            if last_emit.elapsed() >= Duration::from_millis(200) {
                let speed_elapsed = last_speed_time.elapsed();
                if speed_elapsed >= Duration::from_secs(1) {
                    let delta = written.saturating_sub(last_speed_written);
                    current_speed = Some((delta as f64 / speed_elapsed.as_secs_f64()) as u64);
                    last_speed_written = written;
                    last_speed_time = Instant::now();
                }
                report_progress(app, ch, DownloadProgress {
                    written,
                    total: expected_len,
                    label: label.to_string(),
                    speed: current_speed,
                });
                last_emit = Instant::now();
            }
        }
        // Report final progress
        report_progress(app, ch, DownloadProgress {
            written,
            total: expected_len,
            label: label.to_string(),
            speed: current_speed,
        });

        if let Some(len) = expected_len {
            if written != len {
                let _ = std::fs::remove_file(&tmp_path);
                errors.push(format!("{url} -> incomplete download ({written}/{len})"));
                continue;
            }
        }

        if dest_file.exists() {
            let _ = std::fs::remove_file(dest_file);
        }
        std::fs::rename(&tmp_path, dest_file).map_err(|e| e.to_string())?;

        return Ok(());
    }

    let _ = std::fs::remove_file(&tmp_path);

    if errors.is_empty() {
        Err("download failed".to_string())
    } else {
        Err(format!("download failed: {}", errors.join("; ")))
    }
}

fn file_starts_with(path: &Path, magic: &[u8]) -> bool {
    let mut buf = vec![0u8; magic.len()];
    let mut f = match std::fs::File::open(path) {
        Ok(x) => x,
        Err(_) => return false,
    };
    use std::io::Read;
    if f.read_exact(&mut buf).is_err() {
        return false;
    }
    buf == magic
}

fn safe_zip_extract_with_progress(
    zip_path: &Path,
    dest_dir: &Path,
    app: Option<&AppHandle>,
    ch: Option<&Channel<DownloadProgress>>,
    label: &str,
) -> Result<(), String> {
    std::fs::create_dir_all(dest_dir).map_err(|e| e.to_string())?;

    let file = std::fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let total_size = file.metadata().map(|m| m.len()).unwrap_or(0);
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    let mut bytes_done: u64 = 0;
    let mut last_emit = Instant::now();

    // Report start
    if !label.is_empty() {
        if let (Some(a), Some(c)) = (app, ch) {
            report_progress(a, c, DownloadProgress {
                written: 0,
                total: Some(total_size),
                label: label.to_string(),
                speed: None,
            });
        }
    }

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let compressed = entry.compressed_size();
        let name = entry.name().replace('\\', "/");

        if name.starts_with('/') {
            continue;
        }
        if name.contains("..") {
            continue;
        }

        let out_path = dest_dir.join(&name);

        if entry.is_dir() {
            std::fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut out = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
        }

        bytes_done = bytes_done.saturating_add(compressed);

        // Report extraction progress (throttled)
        if !label.is_empty() && last_emit.elapsed() >= Duration::from_millis(150) {
            if let (Some(a), Some(c)) = (app, ch) {
                report_progress(a, c, DownloadProgress {
                    written: bytes_done,
                    total: Some(total_size),
                    label: label.to_string(),
                    speed: None,
                });
            }
            last_emit = Instant::now();
        }
    }

    // Report extraction complete
    if !label.is_empty() {
        if let (Some(a), Some(c)) = (app, ch) {
            report_progress(a, c, DownloadProgress {
                written: total_size,
                total: Some(total_size),
                label: label.to_string(),
                speed: None,
            });
        }
    }

    // On Unix, ensure extracted binaries are executable
    #[cfg(not(target_os = "windows"))]
    set_executable_permissions(dest_dir);

    Ok(())
}

/// Extract a .tar.gz archive using system `tar` command (available on macOS/Linux).
#[cfg(not(target_os = "windows"))]
fn safe_tar_extract_with_progress(
    tar_path: &Path,
    dest_dir: &Path,
    app: Option<&AppHandle>,
    ch: Option<&Channel<DownloadProgress>>,
    label: &str,
) -> Result<(), String> {
    std::fs::create_dir_all(dest_dir).map_err(|e| e.to_string())?;

    let total_size = std::fs::metadata(tar_path).map(|m| m.len()).unwrap_or(0);

    // Report start
    if !label.is_empty() {
        if let (Some(a), Some(c)) = (app, ch) {
            report_progress(a, c, DownloadProgress {
                written: 0,
                total: Some(total_size),
                label: label.to_string(),
                speed: None,
            });
        }
    }

    let output = Command::new("tar")
        .args(["xzf", &tar_path.to_string_lossy(), "-C", &dest_dir.to_string_lossy()])
        .output()
        .map_err(|e| format!("failed to run tar: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("tar extraction failed: {stderr}"));
    }

    // Report complete
    if !label.is_empty() {
        if let (Some(a), Some(c)) = (app, ch) {
            report_progress(a, c, DownloadProgress {
                written: total_size,
                total: Some(total_size),
                label: label.to_string(),
                speed: None,
            });
        }
    }

    // Set executable permissions on extracted binaries
    set_executable_permissions(dest_dir);

    Ok(())
}

/// Unified archive extraction: dispatches to zip or tar.gz based on file extension.
fn safe_archive_extract(archive_path: &Path, dest_dir: &Path) -> Result<(), String> {
    safe_archive_extract_with_progress(archive_path, dest_dir, None, None, "")
}

/// Unified archive extraction with progress reporting.
fn safe_archive_extract_with_progress(
    archive_path: &Path,
    dest_dir: &Path,
    app: Option<&AppHandle>,
    ch: Option<&Channel<DownloadProgress>>,
    label: &str,
) -> Result<(), String> {
    let name = archive_path.to_string_lossy().to_ascii_lowercase();
    if name.ends_with(".tar.gz") || name.ends_with(".tgz") {
        #[cfg(not(target_os = "windows"))]
        {
            return safe_tar_extract_with_progress(archive_path, dest_dir, app, ch, label);
        }
        #[cfg(target_os = "windows")]
        {
            return Err("tar.gz extraction is not supported on Windows".to_string());
        }
    }
    safe_zip_extract_with_progress(archive_path, dest_dir, app, ch, label)
}

/// On Unix systems, set executable permissions on extracted binaries.
#[cfg(not(target_os = "windows"))]
fn set_executable_permissions(dir: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let executables = ["llama-server", "llama-bench", "server"];
    for entry in walkdir::WalkDir::new(dir).max_depth(3).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
        let should_chmod = executables.iter().any(|e| name == *e)
            || name.starts_with("llama-")
            || !name.contains('.');
        if should_chmod {
            let _ = std::fs::set_permissions(entry.path(), std::fs::Permissions::from_mode(0o755));
        }
    }
}

/// Return the default runtime zip name for the current platform.
fn default_runtime_zip_name(compute_mode: &str, gpu_backend: &str, cuda_version: &str) -> &'static str {
    #[cfg(target_os = "windows")]
    {
        match compute_mode {
            "gpu" | "hybrid" => {
                if gpu_backend.eq_ignore_ascii_case("cuda") {
                    if cuda_version == "13.1" {
                        "llama-b7966-bin-win-cuda-13.1-x64.zip"
                    } else {
                        "llama-b7966-bin-win-cuda-12.4-x64.zip"
                    }
                } else {
                    "llama-b7966-bin-win-vulkan-x64.zip"
                }
            }
            _ => "llama-b7966-bin-win-cpu-x64.zip",
        }
    }
    #[cfg(target_os = "macos")]
    {
        // macOS builds include Metal support natively, no separate metal/cpu variants
        let _ = (compute_mode, gpu_backend, cuda_version);
        #[cfg(target_arch = "aarch64")]
        { "llama-b7966-bin-macos-arm64.tar.gz" }
        #[cfg(not(target_arch = "aarch64"))]
        { "llama-b7966-bin-macos-x64.tar.gz" }
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        match compute_mode {
            "gpu" | "hybrid" => {
                if gpu_backend.eq_ignore_ascii_case("cuda") {
                    // Official llamacpp does not provide Linux CUDA binary;
                    // fall back to Vulkan for GPU acceleration on Linux.
                    "llama-b7966-bin-ubuntu-vulkan-x64.tar.gz"
                } else {
                    "llama-b7966-bin-ubuntu-vulkan-x64.tar.gz"
                }
            }
            _ => "llama-b7966-bin-ubuntu-x64.tar.gz",
        }
    }
}

/// Return the default download base URLs for runtime archives on the current platform.
/// Returns [ModelScope mirror (fast in China), GitHub official release (fast overseas)].
/// Actual download order is determined by probe_fastest_mirror() at runtime.
fn default_runtime_base_urls() -> [&'static str; 2] {
    #[cfg(target_os = "macos")]
    {[
        "https://www.modelscope.cn/datasets/Lissajous/llamacppforall/resolve/master/b7966",
        "https://github.com/ggml-org/llama.cpp/releases/download/b7966",
    ]}
    #[cfg(target_os = "windows")]
    {[
        "https://www.modelscope.cn/datasets/Lissajous/llamacppforall/resolve/master/b7966",
        "https://github.com/ggml-org/llama.cpp/releases/download/b7966",
    ]}
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {[
        "https://www.modelscope.cn/datasets/Lissajous/llamacppforall/resolve/master/b7966",
        "https://github.com/ggml-org/llama.cpp/releases/download/b7966",
    ]}
}

/// Auto-extract bundled runtime on first launch (called from setup).
/// On macOS ARM uses Metal as the default backend; on other platforms uses CPU.
/// Silent — logs errors but does not fail the app.
pub fn auto_install_cpu_runtime(app: &AppHandle, llm_dir: &Path) {
    let default_backend = normalize_gpu_backend(None);
    let default_compute = {
        #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
        { "gpu" }
        #[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
        { "cpu" }
    };
    let rt = runtime_dir(llm_dir, default_compute, default_backend, "12.4");
    if find_llama_server(&rt).is_some() {
        return; // already installed
    }
    let _ = std::fs::create_dir_all(&rt);
    let zip_name = default_runtime_zip_name(default_compute, default_backend, "12.4");
    if let Ok(resource_dir) = app.path().resource_dir() {
        let candidates = [
            resource_dir.join("llm").join("runtime").join(zip_name),
            resource_dir.join("resources").join("llm").join("runtime").join(zip_name),
        ];
        for z in candidates {
            if z.exists() {
                match safe_archive_extract(&z, &rt) {
                    Ok(_) => {
                        log::info!("[builtin_llm] Runtime auto-extracted from {}", z.display());
                        return;
                    }
                    Err(e) => {
                        log::warn!("[builtin_llm] Failed to extract runtime: {}", e);
                    }
                }
            }
        }
    }
}

fn pick_free_port() -> Result<u16, String> {
    let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    drop(listener);
    Ok(port)
}

fn wait_port_open(port: u16, timeout: Duration) -> bool {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(150));
    }
    false
}

fn runtime_installed(llm_dir: &Path, compute_mode: &str, gpu_backend: &str) -> bool {
    let rt = runtime_dir(llm_dir, compute_mode, gpu_backend, "12.4");
    find_llama_server(&rt).is_some()
}

async fn ensure_runtime_with_mode(app: &AppHandle, llm_dir: &Path, compute_mode: &str, gpu_backend: &str, cuda_version: &str, custom_runtime_url: Option<&str>, custom_cudart_url: Option<&str>, cancel: &AtomicBool, progress_ch: &Channel<DownloadProgress>) -> Result<PathBuf, String> {
    let rt = runtime_dir(llm_dir, compute_mode, gpu_backend, cuda_version);

    // Migrate legacy CPU runtime: files in runtime/ -> runtime/cpu/
    if compute_mode == "cpu" {
        let legacy = llm_dir.join("runtime");
        if find_llama_server(&legacy).is_some() {
            let _ = std::fs::create_dir_all(&rt);
            if find_llama_server(&rt).is_none() {
                if let Ok(entries) = std::fs::read_dir(&legacy) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.is_file() {
                            let dest = rt.join(path.file_name().unwrap());
                            let _ = std::fs::rename(&path, &dest);
                        }
                    }
                }
            }
        }
    }

    // Return early if already installed — do NOT create dirs eagerly
    if let Some(server) = find_llama_server(&rt) {
        // For CUDA on Windows, also verify that cudart DLLs (cublas) are present.
        // If missing, attempt to download cudart only (not the full runtime).
        #[cfg(target_os = "windows")]
        if (compute_mode == "gpu" || compute_mode == "hybrid")
            && gpu_backend.eq_ignore_ascii_case("cuda")
            && !cuda_dlls_present(&rt)
        {
            log::warn!("[builtin_llm] CUDA server found but cublas DLLs missing in {}, attempting cudart download", rt.display());
            let cv = cuda_version;
            let cudart_zip = if cv == "13.1" { "cudart-llama-bin-win-cuda-13.1-x64.zip" } else { "cudart-llama-bin-win-cuda-12.4-x64.zip" };
            // Try bundled cudart first
            let mut found = false;
            if let Ok(rd) = app.path().resource_dir() {
                for z in [rd.join("llm").join("runtime").join(cudart_zip), rd.join("resources").join("llm").join("runtime").join(cudart_zip)] {
                    if z.exists() {
                        if let Err(e) = safe_archive_extract_with_progress(&z, &rt, Some(app), Some(progress_ch), "Extracting CUDA runtime") {
                            log::warn!("[builtin_llm] Failed to extract bundled cudart: {}", e);
                        } else { found = true; }
                        break;
                    }
                }
            }
            // Download if still missing
            if !found && !cuda_dlls_present(&rt) {
                let base_urls = default_runtime_base_urls();
                let urls: Vec<String> = base_urls.iter().map(|b| format!("{}/{}", b, cudart_zip)).collect();
                let refs: Vec<&str> = if let Some(c) = custom_cudart_url.filter(|s| !s.is_empty()) { vec![c] } else { urls.iter().map(|s| s.as_str()).collect() };
                let cp = rt.join(cudart_zip);
                match download_to_file(app, progress_ch, &refs, &cp, "Downloading CUDA runtime (cublas)", cancel).await {
                    Ok(_) => {
                        if let Err(e) = safe_archive_extract_with_progress(&cp, &rt, Some(app), Some(progress_ch), "Extracting CUDA runtime") {
                            log::warn!("[builtin_llm] Failed to extract cudart: {}", e);
                        }
                        let _ = std::fs::remove_file(&cp);
                    }
                    Err(e) => log::warn!("[builtin_llm] Failed to download cudart: {} (CUDA may fall back to CPU)", e),
                }
            }
        }
        return Ok(server);
    }

    // Only create dir when we actually need to download/install
    std::fs::create_dir_all(&rt).map_err(|e| e.to_string())?;

    // Prefer bundled runtime if present
    if let Ok(resource_dir) = app.path().resource_dir() {
        let variant = rt
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("cpu");
        let bundled_candidates = [
            resource_dir.join("llm").join("runtime").join(variant),
            resource_dir.join("resources").join("llm").join("runtime").join(variant),
        ];
        for bundled in bundled_candidates {
            if !bundled.exists() {
                continue;
            }
            // best-effort copy
            for entry in walkdir::WalkDir::new(&bundled).into_iter().filter_map(|e| e.ok()) {
                if entry.file_type().is_dir() {
                    continue;
                }
                let rel = match entry.path().strip_prefix(&bundled) {
                    Ok(r) => r,
                    Err(_) => continue,
                };
                let dst = rt.join(rel);
                if let Some(parent) = dst.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                let _ = std::fs::copy(entry.path(), &dst);
            }
            if let Some(server) = find_llama_server(&rt) {
                return Ok(server);
            }
        }
    }

    let zip_name = default_runtime_zip_name(compute_mode, gpu_backend, cuda_version);

    // CUDA runtime (cudart) is only needed on Windows with CUDA backend.
    // macOS uses Metal (no CUDA); Linux official builds lack CUDA.
    let cudart_name: Option<&str> = {
        #[cfg(target_os = "windows")]
        {
            if (compute_mode == "gpu" || compute_mode == "hybrid") && gpu_backend.eq_ignore_ascii_case("cuda") {
                if cuda_version == "13.1" {
                    Some("cudart-llama-bin-win-cuda-13.1-x64.zip")
                } else {
                    Some("cudart-llama-bin-win-cuda-12.4-x64.zip")
                }
            } else {
                None
            }
        }
        #[cfg(not(target_os = "windows"))]
        { None }
    };

    // Prefer bundled zip runtime if present
    if let Ok(resource_dir) = app.path().resource_dir() {
        let zip_candidates = [
            resource_dir
                .join("llm")
                .join("runtime")
                .join(zip_name),
            resource_dir
                .join("resources")
                .join("llm")
                .join("runtime")
                .join(zip_name),
        ];

        if let Some(cudart_name) = cudart_name {
            let cudart_candidates = [
                resource_dir.join("llm").join("runtime").join(cudart_name),
                resource_dir
                    .join("resources")
                    .join("llm")
                    .join("runtime")
                    .join(cudart_name),
            ];
            for z in cudart_candidates {
                if z.exists() {
                    if let Err(e) = safe_archive_extract_with_progress(&z, &rt, Some(app), Some(progress_ch), "Extracting CUDA runtime") {
                        log::warn!("[builtin_llm] Failed to extract bundled cudart from {}: {}", z.display(), e);
                    }
                    break;
                }
            }
        }

        for z in zip_candidates {
            if !z.exists() {
                continue;
            }
            safe_archive_extract_with_progress(&z, &rt, Some(app), Some(progress_ch), "Extracting LLM runtime")?;
            if let Some(server) = find_llama_server(&rt) {
                return Ok(server);
            }
        }
    }

    // On systems with old glibc (e.g. Ubuntu 20.04), official llama.cpp binaries
    // won't run. Only bundled runtimes are usable — skip the download entirely.
    if is_bundled_runtime_only() {
        return Err(format!(
            "Bundled LLM runtime not found for {} / {}. This system (glibc < 2.34) \
             cannot use downloaded runtimes — they were compiled for newer systems. \
             Please re-install the application or contact support.",
            compute_mode, gpu_backend
        ));
    }

    // Fallback: download runtime archive and extract
    let base_urls = default_runtime_base_urls();
    let default_runtime_urls: Vec<String> = base_urls.iter().map(|b| format!("{}/{}", b, zip_name)).collect();

    let zip_path = rt.join(zip_name);

    if let Some(cudart_name) = cudart_name {
        let cudart_urls: Vec<String> = base_urls.iter().map(|b| format!("{}/{}", b, cudart_name)).collect();
        let cudart_url_refs: Vec<&str> = if let Some(custom) = custom_cudart_url.filter(|s| !s.is_empty()) {
            vec![custom]
        } else {
            cudart_urls.iter().map(|s| s.as_str()).collect()
        };
        let cudart_path = rt.join(cudart_name);
        match download_to_file(app, progress_ch, &cudart_url_refs, &cudart_path, "Downloading CUDA runtime", cancel).await {
            Ok(_) => {
                if let Err(e) = safe_archive_extract_with_progress(&cudart_path, &rt, Some(app), Some(progress_ch), "Extracting CUDA runtime") {
                    log::warn!("[builtin_llm] Failed to extract cudart: {}", e);
                }
                let _ = std::fs::remove_file(&cudart_path);
            }
            Err(e) => log::warn!("[builtin_llm] Failed to download cudart (cublas DLLs): {}", e),
        }
    }

    let runtime_url_refs: Vec<&str> = if let Some(custom) = custom_runtime_url.filter(|s| !s.is_empty()) {
        vec![custom]
    } else {
        default_runtime_urls.iter().map(|s| s.as_str()).collect()
    };
    download_to_file(app, progress_ch, &runtime_url_refs, &zip_path, "Downloading LLM runtime", cancel).await?;
    safe_archive_extract_with_progress(&zip_path, &rt, Some(app), Some(progress_ch), "Extracting LLM runtime")?;
    let _ = std::fs::remove_file(&zip_path);

    if let Some(server) = find_llama_server(&rt) {
        return Ok(server);
    }

    Err(format!(
        "builtin LLM runtime not found. Please place llama-server under: {} (computeMode={}, gpuBackend={}, cudaVersion={})",
        rt.to_string_lossy(),
        compute_mode,
        gpu_backend,
        cuda_version
    ))
}

async fn ensure_model_with_mode(app: &AppHandle, models_dir: &Path, model_id: &str, allow_download: bool, custom_url: Option<&str>, cancel: &AtomicBool, progress_ch: &Channel<DownloadProgress>) -> Result<PathBuf, String> {
    std::fs::create_dir_all(models_dir).map_err(|e| e.to_string())?;

    for cand in model_candidate_paths(models_dir, model_id) {
        if cand.exists() {
            return Ok(cand);
        }
    }

    if !is_builtin_qwen3_model_id(model_id) {
        return Err("custom model not found. Please import a GGUF file from Settings.".to_string());
    }

    let target = model_file_path(models_dir, model_id);
    if let Some(parent) = target.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    // Prefer bundled model if present
    if let Ok(resource_dir) = app.path().resource_dir() {
        let file_name = model_file_name(model_id);
        let bundled_candidates = [
            resource_dir
                .join("llm")
                .join("models")
                .join(file_name),
            resource_dir
                .join("resources")
                .join("llm")
                .join("models")
                .join(file_name),
        ];
        for bundled in bundled_candidates {
            if bundled.exists() {
                std::fs::copy(&bundled, &target).map_err(|e| e.to_string())?;
                return Ok(target);
            }
        }
    }

    if !allow_download {
        return Err("builtin model not found. Please bundle it under resources/llm/models or import it from Settings.".to_string());
    }

    let default_urls = model_urls(model_id);
    let urls: Vec<&str> = if let Some(cu) = custom_url {
        if !cu.is_empty() { vec![cu] } else { default_urls.to_vec() }
    } else {
        default_urls.to_vec()
    };
    if urls.is_empty() || urls[0].is_empty() {
        return Err("builtin model URL not configured".to_string());
    }
    download_to_file(app, progress_ch, &urls, &target, model_id, cancel).await?;

    if !file_starts_with(&target, b"GGUF") {
        let _ = std::fs::remove_file(&target);
        return Err("downloaded model is not a GGUF file (signature mismatch)".to_string());
    }
    Ok(target)
}

fn status_from(state: &AppState, model_id: &str) -> BuiltinLlmStatus {
    let running = state.builtin_llm.is_running();
    let models = state.models_dir.read().unwrap();
    let running_model_id = if running {
        state
            .builtin_llm
            .current_model_path()
            .and_then(|p| model_id_from_path(&models, &p))
    } else {
        None
    };
    let running_this_model = running_model_id.as_deref() == Some(model_id);
    let base_url = if running {
        state
            .builtin_llm
            .current_port()
            .map(|p| format!("http://127.0.0.1:{p}"))
    } else {
        None
    };

    BuiltinLlmStatus {
        runtime_installed: runtime_installed(&state.llm_dir, "cpu", "vulkan"),
        model_installed: model_candidate_paths(&models, model_id).iter().any(|p| p.exists()),
        model_id: model_id.to_string(),
        running_model_id,
        running_this_model,
        running,
        base_url,
    }
}

fn status_from_options(state: &AppState, model_id: &str, options: &Option<BuiltinLlmOptions>) -> BuiltinLlmStatus {
    let compute_mode = normalize_compute_mode(options.as_ref().and_then(|o| o.compute_mode.as_deref()));
    let gpu_backend = normalize_gpu_backend(options.as_ref().and_then(|o| o.gpu_backend.as_deref()));
    let cuda_version = normalize_cuda_version(options.as_ref().and_then(|o| o.cuda_version.as_deref()));

    let mut s = status_from(state, model_id);
    // runtime_installed currently uses generic cpu/vulkan/cuda dir; for CUDA we treat per-version dirs
    if compute_mode == "gpu" || compute_mode == "hybrid" {
        let rt = runtime_dir(&state.llm_dir, compute_mode, gpu_backend, cuda_version);
        s.runtime_installed = find_llama_server(&rt).is_some();
    } else {
        s.runtime_installed = runtime_installed(&state.llm_dir, compute_mode, gpu_backend);
    }
    s
}

#[tauri::command]
pub fn builtin_llm_status(state: State<AppState>, options: Option<BuiltinLlmOptions>) -> Result<BuiltinLlmStatus, String> {
    let model_id = sanitize_model_id(options.as_ref().and_then(|o| o.model_id.clone()));
    Ok(status_from_options(&state, &model_id, &options))
}

fn probe_vram_bytes_from_nvidia_smi() -> Option<u64> {
    let mut cmd = Command::new("nvidia-smi");
    cmd.args([
        "--query-gpu=memory.total",
        "--format=csv,noheader,nounits",
    ]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let out = cmd.output().ok()?;
    if !out.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&out.stdout);
    let mut best_mb: u64 = 0;
    for line in s.lines() {
        let t = line.trim();
        if t.is_empty() {
            continue;
        }
        let mb = t.parse::<u64>().ok();
        if let Some(mb) = mb {
            best_mb = best_mb.max(mb);
        }
    }
    if best_mb == 0 {
        return None;
    }
    Some(best_mb.saturating_mul(1024).saturating_mul(1024))
}

#[cfg(target_os = "windows")]
fn probe_vram_bytes_windows() -> Option<u64> {
    if let Some(v) = probe_vram_bytes_from_nvidia_smi() {
        return Some(v);
    }

    // wmic may not exist on recent Windows, so this is best-effort.
    let out = {
        let mut cmd = Command::new("wmic");
        cmd.args(["path", "win32_VideoController", "get", "AdapterRAM"]);
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        cmd.output().ok()
    };

    if let Some(out) = out {
        if out.status.success() {
            let s = String::from_utf8_lossy(&out.stdout);
            let mut best: u64 = 0;
            for line in s.lines() {
                let t = line.trim();
                if t.is_empty() {
                    continue;
                }
                // take pure digits line
                let digits: String = t.chars().filter(|c| c.is_ascii_digit()).collect();
                if digits.is_empty() {
                    continue;
                }
                if let Ok(v) = digits.parse::<u64>() {
                    best = best.max(v);
                }
            }
            if best > 0 {
                return Some(best);
            }
        }
    }

    // PowerShell fallback
    let out = {
        let mut cmd = Command::new("powershell");
        cmd.args([
            "-NoProfile",
            "-Command",
            "(Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty AdapterRAM) -join '\n'",
        ]);
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        cmd.output().ok()?
    };
    if !out.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&out.stdout);
    let mut best: u64 = 0;
    for line in s.lines() {
        let t = line.trim();
        if t.is_empty() {
            continue;
        }
        let digits: String = t.chars().filter(|c| c.is_ascii_digit()).collect();
        if digits.is_empty() {
            continue;
        }
        if let Ok(v) = digits.parse::<u64>() {
            best = best.max(v);
        }
    }
    if best == 0 {
        None
    } else {
        Some(best)
    }
}

#[cfg(not(target_os = "windows"))]
fn probe_vram_bytes_windows() -> Option<u64> {
    None
}

/// On macOS Apple Silicon, GPU shares unified memory with CPU.
/// We report a fraction of total RAM as "VRAM" for tier calculations.
/// On Intel Macs, try system_profiler for discrete GPU VRAM.
#[cfg(target_os = "macos")]
fn probe_vram_bytes_macos() -> Option<u64> {
    // Try system_profiler for discrete GPU VRAM
    let out = Command::new("system_profiler")
        .args(["SPDisplaysDataType"])
        .output()
        .ok()?;
    if out.status.success() {
        let text = String::from_utf8_lossy(&out.stdout);
        // Look for "VRAM (Total):" or "VRAM (Dynamic, Max):" lines
        for line in text.lines() {
            let trimmed = line.trim();
            if trimmed.contains("VRAM") && trimmed.contains(':') {
                // e.g. "VRAM (Total): 8 GB" or "VRAM (Dynamic, Max): 67.67 GB"
                if let Some(after_colon) = trimmed.split(':').nth(1) {
                    let after = after_colon.trim().to_ascii_lowercase();
                    // Parse numeric value
                    let num_str: String = after.chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect();
                    if let Ok(val) = num_str.parse::<f64>() {
                        let bytes = if after.contains("gb") {
                            (val * 1024.0 * 1024.0 * 1024.0) as u64
                        } else if after.contains("mb") {
                            (val * 1024.0 * 1024.0) as u64
                        } else {
                            val as u64
                        };
                        if bytes > 0 {
                            return Some(bytes);
                        }
                    }
                }
            }
        }
    }
    // Fallback for Apple Silicon: use 75% of total RAM as effective GPU memory
    // (unified memory architecture)
    let mut sys = System::new_all();
    sys.refresh_memory();
    let total = sys.total_memory();
    if total > 0 {
        Some(total * 3 / 4)
    } else {
        None
    }
}

#[cfg(not(target_os = "macos"))]
fn probe_vram_bytes_macos() -> Option<u64> {
    None
}

#[cfg(not(target_os = "windows"))]
fn probe_vram_bytes_unix() -> Option<u64> {
    if let Some(v) = probe_vram_bytes_from_nvidia_smi() {
        return Some(v);
    }
    // AMD GPUs on Linux: read VRAM from sysfs
    if let Ok(entries) = std::fs::read_dir("/sys/class/drm") {
        for entry in entries.flatten() {
            let vram_path = entry.path().join("device/mem_info_vram_total");
            if vram_path.exists() {
                if let Ok(content) = std::fs::read_to_string(&vram_path) {
                    if let Ok(bytes) = content.trim().parse::<u64>() {
                        if bytes > 0 {
                            return Some(bytes);
                        }
                    }
                }
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn probe_vram_bytes_unix() -> Option<u64> {
    None
}

fn probe_vram_bytes() -> Option<u64> {
    probe_vram_bytes_windows()
        .or_else(probe_vram_bytes_macos)
        .or_else(probe_vram_bytes_unix)
}

fn cap_tier_by_vram(mut tier: i32, vram_bytes: Option<u64>) -> i32 {
    let vram_bytes = match vram_bytes {
        Some(v) if v > 0 => v,
        _ => return tier,
    };
    let gb = vram_bytes / 1024 / 1024 / 1024;
    let cap = if gb < 4 { 0 } else if gb < 6 { 1 } else if gb < 10 { 2 } else if gb < 12 { 3 } else if gb < 24 { 4 } else { 5 };
    tier = tier.min(cap);
    tier.clamp(0, 5)
}

fn clamp_gpu_layers_by_vram(mut layers: i32, vram_bytes: Option<u64>) -> i32 {
    if layers < 0 {
        layers = 0;
    }
    let vram_bytes = match vram_bytes {
        Some(v) if v > 0 => v,
        _ => return layers,
    };
    let gb = vram_bytes / 1024 / 1024 / 1024;
    let max_layers = if gb < 4 { 0 } else if gb < 6 { 8 } else if gb < 8 { 16 } else { 999 };
    layers.min(max_layers)
}

#[derive(Debug, Serialize)]
pub struct BuiltinProbeResult {
    #[serde(rename = "cpuCores")]
    pub cpu_cores: usize,
    #[serde(rename = "cpuBrand")]
    pub cpu_brand: String,
    #[serde(rename = "totalMemoryBytes")]
    pub total_memory_bytes: u64,
    #[serde(rename = "vramBytes")]
    pub vram_bytes: Option<u64>,
    #[serde(rename = "gpuName")]
    pub gpu_name: Option<String>,
    #[serde(rename = "hasCuda")]
    pub has_cuda: bool,
    #[serde(rename = "hasVulkan")]
    pub has_vulkan: bool,
    #[serde(rename = "hasMetal")]
    pub has_metal: bool,
    #[serde(rename = "isAppleSilicon")]
    pub is_apple_silicon: bool,
}

fn probe_gpu_name() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("powershell");
        cmd.args([
            "-NoProfile",
            "-Command",
            "(Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name) -join ', '",
        ]);
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        let out = cmd.output().ok()?;
        if out.status.success() {
            let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !s.is_empty() {
                // Filter out virtual display drivers (e.g. Oray/Sunlogin, Parsec, RDP)
                let real_gpus: Vec<&str> = s.split(',')
                    .map(|g| g.trim())
                    .filter(|g| {
                        let lower = g.to_ascii_lowercase();
                        !lower.contains("idddriver")
                            && !lower.contains("virtual")
                            && !lower.contains("remote")
                            && !lower.contains("parsec")
                            && !lower.contains("rdp")
                    })
                    .collect();
                if !real_gpus.is_empty() {
                    return Some(real_gpus.join(", "));
                }
                return Some(s);
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        // Try system_profiler to get chipset/GPU info
        let out = Command::new("system_profiler")
            .args(["SPDisplaysDataType"])
            .output()
            .ok()?;
        if out.status.success() {
            let text = String::from_utf8_lossy(&out.stdout);
            // Look for "Chipset Model:" line
            for line in text.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with("Chipset Model:") {
                    let name = trimmed.trim_start_matches("Chipset Model:").trim();
                    if !name.is_empty() {
                        return Some(name.to_string());
                    }
                }
            }
        }
        // Fallback: use sysctl for Apple Silicon chip name
        let out = Command::new("sysctl")
            .args(["-n", "machdep.cpu.brand_string"])
            .output()
            .ok()?;
        if out.status.success() {
            let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if s.contains("Apple") {
                return Some(s);
            }
        }
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        // Linux: try lspci to detect GPU
        if let Ok(out) = Command::new("lspci").output() {
            if out.status.success() {
                let text = String::from_utf8_lossy(&out.stdout);
                let mut gpus = vec![];
                for line in text.lines() {
                    let lower = line.to_ascii_lowercase();
                    if lower.contains("vga") || lower.contains("3d") || lower.contains("display") {
                        // Extract the part after the device class description
                        if let Some(pos) = line.find(": ") {
                            let name = line[pos + 2..].trim();
                            if !name.is_empty() {
                                gpus.push(name.to_string());
                            }
                        }
                    }
                }
                if !gpus.is_empty() {
                    return Some(gpus.join(", "));
                }
            }
        }
        // Fallback: try nvidia-smi for NVIDIA GPUs
        if let Ok(out) = Command::new("nvidia-smi")
            .args(["--query-gpu=name", "--format=csv,noheader,nounits"])
            .output()
        {
            if out.status.success() {
                let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if !s.is_empty() {
                    return Some(s);
                }
            }
        }
    }
    None
}

/// Check if the detected GPU is worth using for LLM inference.
/// Returns false for integrated GPUs with low VRAM, virtual display drivers, etc.
/// Apple Silicon always returns true (Metal with unified memory is excellent for LLM).
fn is_gpu_worth_using(gpu_name: &Option<String>, vram_bytes: Option<u64>, is_apple_silicon: bool) -> bool {
    // Apple Silicon: unified memory + Metal = always worth using
    if is_apple_silicon {
        return true;
    }

    let vram_gb = vram_bytes.unwrap_or(0) / 1024 / 1024 / 1024;

    // VRAM < 2GB: definitely not worth it (integrated GPU territory)
    if vram_gb < 2 {
        return false;
    }

    // Check for known integrated/virtual GPU patterns
    if let Some(name) = gpu_name {
        let lower = name.to_ascii_lowercase();
        // Intel integrated GPUs
        if lower.contains("intel") && (lower.contains("uhd") || lower.contains(" hd ") || lower.contains("iris")) {
            return false;
        }
        // Virtual display drivers
        if lower.contains("idddriver") || lower.contains("virtual") || lower.contains("remote") {
            return false;
        }
    }

    true
}

/// Detect if running on Apple Silicon (aarch64 macOS).
fn detect_apple_silicon() -> bool {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    { true }
    #[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
    { false }
}

#[tauri::command]
pub fn builtin_llm_probe_system() -> Result<BuiltinProbeResult, String> {
    let mut sys = System::new_all();
    sys.refresh_memory();
    sys.refresh_cpu();

    // sysinfo >= 0.28 returns bytes directly
    let total_memory_bytes = sys.total_memory();
    let cpu_cores = sys.cpus().len();
    let cpu_brand = sys.cpus().first().map(|c| c.brand().to_string()).unwrap_or_default();

    let is_apple_silicon = detect_apple_silicon();

    // Platform-specific GPU backend detection
    #[cfg(target_os = "windows")]
    let (has_vulkan, has_cuda) = (
        unsafe { Library::new("vulkan-1.dll") }.is_ok(),
        unsafe { Library::new("nvcuda.dll") }.is_ok(),
    );
    #[cfg(target_os = "macos")]
    let (has_vulkan, has_cuda) = (false, false);
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    let (has_vulkan, has_cuda) = (
        unsafe { Library::new("libvulkan.so.1") }.is_ok(),
        unsafe { Library::new("libcuda.so.1") }.is_ok()
            || unsafe { Library::new("libcuda.so") }.is_ok(),
    );

    // Metal is always available on macOS 10.14+
    let has_metal = cfg!(target_os = "macos");

    let vram_bytes = probe_vram_bytes();
    let gpu_name = probe_gpu_name();

    Ok(BuiltinProbeResult {
        cpu_cores,
        cpu_brand,
        total_memory_bytes,
        vram_bytes,
        gpu_name,
        has_cuda,
        has_vulkan,
        has_metal,
        is_apple_silicon,
    })
}

#[derive(Debug, Deserialize)]
pub struct BuiltinAutoStartOptions {
    #[serde(rename = "allowDownload")]
    pub allow_download: Option<bool>,
    #[serde(rename = "preferredTier")]
    pub preferred_tier: Option<String>,
    #[serde(rename = "preferredCompute")]
    pub preferred_compute: Option<String>,
    #[serde(rename = "gpuLayers")]
    pub gpu_layers: Option<i32>,
    #[serde(rename = "cudaVersion")]
    pub cuda_version: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct BuiltinAutoStartResult {
    #[serde(rename = "chosenModelId")]
    pub chosen_model_id: String,
    #[serde(rename = "chosenComputeMode")]
    pub chosen_compute_mode: String,
    #[serde(rename = "chosenGpuBackend")]
    pub chosen_gpu_backend: String,
    #[serde(rename = "chosenCudaVersion")]
    pub chosen_cuda_version: String,
    pub status: BuiltinLlmStatus,
    pub probe: BuiltinProbeResult,
}

/// CPU performance tier based on logical core count (targeting fluency ≥ 8 tok/s).
/// Conservative: prefer a smaller model that runs smoothly over a larger model that stutters.
/// Thresholds from real-world testing: i7-10700 (16 threads) — 4B acceptable but not fluent,
/// 1.7B fluent. Quick-setup benchmark will refine this estimate with actual tok/s measurement.
fn cpu_performance_tier(cpu_cores: usize) -> i32 {
    if cpu_cores >= 24 { 3 }       // 12+ physical cores (Ryzen 9, i9-12900+) → 8B
    else if cpu_cores >= 20 { 2 }  // 10 physical cores (i9-10900K) → 4B
    else if cpu_cores >= 8 { 1 }   // 4-9 physical cores (i7-10700 = 16 threads, i5) → 1.7B
    else { 0 }                     // < 4 physical cores → 0.6B
}

/// Consider RAM, CPU performance, and GPU VRAM when selecting tier.
/// - CPU mode: min(ram_tier, cpu_tier) — both memory and compute must be sufficient
/// - GPU mode: min(ram_tier, vram_tier) — model must fit in VRAM
/// - Hybrid mode: min(ram_tier, cpu_tier) — RAM + CPU for model, GPU accelerates layers
fn tier_from_resources(total_mem_gb: u64, vram_bytes: Option<u64>, compute_mode: &str, cpu_cores: usize) -> i32 {
    let ram_tier = if total_mem_gb < 8 { 0 }
        else if total_mem_gb < 12 { 1 }
        else if total_mem_gb < 20 { 2 }
        else if total_mem_gb < 32 { 3 }
        else if total_mem_gb < 48 { 4 }
        else { 5 };

    let cpu_tier = cpu_performance_tier(cpu_cores);

    if compute_mode == "cpu" {
        return ram_tier.min(cpu_tier);
    }

    let vram_gb = vram_bytes.unwrap_or(0) / 1024 / 1024 / 1024;
    let vram_tier = if vram_gb < 4 { 0 }
        else if vram_gb < 6 { 1 }
        else if vram_gb < 10 { 2 }
        else if vram_gb < 12 { 3 }
        else if vram_gb < 24 { 4 }
        else { 5 };

    if compute_mode == "gpu" {
        // GPU mode: VRAM is hard constraint, also can't exceed RAM capacity
        ram_tier.min(vram_tier)
    } else {
        // Hybrid mode: RAM determines model size, CPU+GPU share compute
        // GPU layers capped separately by clamp_gpu_layers_by_vram
        ram_tier.min(cpu_tier)
    }
}

fn tier_to_model_id(tier: i32, _total_mem_gb: u64) -> String {
    match tier {
        5 => "qwen3_32b_q4_k_m".to_string(),
        4 => "qwen3_14b_q4_k_m".to_string(),
        3 => "qwen3_8b_q4_k_m".to_string(),
        2 => "qwen3_4b_q4_k_m".to_string(),
        1 => "qwen3_1_7b_q4_k_m".to_string(),
        _ => "qwen3_0_6b_q4_k_m".to_string(),
    }
}

fn parse_preferred_tier(raw: Option<&str>) -> Option<i32> {
    let r = raw?.trim();
    if r.eq_ignore_ascii_case("auto") || r.is_empty() {
        return None;
    }
    match r {
        "0" => Some(0),
        "1" => Some(1),
        "2" => Some(2),
        "3" => Some(3),
        "4" => Some(4),
        "5" => Some(5),
        _ => None,
    }
}

fn normalize_preferred_compute(raw: Option<&str>) -> Option<&'static str> {
    match raw {
        Some("cpu") => Some("cpu"),
        Some("gpu") => Some("gpu"),
        Some("hybrid") => Some("hybrid"),
        _ => None,
    }
}

#[derive(Debug, Deserialize)]
pub struct BuiltinRecommendOptions {
    #[serde(rename = "preferredTier")]
    pub preferred_tier: Option<String>,
    #[serde(rename = "preferredCompute")]
    pub preferred_compute: Option<String>,
    #[serde(rename = "cudaVersion")]
    pub cuda_version: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct BuiltinRecommendResult {
    #[serde(rename = "recommendedModelId")]
    pub recommended_model_id: String,
    #[serde(rename = "recommendedComputeMode")]
    pub recommended_compute_mode: String,
    #[serde(rename = "recommendedGpuBackend")]
    pub recommended_gpu_backend: String,
    #[serde(rename = "recommendedCudaVersion")]
    pub recommended_cuda_version: String,
    pub probe: BuiltinProbeResult,
}

#[tauri::command]
pub fn builtin_llm_recommend(options: Option<BuiltinRecommendOptions>) -> Result<BuiltinRecommendResult, String> {
    let probe = builtin_llm_probe_system()?;
    let total_mem_gb = probe.total_memory_bytes / 1024 / 1024 / 1024;

    let preferred_tier = parse_preferred_tier(options.as_ref().and_then(|o| o.preferred_tier.as_deref()));
    let preferred_compute = normalize_preferred_compute(options.as_ref().and_then(|o| o.preferred_compute.as_deref()));
    let cuda_version = normalize_cuda_version(options.as_ref().and_then(|o| o.cuda_version.as_deref()));

    let gpu_useful = is_gpu_worth_using(&probe.gpu_name, probe.vram_bytes, probe.is_apple_silicon);

    let (compute_mode, gpu_backend) = if let Some(pc) = preferred_compute {
        let backend = if (pc == "gpu" || pc == "hybrid") && probe.has_cuda {
            "cuda"
        } else if (pc == "gpu" || pc == "hybrid") && probe.has_metal {
            "metal"
        } else {
            normalize_gpu_backend(None)
        };
        (pc.to_string(), backend.to_string())
    } else if probe.has_metal && gpu_useful {
        ("gpu".to_string(), "metal".to_string())
    } else if probe.has_cuda && gpu_useful {
        ("gpu".to_string(), "cuda".to_string())
    } else if probe.has_vulkan && gpu_useful {
        ("hybrid".to_string(), "vulkan".to_string())
    } else {
        ("cpu".to_string(), "none".to_string())
    };

    let mut tier = preferred_tier.unwrap_or_else(|| {
        tier_from_resources(total_mem_gb, probe.vram_bytes, &compute_mode, probe.cpu_cores)
    });
    tier = tier.clamp(0, 5);

    if compute_mode == "gpu" || compute_mode == "hybrid" {
        tier = cap_tier_by_vram(tier, probe.vram_bytes);
    }

    let model_id = tier_to_model_id(tier, total_mem_gb);
    Ok(BuiltinRecommendResult {
        recommended_model_id: model_id,
        recommended_compute_mode: compute_mode,
        recommended_gpu_backend: gpu_backend,
        recommended_cuda_version: cuda_version.to_string(),
        probe,
    })
}

#[tauri::command]
pub async fn builtin_llm_auto_start(
    app: AppHandle,
    state: State<'_, AppState>,
    options: Option<BuiltinAutoStartOptions>,
    on_progress: Channel<DownloadProgress>,
) -> Result<BuiltinAutoStartResult, String> {
    let probe = builtin_llm_probe_system()?;
    let total_mem_gb = probe.total_memory_bytes / 1024 / 1024 / 1024;

    let allow_download = options.as_ref().and_then(|o| o.allow_download).unwrap_or(true);
    let gpu_layers_requested = options.as_ref().and_then(|o| o.gpu_layers).unwrap_or(20).max(0);
    let cuda_version = normalize_cuda_version(options.as_ref().and_then(|o| o.cuda_version.as_deref()));

    let preferred_tier = parse_preferred_tier(options.as_ref().and_then(|o| o.preferred_tier.as_deref()));
    let preferred_compute = normalize_preferred_compute(options.as_ref().and_then(|o| o.preferred_compute.as_deref()));

    let gpu_useful = is_gpu_worth_using(&probe.gpu_name, probe.vram_bytes, probe.is_apple_silicon);

    let mut compute_candidates: Vec<(&'static str, &'static str)> = vec![];
    if let Some(pc) = preferred_compute {
        let backend = if (pc == "gpu" || pc == "hybrid") && probe.has_cuda {
            "cuda"
        } else if (pc == "gpu" || pc == "hybrid") && probe.has_metal {
            "metal"
        } else {
            normalize_gpu_backend(None)
        };
        compute_candidates.push((pc, backend));
    } else {
        if probe.has_metal && gpu_useful {
            compute_candidates.push(("gpu", "metal"));
        }
        if probe.has_cuda && gpu_useful {
            compute_candidates.push(("gpu", "cuda"));
        }
        if probe.has_vulkan && gpu_useful {
            compute_candidates.push(("hybrid", "vulkan"));
        }
        compute_candidates.push(("cpu", "none"));
    }

    for (compute_mode, gpu_backend) in compute_candidates {
        let mut tier = preferred_tier.unwrap_or_else(|| {
            tier_from_resources(total_mem_gb, probe.vram_bytes, compute_mode, probe.cpu_cores)
        });
        tier = tier.clamp(0, 5);

        let mut t = if compute_mode == "gpu" || compute_mode == "hybrid" {
            cap_tier_by_vram(tier, probe.vram_bytes)
        } else {
            tier
        };
        while t >= 0 {
            let model_id = tier_to_model_id(t, total_mem_gb);

            let gpu_layers = if compute_mode == "gpu" || compute_mode == "hybrid" {
                clamp_gpu_layers_by_vram(gpu_layers_requested, probe.vram_bytes)
            } else {
                0
            };
            let opts = BuiltinLlmOptions {
                model_id: Some(model_id.clone()),
                mode: Some(if allow_download { "auto".to_string() } else { "bundled_only".to_string() }),
                compute_mode: Some(compute_mode.to_string()),
                gpu_backend: Some(gpu_backend.to_string()),
                gpu_layers: Some(gpu_layers),
                cuda_version: Some(cuda_version.to_string()),
                model_url: None,
                runtime_url: None,
                cudart_url: None,
            };

            match ensure_running_impl(&app, &state, &Some(opts), &on_progress).await {
                Ok(status) => {
                    return Ok(BuiltinAutoStartResult {
                        chosen_model_id: model_id,
                        chosen_compute_mode: compute_mode.to_string(),
                        chosen_gpu_backend: gpu_backend.to_string(),
                        chosen_cuda_version: cuda_version.to_string(),
                        status,
                        probe,
                    });
                }
                Err(_) => {
                    t -= 1;
                }
            }
        }
    }

    Err("auto start failed after trying fallbacks".to_string())
}

#[derive(Debug, Serialize)]
pub struct BuiltinModelInfo {
    #[serde(rename = "modelId")]
    pub model_id: String,
    #[serde(rename = "fileName")]
    pub file_name: String,
    pub size: u64,
}

#[tauri::command]
pub fn builtin_llm_list_models(state: State<AppState>) -> Result<Vec<BuiltinModelInfo>, String> {
    let dir = state.models_dir.read().unwrap().clone();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let mut out: Vec<BuiltinModelInfo> = vec![];
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
        if !ext.eq_ignore_ascii_case("gguf") {
            continue;
        }
        let meta = match std::fs::metadata(&path) {
            Ok(m) => m,
            Err(_) => continue,
        };
        let file_name = path.file_name().and_then(|s| s.to_str()).unwrap_or("model.gguf");

        let mut model_id = path
            .file_stem()
            .and_then(|s| s.to_str())
            .map(|s| s.to_string());

        for id in [
            "qwen3_0_6b_q4_k_m",
            "qwen3_1_7b_q4_k_m",
            "qwen3_4b_q4_k_m",
            "qwen3_8b_q4_k_m",
            "qwen3_14b_q4_k_m",
            "qwen3_32b_q4_k_m",
        ] {
            if file_name == model_file_name(id) {
                model_id = Some(id.to_string());
            }
        }

        let model_id = sanitize_model_id(model_id);
        out.push(BuiltinModelInfo {
            model_id,
            file_name: file_name.to_string(),
            size: meta.len(),
        });
    }

    out.sort_by(|a, b| a.model_id.cmp(&b.model_id));
    Ok(out)
}

#[tauri::command]
pub async fn builtin_llm_install(
    app: AppHandle,
    state: State<'_, AppState>,
    options: Option<BuiltinLlmOptions>,
    on_progress: Channel<DownloadProgress>,
) -> Result<BuiltinLlmStatus, String> {
    let model_id = sanitize_model_id(options.as_ref().and_then(|o| o.model_id.clone()));
    let allow_download = options
        .as_ref()
        .and_then(|o| o.mode.as_deref())
        != Some("bundled_only");
    let compute_mode = normalize_compute_mode(options.as_ref().and_then(|o| o.compute_mode.as_deref()));
    let gpu_backend = normalize_gpu_backend(options.as_ref().and_then(|o| o.gpu_backend.as_deref()));
    let cuda_version = normalize_cuda_version(options.as_ref().and_then(|o| o.cuda_version.as_deref()));

    let custom_url = options.as_ref().and_then(|o| o.model_url.as_deref());
    let rt_url = options.as_ref().and_then(|o| o.runtime_url.as_deref());
    let cudart_url = options.as_ref().and_then(|o| o.cudart_url.as_deref());
    let models_dir = state.models_dir.read().unwrap().clone();
    state.download_cancel.store(false, Ordering::Relaxed);
    let _ = ensure_runtime_with_mode(&app, &state.llm_dir, compute_mode, gpu_backend, cuda_version, rt_url, cudart_url, &state.download_cancel, &on_progress).await?;
    let _ = ensure_model_with_mode(&app, &models_dir, &model_id, allow_download, custom_url, &state.download_cancel, &on_progress).await?;
    Ok(status_from_options(&state, &model_id, &options))
}

async fn ensure_running_impl(
    app: &AppHandle,
    state: &AppState,
    options: &Option<BuiltinLlmOptions>,
    progress_ch: &Channel<DownloadProgress>,
) -> Result<BuiltinLlmStatus, String> {
    let model_id = sanitize_model_id(options.as_ref().and_then(|o| o.model_id.clone()));
    let allow_download = options
        .as_ref()
        .and_then(|o| o.mode.as_deref())
        != Some("bundled_only");
    let compute_mode = normalize_compute_mode(options.as_ref().and_then(|o| o.compute_mode.as_deref()));
    let gpu_backend = normalize_gpu_backend(options.as_ref().and_then(|o| o.gpu_backend.as_deref()));
    let cuda_version = normalize_cuda_version(options.as_ref().and_then(|o| o.cuda_version.as_deref()));
    let gpu_layers = options
        .as_ref()
        .and_then(|o| o.gpu_layers)
        .unwrap_or(20)
        .max(0);

    if state.builtin_llm.is_running() {
        let current_id = state
            .builtin_llm
            .current_model_path()
            .and_then(|p| model_id_from_path(&state.models_dir.read().unwrap(), &p));
        let current_compute = state
            .builtin_llm
            .compute_mode
            .lock()
            .unwrap()
            .clone()
            .unwrap_or_else(|| "cpu".to_string());
        let current_backend = state
            .builtin_llm
            .gpu_backend
            .lock()
            .unwrap()
            .clone()
            .unwrap_or_else(|| "vulkan".to_string());
        let current_layers = *state
            .builtin_llm
            .gpu_layers
            .lock()
            .unwrap()
            .as_ref()
            .unwrap_or(&0);

        let current_cuda = state
            .builtin_llm
            .cuda_version
            .lock()
            .unwrap()
            .clone()
            .unwrap_or_else(|| "12.4".to_string());

        let same_compute = current_compute == compute_mode;
        let same_backend = current_backend == gpu_backend;
        let same_layers = compute_mode != "hybrid" || current_layers == gpu_layers;
        let same_cuda = !gpu_backend.eq_ignore_ascii_case("cuda") || current_cuda == cuda_version;

        if current_id.as_deref() == Some(&model_id) && same_compute && same_backend && same_layers && same_cuda {
            return Ok(status_from_options(state, &model_id, options));
        }
        state.builtin_llm.stop();
    }

    let custom_url = options.as_ref().and_then(|o| o.model_url.as_deref());
    let rt_url = options.as_ref().and_then(|o| o.runtime_url.as_deref());
    let cudart_url = options.as_ref().and_then(|o| o.cudart_url.as_deref());
    let models_dir = state.models_dir.read().unwrap().clone();
    state.download_cancel.store(false, Ordering::Relaxed);
    let server = ensure_runtime_with_mode(app, &state.llm_dir, compute_mode, gpu_backend, cuda_version, rt_url, cudart_url, &state.download_cancel, progress_ch).await?;
    let model = ensure_model_with_mode(app, &models_dir, &model_id, allow_download, custom_url, &state.download_cancel, progress_ch).await?;

    let port = pick_free_port()?;

    let mut cmd = Command::new(&server);
    cmd.arg("-m")
        .arg(&model)
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(port.to_string())
        .arg("--ctx-size")
        .arg("4096")
        .arg("--jinja")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());

    if compute_mode == "gpu" {
        cmd.arg("--n-gpu-layers").arg("999");
    } else if compute_mode == "hybrid" {
        cmd.arg("--n-gpu-layers").arg(gpu_layers.to_string());
    } else {
        cmd.arg("--n-gpu-layers").arg("0");
    }

    // Ensure CUDA/Vulkan DLLs are discoverable by prepending runtime dir to PATH
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let rt = runtime_dir(&state.llm_dir, compute_mode, gpu_backend, cuda_version);
        cmd.env("PATH", prepend_runtime_to_path(&server, &rt));
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let child = cmd.spawn().map_err(|e| e.to_string())?;
    state.builtin_llm.set_running(
        child,
        port,
        model,
        compute_mode.to_string(),
        gpu_backend.to_string(),
        gpu_layers,
        cuda_version.to_string(),
    );

    let ok = wait_port_open(port, Duration::from_secs(12));
    if !ok {
        return Err("llama-server failed to start".to_string());
    }

    Ok(status_from(state, &model_id))
}

#[tauri::command]
pub async fn builtin_llm_ensure_running(
    app: AppHandle,
    state: State<'_, AppState>,
    options: Option<BuiltinLlmOptions>,
    on_progress: Channel<DownloadProgress>,
) -> Result<BuiltinLlmStatus, String> {
    ensure_running_impl(&app, &state, &options, &on_progress).await
}

#[tauri::command]
pub fn builtin_llm_stop(state: State<AppState>, options: Option<BuiltinLlmOptions>) -> Result<BuiltinLlmStatus, String> {
    state.builtin_llm.stop();
    let model_id = sanitize_model_id(options.as_ref().and_then(|o| o.model_id.clone()));
    Ok(status_from_options(&state, &model_id, &options))
}

#[tauri::command]
pub fn builtin_llm_delete_model(state: State<AppState>, options: Option<BuiltinLlmOptions>) -> Result<(), String> {
    let model_id = sanitize_model_id(options.as_ref().and_then(|o| o.model_id.clone()));

    // Prevent deleting a model that is currently running
    if state.builtin_llm.is_running() {
        let current_id = state
            .builtin_llm
            .current_model_path()
            .and_then(|p| model_id_from_path(&state.models_dir.read().unwrap(), &p));
        if current_id.as_deref() == Some(&model_id) {
            return Err("Cannot delete a model that is currently running. Stop it first.".to_string());
        }
    }

    let mut deleted = false;
    for cand in model_candidate_paths(&state.models_dir.read().unwrap(), &model_id) {
        if cand.exists() {
            std::fs::remove_file(&cand).map_err(|e| format!("Failed to delete {}: {}", cand.display(), e))?;
            deleted = true;
        }
    }
    if !deleted {
        return Err(format!("Model file not found for '{}'", model_id));
    }
    Ok(())
}

#[tauri::command]
pub async fn builtin_llm_install_runtime(
    app: AppHandle,
    state: State<'_, AppState>,
    options: Option<BuiltinLlmOptions>,
    on_progress: Channel<DownloadProgress>,
) -> Result<(), String> {
    let compute_mode = normalize_compute_mode(options.as_ref().and_then(|o| o.compute_mode.as_deref()));
    let gpu_backend = normalize_gpu_backend(options.as_ref().and_then(|o| o.gpu_backend.as_deref()));
    let cuda_version = normalize_cuda_version(options.as_ref().and_then(|o| o.cuda_version.as_deref()));
    let rt_url = options.as_ref().and_then(|o| o.runtime_url.as_deref());
    let cudart_url = options.as_ref().and_then(|o| o.cudart_url.as_deref());
    state.download_cancel.store(false, Ordering::Relaxed);
    let _ = ensure_runtime_with_mode(&app, &state.llm_dir, compute_mode, gpu_backend, cuda_version, rt_url, cudart_url, &state.download_cancel, &on_progress).await?;
    Ok(())
}

#[tauri::command]
pub fn builtin_llm_cancel_download(
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.download_cancel.store(true, Ordering::Relaxed);
    Ok(())
}

/// Returns true if this system can only use bundled runtimes (no downloads).
/// Frontend uses this to hide download-related UI on old-glibc systems.
#[tauri::command]
pub fn builtin_llm_is_bundled_only() -> bool {
    is_bundled_runtime_only()
}

#[derive(Debug, Serialize)]
pub struct RuntimeStatusResult {
    pub installed: bool,
    #[serde(rename = "runtimeDir")]
    pub runtime_dir_path: String,
    #[serde(rename = "computeMode")]
    pub compute_mode: String,
    #[serde(rename = "gpuBackend")]
    pub gpu_backend: String,
    #[serde(rename = "cudaVersion")]
    pub cuda_version: String,
}

#[tauri::command]
pub fn builtin_llm_runtime_status(
    state: State<AppState>,
    options: Option<BuiltinLlmOptions>,
) -> Result<RuntimeStatusResult, String> {
    let compute_mode = normalize_compute_mode(options.as_ref().and_then(|o| o.compute_mode.as_deref()));
    let gpu_backend = normalize_gpu_backend(options.as_ref().and_then(|o| o.gpu_backend.as_deref()));
    let cuda_version = normalize_cuda_version(options.as_ref().and_then(|o| o.cuda_version.as_deref()));

    let installed = if compute_mode == "gpu" || compute_mode == "hybrid" {
        let rt = runtime_dir(&state.llm_dir, compute_mode, gpu_backend, cuda_version);
        find_llama_server(&rt).is_some()
    } else {
        runtime_installed(&state.llm_dir, compute_mode, gpu_backend)
    };

    let rt = runtime_dir(&state.llm_dir, compute_mode, gpu_backend, cuda_version);

    Ok(RuntimeStatusResult {
        installed,
        runtime_dir_path: rt.to_string_lossy().to_string(),
        compute_mode: compute_mode.to_string(),
        gpu_backend: gpu_backend.to_string(),
        cuda_version: cuda_version.to_string(),
    })
}

#[tauri::command]
pub fn builtin_llm_import_runtime(
    state: State<AppState>,
    paths: Vec<String>,
    options: Option<BuiltinLlmOptions>,
) -> Result<(), String> {
    let compute_mode = normalize_compute_mode(options.as_ref().and_then(|o| o.compute_mode.as_deref()));
    let gpu_backend = normalize_gpu_backend(options.as_ref().and_then(|o| o.gpu_backend.as_deref()));
    let cuda_version = normalize_cuda_version(options.as_ref().and_then(|o| o.cuda_version.as_deref()));

    let rt = runtime_dir(&state.llm_dir, compute_mode, gpu_backend, cuda_version);
    std::fs::create_dir_all(&rt).map_err(|e| e.to_string())?;

    for p in &paths {
        let zip_path = PathBuf::from(p);
        safe_archive_extract(&zip_path, &rt)?;
    }

    if find_llama_server(&rt).is_some() {
        Ok(())
    } else {
        Err("Imported zip(s) do not contain llama-server. For CUDA, import both the llama zip and cudart zip.".to_string())
    }
}

#[tauri::command]
pub fn builtin_llm_delete_runtime(
    state: State<AppState>,
    options: Option<BuiltinLlmOptions>,
) -> Result<(), String> {
    if state.builtin_llm.is_running() {
        state.builtin_llm.stop();
        // Wait a moment for file handles to be released
        std::thread::sleep(Duration::from_millis(500));
    }
    let compute_mode = normalize_compute_mode(options.as_ref().and_then(|o| o.compute_mode.as_deref()));
    let gpu_backend = normalize_gpu_backend(options.as_ref().and_then(|o| o.gpu_backend.as_deref()));
    let cuda_version = normalize_cuda_version(options.as_ref().and_then(|o| o.cuda_version.as_deref()));

    let rt = runtime_dir(&state.llm_dir, compute_mode, gpu_backend, cuda_version);
    if rt.exists() {
        // Retry delete in case file handles are slow to release
        let mut last_err = None;
        for attempt in 0..3 {
            match std::fs::remove_dir_all(&rt) {
                Ok(_) => { last_err = None; break; }
                Err(e) => {
                    last_err = Some(e);
                    if attempt < 2 {
                        std::thread::sleep(Duration::from_millis(500));
                    }
                }
            }
        }
        if let Some(e) = last_err {
            return Err(format!("Failed to delete runtime dir: {}", e));
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn builtin_llm_import_model(state: State<'_, AppState>, path: String, options: Option<BuiltinLlmOptions>) -> Result<BuiltinLlmStatus, String> {
    let mut model_id = options.as_ref().and_then(|o| o.model_id.clone());
    if model_id.as_deref().map(|s| s.trim().is_empty()).unwrap_or(true) {
        let src = PathBuf::from(&path);
        if let Some(stem) = src.file_stem().and_then(|s| s.to_str()) {
            model_id = Some(stem.to_string());
        }
    }
    let model_id = sanitize_model_id(model_id);

    let mdir = state.models_dir.read().unwrap().clone();
    let desired = model_file_path(&mdir, &model_id);
    let target = if desired.exists() {
        let models = mdir.clone();
        let base_name = desired.file_name().and_then(|s| s.to_str()).unwrap_or("model.gguf");
        let stem = Path::new(base_name).file_stem().and_then(|s| s.to_str()).unwrap_or("model");
        let ext = "gguf";
        let mut out = desired.clone();
        for i in 1..=999u32 {
            let name = format!("{}-{}.{ext}", stem, i);
            let cand = models.join(name);
            if !cand.exists() {
                out = cand;
                break;
            }
        }
        out
    } else {
        desired
    };
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let src = PathBuf::from(path);
    std::fs::copy(&src, &target).map_err(|e| e.to_string())?;

    if !file_starts_with(&target, b"GGUF") {
        let _ = std::fs::remove_file(&target);
        return Err("imported model is not a GGUF file (signature mismatch)".to_string());
    }

    Ok(status_from(&state, &model_id))
}

// ---------------------------------------------------------------------------
// Benchmark: measure generation tok/s using llama-bench (no server needed)
// ---------------------------------------------------------------------------

fn find_llama_bench(runtime: &Path) -> Option<PathBuf> {
    let candidates = [
        runtime.join("llama-bench.exe"),
        runtime.join("llama-bench"),
    ];
    for c in candidates {
        if c.exists() {
            return Some(c);
        }
    }
    for entry in walkdir::WalkDir::new(runtime).max_depth(2).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
        if name == "llama-bench.exe" || name == "llama-bench" {
            return Some(entry.path().to_path_buf());
        }
    }
    None
}

#[derive(Debug, Serialize)]
pub struct BenchmarkResult {
    #[serde(rename = "tokensPerSecond")]
    pub tokens_per_second: f64,
    #[serde(rename = "completionTokens")]
    pub completion_tokens: u64,
    #[serde(rename = "elapsedMs")]
    pub elapsed_ms: u64,
    #[serde(rename = "recommendedTier")]
    pub recommended_tier: i32,
    #[serde(rename = "recommendedModelId")]
    pub recommended_model_id: String,
}

/// Determine model tier from 0.6B benchmark tok/s.
/// Benchmark runs on 0.6B model; scale tok/s to estimate larger model performance.
/// Model size scaling (approximate, memory-bandwidth bound):
///   1.7B ≈ 2.8x slower,  4B ≈ 6.5x slower,  8B ≈ 13x slower,
///   14B ≈ 23x slower,  32B ≈ 53x slower
/// Fluency target: ≥ 8 tok/s generation speed.
///
/// Constraints applied:
///   - RAM: caps tier based on total system memory
///   - VRAM: for GPU/hybrid modes, also caps tier by available VRAM
fn tier_from_benchmark(tps: f64, total_mem_gb: u64, compute_mode: &str, vram_bytes: Option<u64>) -> (i32, String) {
    let tier = if tps >= 420.0 { 5 }       // 32B estimated ~7.9 tok/s
        else if tps >= 185.0 { 4 }         // 14B estimated ~8.0 tok/s
        else if tps >= 100.0 { 3 }         // 8B estimated ~7.7 tok/s
        else if tps >= 50.0 { 2 }          // 4B estimated ~7.7 tok/s
        else if tps >= 20.0 { 1 }          // 1.7B estimated ~7.1 tok/s
        else { 0 };                         // stay with 0.6B

    // Cap by RAM
    let ram_tier = if total_mem_gb < 8 { 0 }
        else if total_mem_gb < 12 { 1 }
        else if total_mem_gb < 20 { 2 }
        else if total_mem_gb < 32 { 3 }
        else if total_mem_gb < 48 { 4 }
        else { 5 };
    let mut final_tier = tier.min(ram_tier);

    // For GPU/hybrid modes, also cap by VRAM
    if compute_mode == "gpu" || compute_mode == "hybrid" {
        final_tier = cap_tier_by_vram(final_tier, vram_bytes);
    }

    let model_id = tier_to_model_id(final_tier, total_mem_gb);
    (final_tier, model_id)
}

#[derive(Debug, Deserialize)]
pub struct BenchmarkOptions {
    #[serde(rename = "computeMode")]
    pub compute_mode: Option<String>,
    #[serde(rename = "gpuBackend")]
    pub gpu_backend: Option<String>,
    #[serde(rename = "cudaVersion")]
    pub cuda_version: Option<String>,
    #[serde(rename = "gpuLayers")]
    pub gpu_layers: Option<i32>,
}

#[tauri::command]
pub async fn builtin_llm_benchmark(
    state: State<'_, AppState>,
    options: Option<BenchmarkOptions>,
) -> Result<BenchmarkResult, String> {
    let compute_mode = normalize_compute_mode(options.as_ref().and_then(|o| o.compute_mode.as_deref()));
    let gpu_backend = normalize_gpu_backend(options.as_ref().and_then(|o| o.gpu_backend.as_deref()));
    let cuda_version = normalize_cuda_version(options.as_ref().and_then(|o| o.cuda_version.as_deref()));
    let gpu_layers = options.as_ref().and_then(|o| o.gpu_layers).unwrap_or(20);

    // Find llama-bench in the target runtime directory.
    // Do NOT fall back to CPU runtime for GPU benchmarks — CPU llama-bench lacks GPU support
    // and would silently produce CPU-only results even with -ngl 999.
    let rt = runtime_dir(&state.llm_dir, compute_mode, gpu_backend, cuda_version);
    let bench_exe = find_llama_bench(&rt)
        .ok_or_else(|| format!(
            "llama-bench not found in {}. Please install the {} runtime first.",
            rt.display(),
            if compute_mode == "cpu" { "CPU" } else { gpu_backend }
        ))?;

    // Find 0.6B benchmark model
    let model_path = model_file_path(&state.models_dir.read().unwrap(), "qwen3_0_6b_q4_k_m");
    if !model_path.exists() {
        return Err("Benchmark model (Qwen3-0.6B) not installed".to_string());
    }

    let ngl = if compute_mode == "gpu" || compute_mode == "hybrid" {
        clamp_gpu_layers_by_vram(gpu_layers, probe_vram_bytes()).to_string()
    } else {
        "0".to_string()
    };

    // Run llama-bench: generation-only, 1 repetition, JSON output
    #[cfg(target_os = "windows")]
    let output = {
        use std::os::windows::process::CommandExt;
        let mut cmd = Command::new(&bench_exe);
        cmd.args([
                "-m", &model_path.to_string_lossy(),
                "-p", "0",        // skip prompt processing test
                "-n", "64",       // generate 64 tokens
                "-r", "1",        // 1 repetition (fast)
                "-ngl", &ngl,
                "-o", "json",
            ])
            .env("PATH", prepend_runtime_to_path(&bench_exe, &rt))
            .creation_flags(0x08000000); // CREATE_NO_WINDOW
        cmd.output()
            .map_err(|e| format!("failed to run llama-bench: {e}"))?
    };
    #[cfg(not(target_os = "windows"))]
    let output = Command::new(&bench_exe)
        .args([
            "-m", &model_path.to_string_lossy(),
            "-p", "0",
            "-n", "64",
            "-r", "1",
            "-ngl", &ngl,
            "-o", "json",
        ])
        .output()
        .map_err(|e| format!("failed to run llama-bench: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !output.status.success() && stdout.trim().is_empty() {
        return Err(format!("llama-bench failed (exit {}): {}", output.status, stderr.lines().last().unwrap_or("")));
    }

    // Parse JSON array output from llama-bench
    let results: Vec<serde_json::Value> = serde_json::from_str(stdout.trim())
        .map_err(|e| format!("failed to parse llama-bench JSON: {e}\nstdout: {stdout}"))?;

    // Find generation test result (n_gen > 0)
    let gen_result = results.iter()
        .find(|r| r["n_gen"].as_u64().unwrap_or(0) > 0)
        .ok_or("no generation benchmark result in llama-bench output")?;

    let tokens_per_second = gen_result["avg_ts"].as_f64().unwrap_or(0.0);
    let completion_tokens = gen_result["n_gen"].as_u64().unwrap_or(0);
    let avg_ns = gen_result["avg_ns"].as_f64().unwrap_or(0.0);
    let elapsed_ms = (avg_ns / 1_000_000.0) as u64;

    if tokens_per_second <= 0.0 {
        return Err("llama-bench returned 0 tok/s".to_string());
    }

    let total_mem_gb = {
        let mut sys = System::new_all();
        sys.refresh_memory();
        sys.total_memory() / 1024 / 1024 / 1024
    };

    let vram = probe_vram_bytes();
    let (recommended_tier, recommended_model_id) = tier_from_benchmark(tokens_per_second, total_mem_gb, compute_mode, vram);

    Ok(BenchmarkResult {
        tokens_per_second,
        completion_tokens,
        elapsed_ms,
        recommended_tier,
        recommended_model_id,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    // ── normalize helpers ──

    #[test]
    fn test_normalize_cuda_version() {
        assert_eq!(normalize_cuda_version(Some("13.1")), "13.1");
        assert_eq!(normalize_cuda_version(Some("12.4")), "12.4");
        assert_eq!(normalize_cuda_version(None), "12.4");
        assert_eq!(normalize_cuda_version(Some("xyz")), "12.4");
    }

    #[test]
    fn test_normalize_compute_mode() {
        assert_eq!(normalize_compute_mode(Some("gpu")), "gpu");
        assert_eq!(normalize_compute_mode(Some("hybrid")), "hybrid");
        assert_eq!(normalize_compute_mode(Some("cpu")), "cpu");
        assert_eq!(normalize_compute_mode(None), "cpu");
        assert_eq!(normalize_compute_mode(Some("unknown")), "cpu");
    }

    #[test]
    fn test_normalize_gpu_backend() {
        assert_eq!(normalize_gpu_backend(Some("cuda")), "cuda");
        assert_eq!(normalize_gpu_backend(Some("CUDA")), "cuda");
        assert_eq!(normalize_gpu_backend(Some("metal")), "metal");
        assert_eq!(normalize_gpu_backend(Some("Metal")), "metal");
        // Default depends on platform
        #[cfg(target_os = "macos")]
        assert_eq!(normalize_gpu_backend(None), "metal");
        #[cfg(not(target_os = "macos"))]
        assert_eq!(normalize_gpu_backend(None), "vulkan");
    }

    // ── sanitize_model_id ──

    #[test]
    fn test_sanitize_model_id_valid() {
        assert_eq!(sanitize_model_id(Some("qwen3_0_6b_q4_k_m".into())), "qwen3_0_6b_q4_k_m");
        assert_eq!(sanitize_model_id(Some("my-model.v2".into())), "my-model.v2");
    }

    #[test]
    fn test_sanitize_model_id_empty() {
        assert_eq!(sanitize_model_id(None), "qwen3_0_6b_q4_k_m");
        assert_eq!(sanitize_model_id(Some("".into())), "qwen3_0_6b_q4_k_m");
        assert_eq!(sanitize_model_id(Some("   ".into())), "qwen3_0_6b_q4_k_m");
    }

    #[test]
    fn test_sanitize_model_id_special_chars() {
        // Special chars replaced with _
        let result = sanitize_model_id(Some("model@v1!".into()));
        assert!(!result.contains('@'));
        assert!(!result.contains('!'));
    }

    #[test]
    fn test_sanitize_model_id_truncates_long() {
        let long = "a".repeat(200);
        let result = sanitize_model_id(Some(long));
        assert!(result.len() <= 80);
    }

    // ── is_builtin_qwen3_model_id ──

    #[test]
    fn test_is_builtin_qwen3_model_id() {
        assert!(is_builtin_qwen3_model_id("qwen3_0_6b_q4_k_m"));
        assert!(is_builtin_qwen3_model_id("qwen3_32b_q4_k_m"));
        assert!(!is_builtin_qwen3_model_id("custom_model"));
        assert!(!is_builtin_qwen3_model_id(""));
    }

    // ── model_file_name ──

    #[test]
    fn test_model_file_name() {
        assert_eq!(model_file_name("qwen3_0_6b_q4_k_m"), "Qwen3-0.6B-Q4_K_M.gguf");
        assert_eq!(model_file_name("qwen3_8b_q4_k_m"), "Qwen3-8B-Q4_K_M.gguf");
        assert_eq!(model_file_name("qwen3_32b_q4_k_m"), "Qwen3-32B-Q4_K_M.gguf");
        // Unknown falls back to 0.6B
        assert_eq!(model_file_name("unknown"), "Qwen3-0.6B-Q4_K_M.gguf");
    }

    // ── legacy_model_file_name ──

    #[test]
    fn test_legacy_model_file_name() {
        assert_eq!(legacy_model_file_name("q8_0"), Some("Qwen3-Embedding-0.6B-Q8_0.gguf"));
        assert_eq!(legacy_model_file_name("qwen3_0_6b_q4_k_m"), None);
    }

    // ── model_urls ──

    #[test]
    fn test_model_urls_known() {
        let urls = model_urls("qwen3_0_6b_q4_k_m");
        assert!(urls[0].contains("modelscope"));
        assert!(urls[1].contains("huggingface"));
        assert!(urls[0].ends_with(".gguf"));
        assert!(urls[1].ends_with(".gguf"));
    }

    #[test]
    fn test_model_urls_unknown() {
        let urls = model_urls("nonexistent");
        assert!(urls[0].is_empty());
    }

    // ── model_file_path ──

    #[test]
    fn test_model_file_path_builtin() {
        let dir = Path::new("/models");
        let p = model_file_path(dir, "qwen3_8b_q4_k_m");
        assert_eq!(p, dir.join("Qwen3-8B-Q4_K_M.gguf"));
    }

    #[test]
    fn test_model_file_path_custom() {
        let dir = Path::new("/models");
        let p = model_file_path(dir, "my_custom_model");
        assert_eq!(p, dir.join("my_custom_model.gguf"));
    }

    #[test]
    fn test_model_file_path_strips_gguf_extension() {
        let dir = Path::new("/models");
        let p = model_file_path(dir, "custom.gguf");
        assert_eq!(p, dir.join("custom.gguf"));
    }

    // ── model_candidate_paths ──

    #[test]
    fn test_model_candidate_paths_builtin() {
        let dir = Path::new("/m");
        let paths = model_candidate_paths(dir, "qwen3_0_6b_q4_k_m");
        assert_eq!(paths.len(), 1); // no legacy for this id
        assert_eq!(paths[0], dir.join("Qwen3-0.6B-Q4_K_M.gguf"));
    }

    #[test]
    fn test_model_candidate_paths_legacy() {
        let dir = Path::new("/m");
        let paths = model_candidate_paths(dir, "q8_0");
        assert_eq!(paths.len(), 2);
        assert!(paths[1].to_string_lossy().contains("Q8_0"));
    }

    // ── model_id_from_path ──

    #[test]
    fn test_model_id_from_path_builtin() {
        let dir = Path::new("/models");
        let path = dir.join("Qwen3-8B-Q4_K_M.gguf");
        assert_eq!(model_id_from_path(dir, &path), Some("qwen3_8b_q4_k_m".to_string()));
    }

    #[test]
    fn test_model_id_from_path_custom() {
        let dir = Path::new("/models");
        let path = dir.join("my_custom.gguf");
        let result = model_id_from_path(dir, &path);
        assert!(result.is_some());
        assert_eq!(result.unwrap(), "my_custom");
    }

    // ── runtime_dir ──

    #[test]
    fn test_runtime_dir_cpu() {
        let llm = Path::new("/llm");
        assert_eq!(runtime_dir(llm, "cpu", "vulkan", "12.4"), llm.join("runtime/cpu"));
    }

    #[test]
    fn test_runtime_dir_gpu_cuda() {
        let llm = Path::new("/llm");
        assert_eq!(runtime_dir(llm, "gpu", "cuda", "12.4"), llm.join("runtime/cuda-12.4"));
        assert_eq!(runtime_dir(llm, "gpu", "cuda", "13.1"), llm.join("runtime/cuda-13.1"));
    }

    #[test]
    fn test_runtime_dir_gpu_vulkan() {
        let llm = Path::new("/llm");
        assert_eq!(runtime_dir(llm, "gpu", "vulkan", "12.4"), llm.join("runtime/vulkan"));
    }

    #[test]
    fn test_runtime_dir_gpu_metal() {
        let llm = Path::new("/llm");
        assert_eq!(runtime_dir(llm, "hybrid", "metal", "12.4"), llm.join("runtime/metal"));
    }
}
