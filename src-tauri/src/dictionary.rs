use serde::Serialize;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use stardict::StarDict;
use rusqlite::{Connection, OptionalExtension, OpenFlags};
use zip::ZipArchive;

use crate::AppState;

#[derive(Debug, Serialize)]
pub struct DictionaryStatus {
    pub installed: bool,
    pub ifo_path: Option<String>,
}

pub struct CedictManager {
    db_path: Mutex<Option<PathBuf>>,
    db: Mutex<Option<Connection>>,
}

impl CedictManager {
    pub fn new() -> Self {
        Self {
            db_path: Mutex::new(None),
            db: Mutex::new(None),
        }
    }

    pub fn reset(&self) {
        *self.db_path.lock().unwrap() = None;
        *self.db.lock().unwrap() = None;
    }

    fn set_db_path(&self, path: PathBuf) {
        *self.db_path.lock().unwrap() = Some(path);
        *self.db.lock().unwrap() = None;
    }

    fn get_db_path(&self) -> Option<PathBuf> {
        self.db_path.lock().unwrap().clone()
    }

    fn load_db_if_needed(&self, db_path: &Path) -> Result<(), String> {
        let mut guard = self.db.lock().unwrap();
        if guard.is_some() {
            return Ok(());
        }
        let conn = Connection::open_with_flags(db_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|e| e.to_string())?;
        *guard = Some(conn);
        Ok(())
    }

    fn lookup(&self, word: &str) -> Result<Option<DictionaryResult>, String> {
        let db_path = self
            .get_db_path()
            .ok_or_else(|| "cedict not installed".to_string())?;
        self.load_db_if_needed(&db_path)?;

        let mut guard = self.db.lock().unwrap();
        let conn = guard.as_mut().ok_or_else(|| "cedict db not loaded".to_string())?;

        let mut stmt = conn
            .prepare_cached(
                "SELECT simplified, traditional, pinyin, defs FROM entries WHERE simplified = ?1 OR traditional = ?1 LIMIT 20",
            )
            .map_err(|e| e.to_string())?;

        let mut rows = stmt.query([word]).map_err(|e| e.to_string())?;

        let mut pinyin: Option<String> = None;
        let mut defs: Vec<String> = vec![];

        while let Some(r) = rows.next().map_err(|e| e.to_string())? {
            let row_pinyin: Option<String> = r.get(2).ok();
            if pinyin.is_none() {
                if let Some(p) = row_pinyin {
                    let p = p.trim().to_string();
                    if !p.is_empty() {
                        pinyin = Some(p);
                    }
                }
            }

            let defs_raw: String = r.get(3).unwrap_or_default();
            for d in defs_raw
                .split('\n')
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
            {
                if !defs.contains(&d.to_string()) {
                    defs.push(d.to_string());
                }
            }
        }

        if defs.is_empty() {
            return Ok(None);
        }

        let translation = defs.get(0).cloned();
        let rest = if defs.len() > 1 { defs[1..].to_vec() } else { vec![] };

        let meanings = if rest.is_empty() {
            vec![]
        } else {
            vec![DictionaryMeaning {
                part_of_speech: "".to_string(),
                definitions: rest,
                examples: vec![],
            }]
        };

        Ok(Some(DictionaryResult {
            word: word.to_string(),
            phonetic: pinyin,
            audio_url: None,
            translation,
            meanings,
        }))
    }
}

#[derive(Debug, Serialize)]
pub struct DictionaryMeaning {
    #[serde(rename = "partOfSpeech")]
    pub part_of_speech: String,
    pub definitions: Vec<String>,
    pub examples: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct DictionaryResult {
    pub word: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phonetic: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "audioUrl")]
    pub audio_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub translation: Option<String>,
    pub meanings: Vec<DictionaryMeaning>,
}

pub struct DictionaryManager {
    dict: Mutex<Option<stardict::StarDictStd>>,
    ifo_path: Mutex<Option<PathBuf>>,
    db_path: Mutex<Option<PathBuf>>,
    db: Mutex<Option<Connection>>,
}

