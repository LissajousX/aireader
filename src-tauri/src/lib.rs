mod ollama;
mod ollama_proxy;
mod database;
mod dictionary;
mod builtin_llm;
mod epub;

use ollama::OllamaClient;
use database::{Database, NoteData};
use dictionary::{
    cedict_install,
    cedict_lookup,
    cedict_status,
    dictionary_install_ecdict,
    dictionary_lookup,
    dictionary_status,
    CedictManager,
    DictionaryManager,
};
use builtin_llm::{
    builtin_llm_auto_start,
    builtin_llm_benchmark,
    builtin_llm_cancel_download,
    builtin_llm_is_bundled_only,
    builtin_llm_delete_model,
    builtin_llm_delete_runtime,
    builtin_llm_import_runtime,
    builtin_llm_recommend,
    builtin_llm_ensure_running,
    builtin_llm_import_model,
    builtin_llm_install,
    builtin_llm_install_runtime,
    builtin_llm_list_models,
    builtin_llm_probe_system,
    builtin_llm_runtime_status,
    builtin_llm_status,
    builtin_llm_stop,
    BuiltinLlmManager,
};
use epub::epub_extract;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::RwLock;
use std::path::PathBuf;
use std::io::Write;
use std::path::Path;
use std::process::Command;
use tauri::{AppHandle, State, Manager};

fn sanitize_file_name(name: &str) -> String {
    // Windows/macOS/Linux safe filename
    // Replace reserved characters: <>:"/\\|?* and control chars
    let mut out = String::with_capacity(name.len());
    for ch in name.chars() {
        if ch.is_control() {
            out.push('_');
            continue;
        }
        match ch {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => out.push('_'),
            _ => out.push(ch),
        }
    }

    // Trim trailing dots/spaces (Windows)
    while out.ends_with('.') || out.ends_with(' ') {
        out.pop();
    }

    if out.is_empty() {
        return "file".to_string();
    }

    // Avoid reserved device names on Windows
    let upper = out.trim().to_ascii_uppercase();
    let reserved = [
        "CON", "PRN", "AUX", "NUL",
        "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
        "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
    if reserved.iter().any(|r| *r == upper) {
        out = format!("_{}", out);
    }

    out
}

fn unique_dest_path(dir: &Path, file_name: &str) -> PathBuf {
    let base = Path::new(file_name);
    let stem = base.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
    let ext = base.extension().and_then(|s| s.to_str());

    let mut candidate = dir.join(file_name);
    if !candidate.exists() {
        return candidate;
    }

    for i in 1..=999u32 {
        let suffix = if i == 1 { "-copy".to_string() } else { format!("-copy-{}", i) };
        let name = if let Some(ext) = ext {
            format!("{}{}.{ext}", stem, suffix)
        } else {
            format!("{}{}", stem, suffix)
        };
        candidate = dir.join(name);
        if !candidate.exists() {
            return candidate;
        }
    }

    // Fallback
    let uuid = uuid::Uuid::new_v4();
    let name = if let Some(ext) = ext {
        format!("{}-{}.{ext}", stem, uuid)
    } else {
        format!("{}-{}", stem, uuid)
    };
    dir.join(name)
}

fn import_document_copy_impl(dest_dir: &Path, source_path: &str) -> Result<String, String> {
    std::fs::create_dir_all(dest_dir).map_err(|e| e.to_string())?;

    let file_name = Path::new(source_path)
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "invalid source path".to_string())?;

    let file_name = sanitize_file_name(file_name);
    let dest_path = unique_dest_path(dest_dir, &file_name);
    std::fs::copy(source_path, &dest_path).map_err(|e| e.to_string())?;

    Ok(dest_path.to_string_lossy().to_string())
}

