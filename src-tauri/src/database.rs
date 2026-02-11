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

#[cfg(test)]
mod tests {
    use super::*;

    use std::sync::atomic::{AtomicU32, Ordering};
    static TEST_COUNTER: AtomicU32 = AtomicU32::new(0);

    fn make_db() -> Database {
        let n = TEST_COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!(
            "aireader_test_{}_{}", std::process::id(), n
        ));
        let _ = std::fs::remove_dir_all(&dir);
        Database::new(dir).expect("failed to create test db")
    }

    fn sample_note(id: &str, doc_id: &str) -> NoteData {
        NoteData {
            id: id.to_string(),
            document_id: doc_id.to_string(),
            note_type: "ai_generated".to_string(),
            content: "Test note content".to_string(),
            original_text: Some("original text".to_string()),
            page_number: Some(1),
            position_data: None,
            ai_confirmed: false,
            created_at: "2025-01-01T00:00:00Z".to_string(),
            updated_at: "2025-01-01T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn test_save_and_get_note() {
        let db = make_db();
        let note = sample_note("n1", "doc1");
        db.save_note(&note).unwrap();

        let notes = db.get_notes_by_document("doc1").unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].id, "n1");
        assert_eq!(notes[0].content, "Test note content");
        assert_eq!(notes[0].original_text, Some("original text".to_string()));
    }

    #[test]
    fn test_get_notes_empty() {
        let db = make_db();
        let notes = db.get_notes_by_document("nonexistent").unwrap();
        assert!(notes.is_empty());
    }

    #[test]
    fn test_get_all_notes() {
        let db = make_db();
        db.save_note(&sample_note("n1", "doc1")).unwrap();
        db.save_note(&sample_note("n2", "doc2")).unwrap();
        db.save_note(&sample_note("n3", "doc1")).unwrap();

        let all = db.get_all_notes().unwrap();
        assert_eq!(all.len(), 3);
    }

    #[test]
    fn test_delete_note() {
        let db = make_db();
        db.save_note(&sample_note("n1", "doc1")).unwrap();
        db.delete_note("n1").unwrap();

        let notes = db.get_notes_by_document("doc1").unwrap();
        assert!(notes.is_empty());
    }

    #[test]
    fn test_delete_nonexistent_note() {
        let db = make_db();
        // Should not error
        db.delete_note("nonexistent").unwrap();
    }

    #[test]
    fn test_update_note_confirmed() {
        let db = make_db();
        db.save_note(&sample_note("n1", "doc1")).unwrap();

        db.update_note_confirmed("n1", true).unwrap();
        let notes = db.get_notes_by_document("doc1").unwrap();
        assert!(notes[0].ai_confirmed);

        db.update_note_confirmed("n1", false).unwrap();
        let notes = db.get_notes_by_document("doc1").unwrap();
        assert!(!notes[0].ai_confirmed);
    }

    #[test]
    fn test_save_note_upsert() {
        let db = make_db();
        let mut note = sample_note("n1", "doc1");
        db.save_note(&note).unwrap();

        note.content = "Updated content".to_string();
        db.save_note(&note).unwrap();

        let notes = db.get_notes_by_document("doc1").unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].content, "Updated content");
    }

    #[test]
    fn test_reassign_notes_document() {
        let db = make_db();
        db.save_note(&sample_note("n1", "old_doc")).unwrap();
        db.save_note(&sample_note("n2", "old_doc")).unwrap();
        db.save_note(&sample_note("n3", "other_doc")).unwrap();

        let count = db.reassign_notes_document("old_doc", "new_doc").unwrap();
        assert_eq!(count, 2);

        let old = db.get_notes_by_document("old_doc").unwrap();
        assert!(old.is_empty());

        let new = db.get_notes_by_document("new_doc").unwrap();
        assert_eq!(new.len(), 2);

        let other = db.get_notes_by_document("other_doc").unwrap();
        assert_eq!(other.len(), 1);
    }

    #[test]
    fn test_clear_all() {
        let db = make_db();
        db.save_note(&sample_note("n1", "doc1")).unwrap();
        db.save_note(&sample_note("n2", "doc2")).unwrap();
        db.clear_all().unwrap();

        let all = db.get_all_notes().unwrap();
        assert!(all.is_empty());
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