impl DictionaryManager {
    pub fn new() -> Self {
        Self {
            dict: Mutex::new(None),
            ifo_path: Mutex::new(None),
            db_path: Mutex::new(None),
            db: Mutex::new(None),
        }
    }

    pub fn reset(&self) {
        *self.dict.lock().unwrap() = None;
        *self.ifo_path.lock().unwrap() = None;
        *self.db_path.lock().unwrap() = None;
        *self.db.lock().unwrap() = None;
    }

    fn set_ifo_path(&self, path: PathBuf) {
        *self.ifo_path.lock().unwrap() = Some(path);
        *self.dict.lock().unwrap() = None;
        *self.db_path.lock().unwrap() = None;
        *self.db.lock().unwrap() = None;
    }

    fn set_db_path(&self, path: PathBuf) {
        *self.db_path.lock().unwrap() = Some(path);
        *self.db.lock().unwrap() = None;
        *self.ifo_path.lock().unwrap() = None;
        *self.dict.lock().unwrap() = None;
    }

    fn get_ifo_path(&self) -> Option<PathBuf> {
        self.ifo_path.lock().unwrap().clone()
    }

    fn get_db_path(&self) -> Option<PathBuf> {
        self.db_path.lock().unwrap().clone()
    }

    fn load_if_needed(&self, ifo_path: &Path) -> Result<(), String> {
        let mut guard = self.dict.lock().unwrap();
        if guard.is_some() {
            return Ok(());
        }
        let dict = stardict::no_cache(ifo_path).map_err(|e| format!("stardict load failed: {e:?}"))?;
        *guard = Some(dict);
        Ok(())
    }

    fn lookup(&self, word: &str) -> Result<Option<Vec<stardict::WordDefinition>>, String> {
        let ifo = self
            .get_ifo_path()
            .ok_or_else(|| "dictionary not installed".to_string())?;
        self.load_if_needed(&ifo)?;

        let mut guard = self.dict.lock().unwrap();
        let dict = guard.as_mut().ok_or_else(|| "dictionary not loaded".to_string())?;
        dict.lookup(word)
            .map_err(|e| format!("stardict lookup failed: {e:?}"))
    }

    fn load_db_if_needed(&self, db_path: &Path) -> Result<(), String> {
        let mut guard = self.db.lock().unwrap();
        if guard.is_some() {
            return Ok(());
        }
        let conn = Connection::open_with_flags(db_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|e| e.to_string())?;
        *guard = Some(conn);
        Ok(())
    }

    fn lookup_db(&self, word: &str) -> Result<Option<DictionaryResult>, String> {
        let db_path = self
            .get_db_path()
            .ok_or_else(|| "dictionary not installed".to_string())?;
        self.load_db_if_needed(&db_path)?;

        let mut guard = self.db.lock().unwrap();
        let conn = guard.as_mut().ok_or_else(|| "dictionary db not loaded".to_string())?;
        let mut row: Option<(String, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>)>;

        let try_entries = || -> Result<Option<(String, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>)>, rusqlite::Error> {
            let mut stmt = conn.prepare_cached(
                "SELECT word, phonetic, definition, translation, pos, audio FROM entries WHERE word = ?1 LIMIT 1",
            )?;
            stmt.query_row([word], |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                ))
            })
            .optional()
        };

        row = match try_entries() {
            Ok(r) => r,
            Err(_) => None,
        };

        if row.is_none() {
            let mut stmt = conn
                .prepare_cached(
                    "SELECT word, phonetic, definition, translation, pos, audio FROM stardict WHERE word = ?1 COLLATE NOCASE LIMIT 1",
                )
                .map_err(|e| e.to_string())?;
            row = stmt
                .query_row([word], |r| {
                    Ok((
                        r.get(0)?,
                        r.get(1)?,
                        r.get(2)?,
                        r.get(3)?,
                        r.get(4)?,
                        r.get(5)?,
                    ))
                })
                .optional()
                .map_err(|e| e.to_string())?;
        }

        let Some((w, phonetic, definition, translation, pos, audio)) = row else {
            return Ok(None);
        };

        let t = clean_definition_text(&translation.unwrap_or_default());
        let d = clean_definition_text(&definition.unwrap_or_default());

        let mut lines: Vec<String> = vec![];
        for s in t.split('\n').map(|x| x.trim()).filter(|x| !x.is_empty()) {
            lines.push(s.to_string());
        }
        if lines.is_empty() {
            for s in d.split('\n').map(|x| x.trim()).filter(|x| !x.is_empty()) {
                lines.push(s.to_string());
            }
        }

        let translation_first = lines.get(0).cloned();
        let rest = if lines.len() > 1 {
            lines[1..].to_vec()
        } else {
            vec![]
        };

        let meanings = if rest.is_empty() {
            vec![]
        } else {
            vec![DictionaryMeaning {
                part_of_speech: pos.unwrap_or_default(),
                definitions: rest,
                examples: vec![],
            }]
        };

        Ok(Some(DictionaryResult {
            word: w,
            phonetic,
            audio_url: audio,
            translation: translation_first,
            meanings,
        }))
    }
}