fn import_markdown_copy_impl(dest_dir: &Path, source_path: &str) -> Result<String, String> {
    std::fs::create_dir_all(dest_dir).map_err(|e| e.to_string())?;

    let src_path = PathBuf::from(source_path);
    let src_dir = src_path
        .parent()
        .ok_or_else(|| "invalid source path".to_string())?
        .to_path_buf();

    let src_dir_canon = std::fs::canonicalize(&src_dir).map_err(|e| e.to_string())?;

    let file_name = src_path
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "invalid source path".to_string())?;

    let file_name = sanitize_file_name(file_name);

    // T2: Use file stem as folder name instead of UUID
    let raw_stem = Path::new(&file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("doc")
        .to_string();
    let folder_stem = sanitize_file_name(if raw_stem.len() > 80 { &raw_stem[..80] } else { &raw_stem });
    let folder_stem = if folder_stem.is_empty() { "doc".to_string() } else { folder_stem };
    let mut dest_root = dest_dir.join(&folder_stem);
    if dest_root.exists() {
        dest_root = dest_dir.join(format!("{}-{}", folder_stem, &uuid::Uuid::new_v4().to_string()[..8]));
    }
    std::fs::create_dir_all(&dest_root).map_err(|e| e.to_string())?;

    let dest_md_path = dest_root.join(&file_name);
    std::fs::copy(&src_path, &dest_md_path).map_err(|e| e.to_string())?;

    let md = std::fs::read_to_string(&src_path).map_err(|e| e.to_string())?;

    let mut idx = 0usize;
    while let Some(pos) = md[idx..].find("](") {
        let start = idx + pos + 2;
        if let Some(end_rel) = md[start..].find(')') {
            let end = start + end_rel;
            let raw = md[start..end].trim();
            idx = end + 1;

            if raw.is_empty() {
                continue;
            }

            let mut dest = raw;
            if dest.starts_with('<') && dest.ends_with('>') && dest.len() >= 2 {
                dest = &dest[1..dest.len() - 1];
            }
            dest = dest.trim();
            if dest.is_empty() {
                continue;
            }

            let dest_first = dest.split_whitespace().next().unwrap_or("");
            if dest_first.is_empty() {
                continue;
            }

            let dest_first = dest_first.trim_matches('"').trim_matches('\'');

            let dest_first = dest_first
                .split('#')
                .next()
                .unwrap_or(dest_first)
                .split('?')
                .next()
                .unwrap_or(dest_first)
                .trim();

            if dest_first.is_empty() {
                continue;
            }

            let lower = dest_first.to_ascii_lowercase();
            if lower.starts_with("http://")
                || lower.starts_with("https://")
                || lower.starts_with("data:")
                || lower.starts_with("mailto:")
                || lower.starts_with('#')
            {
                continue;
            }

            let candidate = if Path::new(dest_first).is_absolute() {
                PathBuf::from(dest_first)
            } else {
                src_dir.join(dest_first)
            };

            let abs = match std::fs::canonicalize(&candidate) {
                Ok(p) => p,
                Err(_) => continue,
            };

            if !abs.starts_with(&src_dir_canon) {
                continue;
            }

            let rel = match abs.strip_prefix(&src_dir_canon) {
                Ok(r) => r,
                Err(_) => continue,
            };

            let dest_abs_path = dest_root.join(rel);
            if let Some(parent) = dest_abs_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }

            let _ = std::fs::copy(&abs, &dest_abs_path);
        } else {
            break;
        }
    }

    Ok(dest_md_path.to_string_lossy().to_string())
}

struct AppState {
    db: Arc<Database>,
    app_data_dir: PathBuf,
    log_dir: PathBuf,
    documents_dir: RwLock<PathBuf>,
    dictionaries_dir: RwLock<PathBuf>,
    dictionary: DictionaryManager,
    cedict: CedictManager,
    llm_dir: PathBuf,           // fixed: app_data_dir/llm — runtime only
    models_dir: RwLock<PathBuf>, // user-configurable: model storage
    builtin_llm: BuiltinLlmManager,
    download_cancel: std::sync::atomic::AtomicBool,
    log_lock: Mutex<()>,
}

#[tauri::command]
async fn ai_translate(text: String, mode: String) -> Result<String, String> {
    let client = OllamaClient::new();
    
    let prompt = match mode.as_str() {
        "literal" => format!(
            "请将以下英文文本直译为中文，保持原文的句式结构，尽量逐字逐句翻译：\n\n{}\n\n直译结果：",
            text
        ),
        "free" => format!(
            "请将以下英文文本意译为中文，保持原文的核心含义，用自然流畅的中文表达：\n\n{}\n\n意译结果：",
            text
        ),
        "plain" => format!(
            "请用简单易懂的白话解释以下英文文本的含义，就像给一个不懂专业术语的人解释一样：\n\n{}\n\n白话解释：",
            text
        ),
        _ => format!(
            "请将以下英文文本翻译为中文：\n\n{}\n\n翻译结果：",
            text
        ),
    };

    client.generate(&prompt).await
}

