use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::collections::HashSet;
use std::fs::File;
use std::hash::{Hash, Hasher};
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use tauri::State;
use zip::ZipArchive;

use crate::AppState;

#[derive(Debug, Serialize, Deserialize)]
struct EpubExtractMeta {
    source_path: String,
    source_size: u64,
    source_modified_ms: u128,
    opf_rel: String,
}

fn clean_rel_path(raw: &str) -> Option<PathBuf> {
    let raw = raw.replace('\\', "/");
    let p = Path::new(&raw);
    let mut out = PathBuf::new();
    for c in p.components() {
        match c {
            std::path::Component::Normal(s) => out.push(s),
            std::path::Component::CurDir => {}
            _ => return None,
        }
    }
    if out.as_os_str().is_empty() {
        None
    } else {
        Some(out)
    }
}

fn parse_container_for_opf(xml: &str) -> Option<String> {
    let mut i = 0usize;
    while let Some(pos) = xml[i..].find("full-path") {
        let start = i + pos;
        let rest = &xml[start..];
        if let Some(eq) = rest.find('=') {
            let after = &rest[eq + 1..].trim_start();
            if after.starts_with('"') {
                if let Some(end) = after[1..].find('"') {
                    let v = &after[1..1 + end];
                    if !v.trim().is_empty() {
                        return Some(v.trim().to_string());
                    }
                }
            } else if after.starts_with('\'') {
                if let Some(end) = after[1..].find('\'') {
                    let v = &after[1..1 + end];
                    if !v.trim().is_empty() {
                        return Some(v.trim().to_string());
                    }
                }
            }
        }
        i = start + 9;
        if i >= xml.len() {
            break;
        }
    }
    None
}

fn hash_key(path: &str, size: u64, modified_ms: u128) -> String {
    let mut h = DefaultHasher::new();
    path.hash(&mut h);
    size.hash(&mut h);
    modified_ms.hash(&mut h);
    format!("{:016x}", h.finish())
}

/// 内部同步解压逻辑
fn epub_extract_sync(documents_dir: PathBuf, path: String) -> Result<String, String> {
    let src = PathBuf::from(&path);
    let canon = std::fs::canonicalize(&src).map_err(|e| e.to_string())?;
    let meta = std::fs::metadata(&canon).map_err(|e| e.to_string())?;
    let modified_ms = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis())
        .unwrap_or(0);

    let key = hash_key(&canon.to_string_lossy(), meta.len(), modified_ms);
    let base_dir = documents_dir.join("epub_extracted");
    let _ = std::fs::create_dir_all(&base_dir);
    let target_dir = base_dir.join(&key);
    let meta_path = target_dir.join("_meta.json");

    // 快速路径：如果已经解压过且元数据匹配，直接返回
    if meta_path.exists() {
        if let Ok(s) = std::fs::read_to_string(&meta_path) {
            if let Ok(m) = serde_json::from_str::<EpubExtractMeta>(&s) {
                if m.source_path == canon.to_string_lossy()
                    && m.source_size == meta.len()
                    && m.source_modified_ms == modified_ms
                {
                    let opf_abs = target_dir.join(&m.opf_rel);
                    if opf_abs.exists() {
                        return Ok(opf_abs.to_string_lossy().to_string());
                    }
                }
            }
        }
    }

    if target_dir.exists() {
        let _ = std::fs::remove_dir_all(&target_dir);
    }
    std::fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;

    let file = File::open(&canon).map_err(|e| e.to_string())?;
    let reader = BufReader::new(file);
    let mut zip = ZipArchive::new(reader).map_err(|e| e.to_string())?;

    let container_xml = {
        let mut f = zip
            .by_name("META-INF/container.xml")
            .map_err(|_| "container.xml missing (META-INF/container.xml)".to_string())?;
        let mut s = String::new();
        f.read_to_string(&mut s).map_err(|e| e.to_string())?;
        s
    };

    let opf_rel = parse_container_for_opf(&container_xml)
        .ok_or_else(|| "container.xml invalid (OPF not found)".to_string())?;

    let mut created_dirs: HashSet<PathBuf> = HashSet::new();
    created_dirs.insert(target_dir.clone());

    // 使用更大的缓冲区提高IO效率
    let mut buf = vec![0u8; 512 * 1024];

    for i in 0..zip.len() {
        let mut f = zip.by_index(i).map_err(|e| e.to_string())?;
        let name = f.name().to_string();

        let rel = match clean_rel_path(&name) {
            Some(p) => p,
            None => continue,
        };
        let out_path = target_dir.join(rel);

        if f.is_dir() {
            let _ = std::fs::create_dir_all(&out_path);
            continue;
        }

        if let Some(parent) = out_path.parent() {
            if created_dirs.insert(parent.to_path_buf()) {
                let _ = std::fs::create_dir_all(parent);
            }
        }

        let out = File::create(&out_path).map_err(|e| e.to_string())?;
        let mut out = BufWriter::with_capacity(512 * 1024, out);
        loop {
            let n = f.read(&mut buf).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            out.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        }
        out.flush().map_err(|e| e.to_string())?;
    }

    let opf_rel_clean = clean_rel_path(&opf_rel).ok_or_else(|| "invalid OPF path".to_string())?;
    let opf_abs = target_dir.join(&opf_rel_clean);
    if !opf_abs.exists() {
        let _ = std::fs::remove_dir_all(&target_dir);
        return Err("OPF extracted but not found".to_string());
    }

    let m = EpubExtractMeta {
        source_path: canon.to_string_lossy().to_string(),
        source_size: meta.len(),
        source_modified_ms: modified_ms,
        opf_rel: opf_rel_clean.to_string_lossy().to_string(),
    };
    let json = serde_json::to_string(&m).map_err(|e| e.to_string())?;
    let mut mf = File::create(&meta_path).map_err(|e| e.to_string())?;
    mf.write_all(json.as_bytes()).map_err(|e| e.to_string())?;

    Ok(opf_abs.to_string_lossy().to_string())
}

/// 异步EPUB解压命令 - 在后台线程执行，不阻塞主线程
#[tauri::command]
pub async fn epub_extract(state: State<'_, AppState>, path: String) -> Result<String, String> {
    let documents_dir = state.documents_dir.read().unwrap().clone();
    
    // 在后台线程执行IO密集型操作
    tokio::task::spawn_blocking(move || {
        epub_extract_sync(documents_dir, path)
    })
    .await
    .map_err(|e| format!("spawn_blocking failed: {}", e))?
}