fn ecdict_root(dictionaries_dir: &Path) -> PathBuf {
    dictionaries_dir.join("ecdict")
}

fn ecdict_db_path(root: &Path) -> PathBuf {
    root.join("ecdict.sqlite")
}

fn cedict_root(dictionaries_dir: &Path) -> PathBuf {
    dictionaries_dir.join("cedict")
}

fn cedict_db_path(root: &Path) -> PathBuf {
    root.join("cedict.sqlite")
}

fn find_first_u8(root: &Path) -> Option<PathBuf> {
    for entry in walkdir::WalkDir::new(root).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        if let Some(name) = path.file_name().and_then(|s| s.to_str()) {
            let lower = name.to_ascii_lowercase();
            if lower.contains("cedict") && lower.ends_with(".u8") {
                return Some(path.to_path_buf());
            }
        }
    }
    None
}

fn extract_zip_to(zip_path: &Path, dest: &Path) -> Result<(), String> {
    let f = std::fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(f).map_err(|e| e.to_string())?;
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let outpath = match file.enclosed_name() {
            Some(p) => dest.join(p),
            None => continue,
        };

        if file.is_dir() {
            std::fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
            continue;
        }

        if let Some(parent) = outpath.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut outfile = std::fs::File::create(&outpath).map_err(|e| e.to_string())?;
        std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn build_cedict_sqlite_from_u8(u8_path: &Path, db_path: &Path) -> Result<(), String> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if db_path.exists() {
        return Ok(());
    }

    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "PRAGMA journal_mode=OFF;\nPRAGMA synchronous=OFF;\nPRAGMA temp_store=MEMORY;\n",
    )
    .map_err(|e| e.to_string())?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS entries (\
            simplified TEXT NOT NULL,\
            traditional TEXT NOT NULL,\
            pinyin TEXT,\
            defs TEXT NOT NULL\
        );\
        CREATE INDEX IF NOT EXISTS idx_entries_simplified ON entries(simplified);\
        CREATE INDEX IF NOT EXISTS idx_entries_traditional ON entries(traditional);",
    )
    .map_err(|e| e.to_string())?;

    let f = std::fs::File::open(u8_path).map_err(|e| e.to_string())?;
    let reader = BufReader::new(f);

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    {
        let mut stmt = tx
            .prepare("INSERT INTO entries(simplified, traditional, pinyin, defs) VALUES(?1, ?2, ?3, ?4)")
            .map_err(|e| e.to_string())?;

        for line in reader.lines() {
            let line = line.map_err(|e| e.to_string())?;
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }

            // Format: trad simp [pinyin] /def1/def2/
            let first_space = match line.find(' ') {
                Some(i) => i,
                None => continue,
            };
            let trad = line[..first_space].trim();
            let rest1 = line[first_space..].trim_start();

            let second_space = match rest1.find(' ') {
                Some(i) => i,
                None => continue,
            };
            let simp = rest1[..second_space].trim();
            let rest2 = rest1[second_space..].trim_start();

            let lb = match rest2.find('[') {
                Some(i) => i,
                None => continue,
            };
            let rb_rel = match rest2[lb..].find(']') {
                Some(i) => i,
                None => continue,
            };
            let rb = lb + rb_rel;

            let pinyin = rest2[lb + 1..rb].trim();
            let defs_part = rest2[rb + 1..].trim();
            let slash_pos = match defs_part.find('/') {
                Some(i) => i,
                None => continue,
            };
            let defs_raw = &defs_part[slash_pos..];
            let defs: Vec<String> = defs_raw
                .split('/')
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
                .collect();
            if defs.is_empty() {
                continue;
            }
            let defs_joined = defs.join("\n");

            stmt.execute(rusqlite::params![
                simp,
                trad,
                if pinyin.is_empty() { None } else { Some(pinyin) },
                defs_joined,
            ])
            .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;

    Ok(())
}

