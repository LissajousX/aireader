use rusqlite::{Connection, Result, params};
use std::sync::Mutex;
use std::path::PathBuf;
use std::time::Duration;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(app_data_dir: PathBuf) -> Result<Self> {
        std::fs::create_dir_all(&app_data_dir).ok();
        let db_path = app_data_dir.join("aireader.db");
        let conn = Connection::open(&db_path)?;

        conn.busy_timeout(Duration::from_secs(5))?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA foreign_keys = ON;",
        )?;
        
        conn.execute(
            "CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                type TEXT NOT NULL,
                content TEXT NOT NULL,
                original_text TEXT,
                page_number INTEGER,
                position_data TEXT,
                ai_confirmed INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                type TEXT NOT NULL,
                path TEXT NOT NULL,
                total_pages INTEGER DEFAULT 0,
                current_page INTEGER DEFAULT 1,
                reading_progress REAL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            [],
        )?;

        Ok(Self { conn: Mutex::new(conn) })
    }

    pub fn clear_all(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM notes", [])?;
        conn.execute("DELETE FROM documents", [])?;
        conn.execute_batch("VACUUM;")?;
        Ok(())
    }

    pub fn save_note(&self, note: &NoteData) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO notes 
            (id, document_id, type, content, original_text, page_number, position_data, ai_confirmed, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                note.id,
                note.document_id,
                note.note_type,
                note.content,
                note.original_text,
                note.page_number,
                note.position_data,
                note.ai_confirmed as i32,
                note.created_at,
                note.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn get_notes_by_document(&self, document_id: &str) -> Result<Vec<NoteData>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, document_id, type, content, original_text, page_number, position_data, ai_confirmed, created_at, updated_at
             FROM notes WHERE document_id = ?1 ORDER BY created_at DESC"
        )?;
        
        let notes = stmt.query_map([document_id], |row| {
            Ok(NoteData {
                id: row.get(0)?,
                document_id: row.get(1)?,
                note_type: row.get(2)?,
                content: row.get(3)?,
                original_text: row.get(4)?,
                page_number: row.get(5)?,
                position_data: row.get(6)?,
                ai_confirmed: row.get::<_, i32>(7)? != 0,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })?;
        
        notes.collect()
    }

    pub fn get_all_notes(&self) -> Result<Vec<NoteData>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, document_id, type, content, original_text, page_number, position_data, ai_confirmed, created_at, updated_at
             FROM notes ORDER BY created_at DESC"
        )?;
        
        let notes = stmt.query_map([], |row| {
            Ok(NoteData {
                id: row.get(0)?,
                document_id: row.get(1)?,
                note_type: row.get(2)?,
                content: row.get(3)?,
                original_text: row.get(4)?,
                page_number: row.get(5)?,
                position_data: row.get(6)?,
                ai_confirmed: row.get::<_, i32>(7)? != 0,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })?;
        
        notes.collect()
    }

    pub fn delete_note(&self, note_id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM notes WHERE id = ?1", [note_id])?;
        Ok(())
    }

    pub fn update_note_confirmed(&self, note_id: &str, confirmed: bool) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE notes SET ai_confirmed = ?1, updated_at = ?2 WHERE id = ?3",
            params![confirmed as i32, now, note_id],
        )?;
        Ok(())
    }

    pub fn reassign_notes_document(&self, old_document_id: &str, new_document_id: &str) -> Result<usize> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE notes SET document_id = ?1 WHERE document_id = ?2",
            params![new_document_id, old_document_id],
        )
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct NoteData {
    pub id: String,
    pub document_id: String,
    pub note_type: String,
    pub content: String,
    pub original_text: Option<String>,
    pub page_number: Option<i32>,
    pub position_data: Option<String>,
    pub ai_confirmed: bool,
    pub created_at: String,
    pub updated_at: String,
}