#[tauri::command]
async fn ai_summarize(text: String) -> Result<String, String> {
    let client = OllamaClient::new();
    
    let prompt = format!(
        "请用中文总结以下英文文本的主要内容，用1-3句话概括核心观点：\n\n{}\n\n总结：",
        text
    );

    client.generate(&prompt).await
}

#[tauri::command]
async fn ai_explain(text: String) -> Result<String, String> {
    let client = OllamaClient::new();
    
    let prompt = format!(
        "请详细解释以下英文文本：\n\n{}\n\n请提供：\n1. 句子结构分析（如果是复杂长句）\n2. 关键词汇解释\n3. 整体含义解读\n\n解释：",
        text
    );

    client.generate(&prompt).await
}

#[tauri::command]
fn save_note(state: State<AppState>, note: NoteData) -> Result<(), String> {
    state.db.save_note(&note).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_notes(state: State<AppState>, document_id: Option<String>) -> Result<Vec<NoteData>, String> {
    match document_id {
        Some(id) => state.db.get_notes_by_document(&id).map_err(|e| e.to_string()),
        None => state.db.get_all_notes().map_err(|e| e.to_string()),
    }
}

#[tauri::command]
fn delete_note(state: State<AppState>, note_id: String) -> Result<(), String> {
    state.db.delete_note(&note_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn confirm_note(state: State<AppState>, note_id: String, confirmed: bool) -> Result<(), String> {
    state.db.update_note_confirmed(&note_id, confirmed).map_err(|e| e.to_string())
}

#[tauri::command]
fn reassign_notes_document(
    state: State<AppState>,
    old_document_id: String,
    new_document_id: String,
) -> Result<usize, String> {
    state
        .db
        .reassign_notes_document(&old_document_id, &new_document_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn append_log(state: State<AppState>, level: String, message: String) -> Result<(), String> {
    let _guard = state.log_lock.lock().map_err(|_| "log lock poisoned".to_string())?;

    std::fs::create_dir_all(&state.log_dir).map_err(|e| e.to_string())?;
    let file_name = format!("{}.log", chrono::Utc::now().format("%Y-%m-%d"));
    let log_path = state.log_dir.join(file_name);

    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| e.to_string())?;

    let ts = chrono::Utc::now().to_rfc3339();
    writeln!(file, "[{}] [{}] {}", ts, level.to_uppercase(), message).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn open_devtools(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(debug_assertions)]
    {
        let w = app
            .get_webview_window("main")
            .ok_or_else(|| "main window not found".to_string())?;
        w.open_devtools();
        Ok(())
    }

    #[cfg(not(debug_assertions))]
    {
        let _ = app;
        Err("devtools disabled".to_string())
    }
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("Only http/https URLs are allowed".to_string());
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn get_app_version(app: AppHandle) -> Result<String, String> {
    Ok(app.config().version.clone().unwrap_or_else(|| env!("CARGO_PKG_VERSION").to_string()))
}

#[tauri::command]
fn get_app_data_dir(state: State<AppState>) -> Result<String, String> {
    Ok(state.app_data_dir.to_string_lossy().to_string())
}

#[tauri::command]
fn get_documents_dir(state: State<AppState>) -> Result<String, String> {
    Ok(state.documents_dir.read().unwrap().to_string_lossy().to_string())
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppConfigInput {
    documents_dir: Option<String>,
    models_dir: Option<String>,
    dictionaries_dir: Option<String>,
    /// If true, migrate model files from old models_dir to new one
    migrate_models: Option<bool>,
}

#[tauri::command]
fn get_app_config(state: State<AppState>) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "documentsDir": state.documents_dir.read().unwrap().to_string_lossy(),
        "modelsDir": state.models_dir.read().unwrap().to_string_lossy(),
        "dictionariesDir": state.dictionaries_dir.read().unwrap().to_string_lossy(),
    }))
}

#[tauri::command]
fn save_app_config(state: State<AppState>, config: AppConfigInput) -> Result<(), String> {
    let config_path = state.app_data_dir.join("config.json");

    // Read existing config or start fresh
    let mut json: serde_json::Value = std::fs::read_to_string(&config_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(serde_json::Value::Object(serde_json::Map::new()));

    let obj = json.as_object_mut().ok_or("config is not an object")?;

    // Update documents_dir
    if let Some(ref d) = config.documents_dir {
        let p = PathBuf::from(d);
        std::fs::create_dir_all(&p).map_err(|e| e.to_string())?;
        obj.insert("documentsDir".to_string(), serde_json::Value::String(d.clone()));
        *state.documents_dir.write().unwrap() = p;
    }

    // Update models_dir
    if let Some(ref d) = config.models_dir {
        let new_dir = PathBuf::from(d);
        std::fs::create_dir_all(&new_dir).map_err(|e| e.to_string())?;

        // Stop LLM if running since model dir changed
        state.builtin_llm.stop();

        // Migrate model files if requested
        if config.migrate_models.unwrap_or(false) {
            let old_dir = state.models_dir.read().unwrap().clone();
            if old_dir != new_dir && old_dir.exists() {
                if let Ok(entries) = std::fs::read_dir(&old_dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.extension().and_then(|e| e.to_str()) == Some("gguf") {
                            let dest = new_dir.join(path.file_name().unwrap());
                            if !dest.exists() {
                                let _ = std::fs::rename(&path, &dest)
                                    .or_else(|_| std::fs::copy(&path, &dest).map(|_| ()));
                            }
                        }
                    }
                }
            }
        }

        obj.insert("modelsDir".to_string(), serde_json::Value::String(d.clone()));
        // Remove legacy llmDir key if present
        obj.remove("llmDir");
        *state.models_dir.write().unwrap() = new_dir;
    }

    // Update dictionaries_dir
    if let Some(ref d) = config.dictionaries_dir {
        let p = PathBuf::from(d);
        std::fs::create_dir_all(&p).map_err(|e| e.to_string())?;
        obj.insert("dictionariesDir".to_string(), serde_json::Value::String(d.clone()));
        state.dictionary.reset();
        state.cedict.reset();
        *state.dictionaries_dir.write().unwrap() = p;
    }

    // Write config.json
    let content = serde_json::to_string_pretty(&json).map_err(|e| e.to_string())?;
    std::fs::write(&config_path, content).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn open_in_file_manager(path: String) -> Result<(), String> {
    let p = PathBuf::from(path);
    if !p.exists() {
        return Err("path not found".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&p)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&p)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&p)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("unsupported platform".to_string())
}

#[tauri::command]
fn reset_app_data(state: State<AppState>) -> Result<(), String> {
    state.builtin_llm.stop();
    state.dictionary.reset();
    state.cedict.reset();

    state.db.clear_all().map_err(|e| e.to_string())?;

    let dirs = [
        state.log_dir.clone(),
        state.documents_dir.read().unwrap().clone(),
        state.dictionaries_dir.read().unwrap().clone(),
        state.llm_dir.clone(),
        state.models_dir.read().unwrap().clone(),
    ];

    for d in dirs {
        if d.exists() {
            let _ = std::fs::remove_dir_all(&d);
        }
        let _ = std::fs::create_dir_all(&d);
    }

    // Delete config.json to reset directory paths
    let config_path = state.app_data_dir.join("config.json");
    let _ = std::fs::remove_file(&config_path);

    Ok(())
}

#[tauri::command]
fn import_document_copy(
    state: State<AppState>,
    source_path: String,
    dest_dir: Option<String>,
) -> Result<String, String> {
    let base = if let Some(d) = dest_dir {
        let p = PathBuf::from(d);
        std::fs::create_dir_all(&p).map_err(|e| e.to_string())?;
        p
    } else {
        state.documents_dir.read().unwrap().clone()
    };
    import_document_copy_impl(&base, &source_path)
}

#[tauri::command]
fn import_markdown_copy(
    state: State<AppState>,
    source_path: String,
    dest_dir: Option<String>,
) -> Result<String, String> {
    let base = if let Some(d) = dest_dir {
        let p = PathBuf::from(d);
        std::fs::create_dir_all(&p).map_err(|e| e.to_string())?;
        p
    } else {
        state.documents_dir.read().unwrap().clone()
    };
    import_markdown_copy_impl(&base, &source_path)
}

#[tauri::command]
fn import_folder_copies(
    state: State<AppState>,
    folder_path: String,
    dest_dir: Option<String>,
) -> Result<Vec<String>, String> {
    let root = std::fs::canonicalize(PathBuf::from(&folder_path)).map_err(|e| e.to_string())?;
    if !root.is_dir() {
        return Err("not a directory".to_string());
    }

    let base = if let Some(d) = dest_dir {
        let p = PathBuf::from(d);
        std::fs::create_dir_all(&p).map_err(|e| e.to_string())?;
        p
    } else {
        state.documents_dir.read().unwrap().clone()
    };

    let mut out: Vec<String> = vec![];
    for entry in walkdir::WalkDir::new(&root).into_iter() {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        if !entry.file_type().is_file() {
            continue;
        }

        let p = entry.path();
        let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("").to_ascii_lowercase();
        let supported = matches!(ext.as_str(), "pdf" | "epub" | "txt" | "md");
        if !supported {
            continue;
        }

        let src = p.to_string_lossy().to_string();
        let result = if ext == "md" {
            import_markdown_copy_impl(&base, &src)
        } else {
            import_document_copy_impl(&base, &src)
        };
        match result {
            Ok(imported) => out.push(imported),
            Err(e) => log::warn!("[import_folder] failed to import {}: {}", src, e),
        }
    }

    Ok(out)
}

#[tauri::command]
fn scan_folder_documents(folder_path: String) -> Result<Vec<String>, String> {
    let root = std::fs::canonicalize(PathBuf::from(&folder_path)).map_err(|e| e.to_string())?;
    if !root.is_dir() {
        return Err("not a directory".to_string());
    }
    let mut out: Vec<String> = vec![];
    for entry in walkdir::WalkDir::new(&root).into_iter() {
        let entry = match entry { Ok(e) => e, Err(_) => continue };
        if !entry.file_type().is_file() { continue; }
        let ext = entry.path().extension().and_then(|s| s.to_str()).unwrap_or("").to_ascii_lowercase();
        if matches!(ext.as_str(), "pdf" | "epub" | "txt" | "md") {
            out.push(entry.path().to_string_lossy().to_string());
        }
    }
    Ok(out)
}

#[tauri::command]
fn delete_document_copy(
    state: State<AppState>,
    path: String,
    documents_dir: Option<String>,
) -> Result<(), String> {
    let mut roots: Vec<PathBuf> = vec![];
    let default_root = std::fs::canonicalize(&*state.documents_dir.read().unwrap()).map_err(|e| e.to_string())?;
    roots.push(default_root);

    if let Some(d) = documents_dir {
        let p = PathBuf::from(d);
        if p.exists() {
            if let Ok(c) = std::fs::canonicalize(&p) {
                if !roots.iter().any(|r| r == &c) {
                    roots.push(c);
                }
            }
        }
    }

    let target = match std::fs::canonicalize(PathBuf::from(&path)) {
        Ok(t) => t,
        Err(_) => return Ok(()),
    };

    let mut matched_root: Option<PathBuf> = None;
    for r in &roots {
        if target.starts_with(r) {
            matched_root = Some(r.clone());
            break;
        }
    }
    let matched_root = matched_root.ok_or_else(|| "not a managed document copy".to_string())?;

    let rel = target
        .strip_prefix(&matched_root)
        .map_err(|_| "not a managed document copy".to_string())?;

    let mut comps = rel.components();
    let first = comps
        .next()
        .ok_or_else(|| "invalid path".to_string())?;

    let first_dir = match first {
        std::path::Component::Normal(c) => matched_root.join(c),
        _ => return Err("invalid path".to_string()),
    };

    if comps.next().is_some() {
        std::fs::remove_dir_all(&first_dir).map_err(|e| e.to_string())?;
        return Ok(());
    }

    if target.is_dir() {
        std::fs::remove_dir_all(&target).map_err(|e| e.to_string())?;
    } else {
        std::fs::remove_file(&target).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn migrate_documents(from_dir: String, to_dir: String) -> Result<u32, String> {
    let src = PathBuf::from(&from_dir);
    let dst = PathBuf::from(&to_dir);
    if !src.is_dir() {
        return Err("source directory does not exist".to_string());
    }
    std::fs::create_dir_all(&dst).map_err(|e| e.to_string())?;

    let doc_extensions: std::collections::HashSet<&str> = [
        "pdf", "epub", "txt", "md", "markdown",
    ].iter().copied().collect();

    fn dir_has_document(dir: &Path, exts: &std::collections::HashSet<&str>) -> bool {
        for entry in walkdir::WalkDir::new(dir).into_iter().filter_map(|e| e.ok()) {
            if entry.file_type().is_file() {
                let ok = entry.path().extension()
                    .and_then(|e| e.to_str())
                    .map(|e| exts.contains(e.to_lowercase().as_str()))
                    .unwrap_or(false);
                if ok { return true; }
            }
        }
        false
    }

    let mut count: u32 = 0;
    let entries: Vec<_> = std::fs::read_dir(&src)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .collect();

    for entry in &entries {
        let path = entry.path();
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        if name.starts_with('.') { continue; }

        let target = dst.join(&name);
        if target.exists() { continue; }

        if path.is_dir() {
            if !dir_has_document(&path, &doc_extensions) { continue; }
            // Always deep-copy (never move) so source is preserved
            let mut copied = false;
            for sub in walkdir::WalkDir::new(&path).into_iter().filter_map(|e| e.ok()) {
                let rel = match sub.path().strip_prefix(&path) {
                    Ok(r) => r, Err(_) => continue,
                };
                let sub_target = target.join(rel);
                if sub.file_type().is_dir() {
                    let _ = std::fs::create_dir_all(&sub_target);
                } else if sub.file_type().is_file() {
                    if let Some(p) = sub_target.parent() { let _ = std::fs::create_dir_all(p); }
                    if std::fs::copy(sub.path(), &sub_target).is_ok() { copied = true; }
                }
            }
            if copied { count += 1; }
        } else if path.is_file() {
            let is_doc = path.extension()
                .and_then(|e| e.to_str())
                .map(|e| doc_extensions.contains(e.to_lowercase().as_str()))
                .unwrap_or(false);
            if !is_doc { continue; }
            if std::fs::copy(&path, &target).is_ok() { count += 1; }
        }
    }

    Ok(count)
}

#[tauri::command]
fn import_samples(
    app: AppHandle,
    state: State<AppState>,
    dest_dir: Option<String>,
) -> Result<Vec<String>, String> {
    let base = if let Some(d) = &dest_dir {
        let p = PathBuf::from(d);
        std::fs::create_dir_all(&p).map_err(|e| e.to_string())?;
        p
    } else {
        state.documents_dir.read().unwrap().clone()
    };

    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    let samples_dir = resource_dir.join("resources").join("samples");
    if !samples_dir.exists() {
        return Ok(vec![]);
    }

    let mut out: Vec<String> = vec![];
    for entry in walkdir::WalkDir::new(&samples_dir).max_depth(1).into_iter() {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        if !entry.file_type().is_file() {
            continue;
        }
        let p = entry.path();
        let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("").to_ascii_lowercase();
        if !matches!(ext.as_str(), "pdf" | "epub" | "txt") {
            continue;
        }
        let src = p.to_string_lossy().to_string();
        match import_document_copy_impl(&base, &src) {
            Ok(path) => out.push(path),
            Err(e) => log::warn!("[samples] failed to import {}: {}", src, e),
        }
    }

    // Handle markdown sample (it's in a subdirectory)
    let md_demo = samples_dir.join("markdown-demo").join("Markdown.md");
    if md_demo.exists() {
        let src = md_demo.to_string_lossy().to_string();
        match import_markdown_copy_impl(&base, &src) {
            Ok(path) => out.push(path),
            Err(e) => log::warn!("[samples] failed to import markdown: {}", e),
        }
    }

    Ok(out)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().expect("failed to get app data dir");
            let db = Database::new(app_data_dir.clone()).expect("failed to init database");
            let log_dir = app_data_dir.join("logs");

            // Read custom paths from config.json if present (for future installer support)
            let config_path = app_data_dir.join("config.json");
            let config: serde_json::Value = std::fs::read_to_string(&config_path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or(serde_json::Value::Null);
            let documents_dir = config.get("documentsDir")
                .and_then(|v| v.as_str())
                .map(PathBuf::from)
                .unwrap_or_else(|| app_data_dir.join("documents"));
            let dictionaries_dir = config.get("dictionariesDir")
                .and_then(|v| v.as_str())
                .map(PathBuf::from)
                .unwrap_or_else(|| app_data_dir.join("dictionaries"));
            // Runtime dir is always fixed at app_data_dir/llm (not user-configurable)
            let llm_dir = app_data_dir.join("llm");
            // Models dir is user-configurable; check modelsDir first, then legacy llmDir/models
            let models_dir = config.get("modelsDir")
                .and_then(|v| v.as_str())
                .map(PathBuf::from)
                .or_else(|| {
                    // Backward compat: old config had llmDir — models were in llmDir/models
                    config.get("llmDir")
                        .and_then(|v| v.as_str())
                        .map(|d| PathBuf::from(d).join("models"))
                })
                .unwrap_or_else(|| llm_dir.join("models"));
            std::fs::create_dir_all(&log_dir).ok();
            std::fs::create_dir_all(&documents_dir).ok();
            std::fs::create_dir_all(&dictionaries_dir).ok();
            std::fs::create_dir_all(&llm_dir).ok();
            // models_dir is created on demand (when downloading/listing models)
            // Auto-prepare dictionaries in background on first launch
            dictionary::auto_prepare_dictionaries(&app.handle(), &dictionaries_dir);
            // Auto-extract bundled CPU runtime on first launch
            {
                let handle = app.handle().clone();
                let llm_dir_clone = llm_dir.clone();
                std::thread::spawn(move || {
                    builtin_llm::auto_install_cpu_runtime(&handle, &llm_dir_clone);
                });
            }

            app.manage(AppState {
                db: Arc::new(db),
                app_data_dir,
                log_dir,
                documents_dir: RwLock::new(documents_dir),
                dictionaries_dir: RwLock::new(dictionaries_dir),
                dictionary: DictionaryManager::new(),
                cedict: CedictManager::new(),
                llm_dir,
                models_dir: RwLock::new(models_dir),
                builtin_llm: BuiltinLlmManager::new(),
                download_cancel: std::sync::atomic::AtomicBool::new(false),
                log_lock: Mutex::new(()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ai_translate,
            ai_summarize,
            ai_explain,
            save_note,
            get_notes,
            delete_note,
            confirm_note,
            reassign_notes_document,
            append_log,
            open_devtools,
            open_external_url,
            get_app_version,
            get_app_data_dir,
            get_documents_dir,
            get_app_config,
            save_app_config,
            open_in_file_manager,
            import_document_copy,
            import_markdown_copy,
            import_folder_copies,
            scan_folder_documents,
            delete_document_copy,
            cedict_status,
            cedict_install,
            cedict_lookup,
            dictionary_status,
            dictionary_install_ecdict,
            dictionary_lookup,
            builtin_llm_status,
            builtin_llm_install,
            builtin_llm_ensure_running,
            builtin_llm_stop,
            builtin_llm_delete_model,
            builtin_llm_install_runtime,
            builtin_llm_cancel_download,
            builtin_llm_is_bundled_only,
            builtin_llm_runtime_status,
            builtin_llm_delete_runtime,
            builtin_llm_import_runtime,
            builtin_llm_import_model,
            builtin_llm_list_models,
            builtin_llm_probe_system,
            builtin_llm_recommend,
            builtin_llm_auto_start,
            builtin_llm_benchmark,
            epub_extract,
            import_samples,
            migrate_documents,
            reset_app_data,
            ollama_proxy::ollama_test_connection,
            ollama_proxy::ollama_list_models,
            ollama_proxy::ollama_stream_chat,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.try_state::<AppState>() {
                    state.builtin_llm.stop();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