fn find_first_ifo(root: &Path) -> Option<PathBuf> {
    for entry in walkdir::WalkDir::new(root).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            if let Some(ext) = entry.path().extension().and_then(|s| s.to_str()) {
                if ext.eq_ignore_ascii_case("ifo") {
                    return Some(entry.path().to_path_buf());
                }
            }
        }
    }
    None
}

fn clean_definition_text(input: &str) -> String {
    // ECDICT StarDict often contains HTML. Make a best-effort cleanup.
    let input = input
        .replace("<br />", "\n")
        .replace("<br/>", "\n")
        .replace("<br>", "\n")
        .replace("\\n", "\n");

    let mut out = String::with_capacity(input.len());
    let mut in_tag = false;
    let mut chars = input.chars().peekable();
    while let Some(ch) = chars.next() {
        match ch {
            '<' => {
                in_tag = true;
            }
            '>' => {
                in_tag = false;
            }
            _ => {
                if !in_tag {
                    out.push(ch);
                }
            }
        }
    }

    out = out
        .replace("\r\n", "\n")
        .replace("\r", "\n")
        .replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&");

    // Collapse excessive blank lines
    let mut normalized = String::with_capacity(out.len());
    let mut last_was_nl = false;
    let mut nl_count = 0u8;
    for ch in out.chars() {
        if ch == '\n' {
            if last_was_nl {
                nl_count = nl_count.saturating_add(1);
                if nl_count >= 2 {
                    continue;
                }
            } else {
                last_was_nl = true;
                nl_count = 0;
            }
            normalized.push('\n');
        } else {
            last_was_nl = false;
            nl_count = 0;
            normalized.push(ch);
        }
    }

    normalized.trim().to_string()
}

fn find_first_sqlite(root: &Path) -> Option<PathBuf> {
    fn is_sqlite_header(path: &Path) -> bool {
        let mut buf = [0u8; 16];
        let mut f = match std::fs::File::open(path) {
            Ok(x) => x,
            Err(_) => return false,
        };
        use std::io::Read;
        if f.read_exact(&mut buf).is_err() {
            return false;
        }
        &buf == b"SQLite format 3\x00"
    }

    for entry in walkdir::WalkDir::new(root).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.path();
        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
        let ext_ok = ext.eq_ignore_ascii_case("sqlite")
            || ext.eq_ignore_ascii_case("sqlite3")
            || ext.eq_ignore_ascii_case("db");

        if ext_ok || is_sqlite_header(path) {
            return Some(path.to_path_buf());
        }
    }

    None
}

fn normalize_ecdict_sqlite(root: &Path) -> Result<Option<PathBuf>, String> {
    let target = ecdict_db_path(root);
    if target.exists() {
        return Ok(Some(target));
    }

    let found = match find_first_sqlite(root) {
        Some(p) => p,
        None => return Ok(None),
    };

    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if found != target {
        let _ = std::fs::copy(&found, &target);
    }
    Ok(Some(target))
}

#[tauri::command]
pub fn cedict_status(state: State<AppState>) -> Result<DictionaryStatus, String> {
    let root = cedict_root(&state.dictionaries_dir);
    let db_path = cedict_db_path(&root);
    if db_path.exists() {
        state.cedict.set_db_path(db_path.clone());
        return Ok(DictionaryStatus {
            installed: true,
            ifo_path: Some(db_path.to_string_lossy().to_string()),
        });
    }

    Ok(DictionaryStatus {
        installed: false,
        ifo_path: None,
    })
}

#[tauri::command]
pub async fn cedict_install(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<DictionaryStatus, String> {
    let root = cedict_root(&state.dictionaries_dir);
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;

    let db_path = cedict_db_path(&root);
    if db_path.exists() {
        state.cedict.set_db_path(db_path.clone());
        return Ok(DictionaryStatus {
            installed: true,
            ifo_path: Some(db_path.to_string_lossy().to_string()),
        });
    }

    let mut bundled: Option<PathBuf> = None;
    if let Ok(resource_dir) = app.path().resource_dir() {
        let candidates = [
            resource_dir.join("dictionaries").join("cedict").join("cedict.zip"),
            resource_dir
                .join("resources")
                .join("dictionaries")
                .join("cedict")
                .join("cedict.zip"),
            resource_dir.join("dictionaries").join("cedict").join("cedict.7z"),
            resource_dir
                .join("resources")
                .join("dictionaries")
                .join("cedict")
                .join("cedict.7z"),
            resource_dir.join("dictionaries").join("cedict").join("cedict_ts.u8"),
            resource_dir
                .join("resources")
                .join("dictionaries")
                .join("cedict")
                .join("cedict_ts.u8"),
        ];
        for c in candidates {
            if c.exists() {
                bundled = Some(c);
                break;
            }
        }
    }

    if let Some(p) = bundled {
        let name = p
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if name.ends_with(".7z") {
            sevenz_rust2::decompress_file(&p, &root).map_err(|e| format!("extract failed: {e:?}"))?;
        } else if name.ends_with(".zip") {
            extract_zip_to(&p, &root)?;
        } else if name.ends_with(".u8") {
            let target = root.join("cedict_ts.u8");
            let _ = std::fs::copy(&p, &target);
        }
    } else {
        let url = "https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.zip";
        let zip_path = root.join("cedict.zip");

        let resp = reqwest::get(url).await.map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err(format!("cedict download failed: {}", resp.status()));
        }
        let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
        let mut f = std::fs::File::create(&zip_path).map_err(|e| e.to_string())?;
        f.write_all(&bytes).map_err(|e| e.to_string())?;

        extract_zip_to(&zip_path, &root)?;
    }

    let u8_path = find_first_u8(&root).ok_or_else(|| "cedict source .u8 not found after install".to_string())?;
    let u8_path2 = u8_path.clone();
    let db_path2 = db_path.clone();
    tauri::async_runtime::spawn_blocking(move || build_cedict_sqlite_from_u8(&u8_path2, &db_path2))
        .await
        .map_err(|e| e.to_string())??;

    state.cedict.set_db_path(db_path.clone());
    Ok(DictionaryStatus {
        installed: true,
        ifo_path: Some(db_path.to_string_lossy().to_string()),
    })
}

#[tauri::command]
pub fn cedict_lookup(state: State<AppState>, word: String) -> Result<Option<DictionaryResult>, String> {
    let clean = word.trim();
    if clean.is_empty() {
        return Ok(None);
    }

    if state.cedict.get_db_path().is_none() {
        let root = cedict_root(&state.dictionaries_dir);
        let db_path = cedict_db_path(&root);
        if db_path.exists() {
            state.cedict.set_db_path(db_path);
        }
    }

    state.cedict.lookup(clean)
}

#[tauri::command]
pub fn dictionary_status(state: State<AppState>) -> Result<DictionaryStatus, String> {
    let root = ecdict_root(&state.dictionaries_dir);
    let ifo = find_first_ifo(&root);

    if let Some(ifo_path) = ifo {
        state.dictionary.set_ifo_path(ifo_path.clone());
        return Ok(DictionaryStatus {
            installed: true,
            ifo_path: Some(ifo_path.to_string_lossy().to_string()),
        });
    }

    let db_path = ecdict_db_path(&root);
    if db_path.exists() {
        state.dictionary.set_db_path(db_path.clone());
        return Ok(DictionaryStatus {
            installed: true,
            ifo_path: Some(db_path.to_string_lossy().to_string()),
        });
    }

    if let Ok(Some(db)) = normalize_ecdict_sqlite(&root) {
        state.dictionary.set_db_path(db.clone());
        return Ok(DictionaryStatus {
            installed: true,
            ifo_path: Some(db.to_string_lossy().to_string()),
        });
    }

    Ok(DictionaryStatus {
        installed: false,
        ifo_path: None,
    })
}

#[tauri::command]
pub async fn dictionary_install_ecdict(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<DictionaryStatus, String> {
    let root = ecdict_root(&state.dictionaries_dir);
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;

    // If already installed, return status
    if let Some(ifo) = find_first_ifo(&root) {
        state.dictionary.set_ifo_path(ifo.clone());
        return Ok(DictionaryStatus {
            installed: true,
            ifo_path: Some(ifo.to_string_lossy().to_string()),
        });
    }

    let db_path = ecdict_db_path(&root);
    if db_path.exists() {
        state.dictionary.set_db_path(db_path.clone());
        return Ok(DictionaryStatus {
            installed: true,
            ifo_path: Some(db_path.to_string_lossy().to_string()),
        });
    }

    let mut archive_found: Option<PathBuf> = None;
    if let Ok(resource_dir) = app.path().resource_dir() {
        let candidates = [
            resource_dir.join("dictionaries").join("ecdict").join("stardict.7z"),
            resource_dir
                .join("resources")
                .join("dictionaries")
                .join("ecdict")
                .join("stardict.7z"),
        ];
        for c in candidates {
            if c.exists() {
                archive_found = Some(c);
                break;
            }
        }
    }

    let archive = archive_found.ok_or_else(|| "bundled dictionary stardict.7z not found".to_string())?;
    sevenz_rust2::decompress_file(&archive, &root).map_err(|e| format!("extract failed: {e:?}"))?;

    if let Some(ifo) = find_first_ifo(&root) {
        state.dictionary.set_ifo_path(ifo.clone());
        return Ok(DictionaryStatus {
            installed: true,
            ifo_path: Some(ifo.to_string_lossy().to_string()),
        });
    }

    let csv_path = root.join("stardict.csv");
    if csv_path.exists() {
        let db_path2 = ecdict_db_path(&root);
        if !db_path2.exists() {
            let csv_path2 = csv_path.clone();
            let db_path3 = db_path2.clone();
            tauri::async_runtime::spawn_blocking(move || build_sqlite_from_csv(&csv_path2, &db_path3))
                .await
                .map_err(|e| e.to_string())??;
        }
        state.dictionary.set_db_path(db_path2.clone());
        return Ok(DictionaryStatus {
            installed: true,
            ifo_path: Some(db_path2.to_string_lossy().to_string()),
        });
    }

    let mut files: Vec<String> = vec![];
    for entry in walkdir::WalkDir::new(&root)
        .max_depth(4)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_file() {
            let rel = entry
                .path()
                .strip_prefix(&root)
                .unwrap_or(entry.path())
                .to_string_lossy()
                .to_string();
            files.push(rel);
            if files.len() >= 30 {
                break;
            }
        }
    }
    Err(format!(
        "install succeeded but neither .ifo nor stardict.csv found. root: {}. extracted files (first {}): {:?}",
        root.to_string_lossy(),
        files.len(),
        files
    ))
}

fn build_sqlite_from_csv(csv_path: &Path, db_path: &Path) -> Result<(), String> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if db_path.exists() {
        return Ok(());
    }

    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "PRAGMA journal_mode=OFF;\nPRAGMA synchronous=OFF;\nPRAGMA temp_store=MEMORY;\n",
    )
    .map_err(|e| e.to_string())?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS entries (\
            word TEXT PRIMARY KEY COLLATE NOCASE,\
            phonetic TEXT,\
            definition TEXT,\
            translation TEXT,\
            pos TEXT,\
            audio TEXT\
        );",
    )
    .map_err(|e| e.to_string())?;

    let file = std::fs::File::open(csv_path).map_err(|e| e.to_string())?;
    let mut rdr = csv::ReaderBuilder::new()
        .has_headers(true)
        .flexible(true)
        .from_reader(std::io::BufReader::new(file));

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    {
        let mut stmt = tx
            .prepare(
                "INSERT OR REPLACE INTO entries(word, phonetic, definition, translation, pos, audio) VALUES(?1, ?2, ?3, ?4, ?5, ?6)",
            )
            .map_err(|e| e.to_string())?;

        for rec in rdr.records() {
            let rec = rec.map_err(|e| e.to_string())?;
            let word = rec.get(0).unwrap_or("").trim();
            if word.is_empty() {
                continue;
            }
            let phonetic = rec.get(1).unwrap_or("").trim();
            let definition = rec.get(2).unwrap_or("").trim();
            let translation = rec.get(3).unwrap_or("").trim();
            let pos = rec.get(4).unwrap_or("").trim();
            let audio = rec.get(12).unwrap_or("").trim();

            stmt.execute(rusqlite::params![
                word,
                if phonetic.is_empty() { None } else { Some(phonetic) },
                if definition.is_empty() { None } else { Some(definition) },
                if translation.is_empty() { None } else { Some(translation) },
                if pos.is_empty() { None } else { Some(pos) },
                if audio.is_empty() { None } else { Some(audio) },
            ])
            .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn dictionary_lookup(state: State<AppState>, word: String) -> Result<Option<DictionaryResult>, String> {
    let clean = word.trim();
    if clean.is_empty() {
        return Ok(None);
    }

    // Ensure ifo/db path is populated if already installed
    if state.dictionary.get_ifo_path().is_none() && state.dictionary.get_db_path().is_none() {
        let root = ecdict_root(&state.dictionaries_dir);
        if let Some(ifo_path) = find_first_ifo(&root) {
            state.dictionary.set_ifo_path(ifo_path);
        } else {
            let db_path = ecdict_db_path(&root);
            if db_path.exists() {
                state.dictionary.set_db_path(db_path);
            } else if let Ok(Some(db)) = normalize_ecdict_sqlite(&root) {
                state.dictionary.set_db_path(db);
            }
        }
    }

    if state.dictionary.get_db_path().is_some() {
        return state.dictionary.lookup_db(clean);
    }

    let defs = match state.dictionary.lookup(clean)? {
        Some(d) => d,
        None => return Ok(None),
    };

    if defs.is_empty() {
        return Ok(None);
    }

    let mut definition_lines: Vec<String> = vec![];

    for d in defs {
        for seg in d.segments {
            let t = clean_definition_text(&seg.text);
            if !t.is_empty() {
                definition_lines.extend(t.split('\n').map(|s| s.trim()).filter(|s| !s.is_empty()).map(|s| s.to_string()));
            }
        }
    }

    if definition_lines.is_empty() {
        return Ok(None);
    }

    let translation = definition_lines.get(0).cloned();
    let rest = if definition_lines.len() > 1 {
        definition_lines[1..].to_vec()
    } else {
        vec![]
    };

    let meanings = if rest.is_empty() {
        vec![]
    } else {
        vec![DictionaryMeaning {
            part_of_speech: "".to_string(),
            definitions: rest,
            examples: vec![],
        }]
    };

    Ok(Some(DictionaryResult {
        word: clean.to_string(),
        phonetic: None,
        audio_url: None,
        translation,
        meanings,
    }))
}
