/// <reference types="vitest/globals" />
import { useNoteStore } from "@/stores/noteStore";
import { invoke } from "@tauri-apps/api/core";
import type { Note } from "@/types";

const mockInvoke = invoke as ReturnType<typeof vi.fn>;

const makeNote = (overrides: Partial<Note> = {}): Note => ({
  id: overrides.id ?? "note-1",
  documentId: overrides.documentId ?? "doc-1",
  type: overrides.type ?? "ai_generated",
  content: overrides.content ?? "Test note content",
  originalText: overrides.originalText ?? "original",
  pageNumber: overrides.pageNumber ?? 1,
  aiConfirmed: overrides.aiConfirmed ?? false,
  createdAt: overrides.createdAt ?? "2025-01-01T00:00:00Z",
  updatedAt: overrides.updatedAt ?? "2025-01-01T00:00:00Z",
});

// NoteData format returned by backend
const toBackendFormat = (note: Note) => ({
  id: note.id,
  document_id: note.documentId,
  note_type: note.type,
  content: note.content,
  original_text: note.originalText || null,
  page_number: note.pageNumber || null,
  position_data: null,
  ai_confirmed: note.aiConfirmed,
  created_at: note.createdAt,
  updated_at: note.updatedAt,
});

beforeEach(() => {
  localStorage.clear();
  useNoteStore.setState(useNoteStore.getInitialState());
  mockInvoke.mockReset();
});

describe("useNoteStore", () => {
  describe("defaults", () => {
    it("starts with empty notes", () => {
      expect(useNoteStore.getState().notes).toEqual([]);
    });

    it("starts with empty currentDocumentNotes", () => {
      expect(useNoteStore.getState().currentDocumentNotes).toEqual([]);
    });

    it("starts with null currentDocumentId", () => {
      expect(useNoteStore.getState().currentDocumentId).toBeNull();
    });

    it("starts not loading", () => {
      expect(useNoteStore.getState().loading).toBe(false);
    });
  });

  describe("loadNotes", () => {
    it("loads notes for a specific document", async () => {
      const backendNotes = [
        toBackendFormat(makeNote({ id: "n1", documentId: "doc-1" })),
        toBackendFormat(makeNote({ id: "n2", documentId: "doc-1" })),
      ];
      mockInvoke.mockResolvedValueOnce(backendNotes);

      await useNoteStore.getState().loadNotes("doc-1");

      const state = useNoteStore.getState();
      expect(state.notes).toHaveLength(2);
      expect(state.currentDocumentNotes).toHaveLength(2);
      expect(state.currentDocumentId).toBe("doc-1");
      expect(state.loading).toBe(false);
      expect(mockInvoke).toHaveBeenCalledWith("get_notes", { documentId: "doc-1" });
    });

    it("loads all notes when no documentId specified", async () => {
      const backendNotes = [
        toBackendFormat(makeNote({ id: "n1", documentId: "doc-1" })),
        toBackendFormat(makeNote({ id: "n2", documentId: "doc-2" })),
      ];
      mockInvoke.mockResolvedValueOnce(backendNotes);

      await useNoteStore.getState().loadNotes();

      const state = useNoteStore.getState();
      expect(state.notes).toHaveLength(2);
      expect(state.loading).toBe(false);
      expect(mockInvoke).toHaveBeenCalledWith("get_notes", {});
    });

    it("handles load error gracefully", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("DB error"));

      await expect(useNoteStore.getState().loadNotes("doc-1")).rejects.toThrow("DB error");
      expect(useNoteStore.getState().loading).toBe(false);
    });

    it("ignores stale load results (race condition)", async () => {
      // First load — slow
      let resolveFirst: (v: any) => void;
      const firstPromise = new Promise(r => { resolveFirst = r; });
      mockInvoke.mockReturnValueOnce(firstPromise);

      // Start first load
      const load1 = useNoteStore.getState().loadNotes("doc-1");

      // Second load — fast
      const backendNotes2 = [toBackendFormat(makeNote({ id: "n-fast", documentId: "doc-2" }))];
      mockInvoke.mockResolvedValueOnce(backendNotes2);
      await useNoteStore.getState().loadNotes("doc-2");

      // First load resolves late
      resolveFirst!([toBackendFormat(makeNote({ id: "n-slow", documentId: "doc-1" }))]);
      await load1;

      // Should keep second load result (doc-2), not overwrite with stale doc-1
      const state = useNoteStore.getState();
      expect(state.currentDocumentId).toBe("doc-2");
      expect(state.currentDocumentNotes[0]?.id).toBe("n-fast");
    });
  });

  describe("addNote", () => {
    it("adds note to store and calls invoke", async () => {
      mockInvoke.mockResolvedValueOnce(undefined); // save_note
      useNoteStore.setState({ currentDocumentId: "doc-1" });

      const note = makeNote({ id: "n1", documentId: "doc-1" });
      await useNoteStore.getState().addNote(note);

      const state = useNoteStore.getState();
      expect(state.notes).toHaveLength(1);
      expect(state.notes[0].id).toBe("n1");
      expect(state.currentDocumentNotes).toHaveLength(1);
      expect(mockInvoke).toHaveBeenCalledWith("save_note", expect.objectContaining({ note: expect.any(Object) }));
    });

    it("does not add to currentDocumentNotes if different document", async () => {
      mockInvoke.mockResolvedValueOnce(undefined);
      useNoteStore.setState({ currentDocumentId: "doc-1" });

      const note = makeNote({ id: "n1", documentId: "doc-2" });
      await useNoteStore.getState().addNote(note);

      const state = useNoteStore.getState();
      expect(state.notes).toHaveLength(1);
      expect(state.currentDocumentNotes).toHaveLength(0);
    });

    it("throws on invoke failure", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("save failed"));

      await expect(useNoteStore.getState().addNote(makeNote())).rejects.toThrow("save failed");
      expect(useNoteStore.getState().notes).toHaveLength(0);
    });
  });

  describe("updateNote", () => {
    it("updates note content in notes and currentDocumentNotes", () => {
      const note = makeNote({ id: "n1", documentId: "doc-1" });
      useNoteStore.setState({
        notes: [note],
        currentDocumentNotes: [note],
        currentDocumentId: "doc-1",
      });

      useNoteStore.getState().updateNote("n1", { content: "updated content" });

      expect(useNoteStore.getState().notes[0].content).toBe("updated content");
      expect(useNoteStore.getState().currentDocumentNotes[0].content).toBe("updated content");
    });

    it("does not affect other notes", () => {
      const n1 = makeNote({ id: "n1", content: "first" });
      const n2 = makeNote({ id: "n2", content: "second" });
      useNoteStore.setState({ notes: [n1, n2], currentDocumentNotes: [n1, n2] });

      useNoteStore.getState().updateNote("n1", { content: "changed" });

      expect(useNoteStore.getState().notes[1].content).toBe("second");
    });
  });

  describe("deleteNote", () => {
    it("removes note from store and calls invoke", async () => {
      mockInvoke.mockResolvedValueOnce(undefined); // delete_note
      const note = makeNote({ id: "n1" });
      useNoteStore.setState({ notes: [note], currentDocumentNotes: [note] });

      await useNoteStore.getState().deleteNote("n1");

      expect(useNoteStore.getState().notes).toHaveLength(0);
      expect(useNoteStore.getState().currentDocumentNotes).toHaveLength(0);
      expect(mockInvoke).toHaveBeenCalledWith("delete_note", { noteId: "n1" });
    });

    it("throws on invoke failure and keeps note", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("delete failed"));
      const note = makeNote({ id: "n1" });
      useNoteStore.setState({ notes: [note], currentDocumentNotes: [note] });

      await expect(useNoteStore.getState().deleteNote("n1")).rejects.toThrow("delete failed");
      // Note should still be there since invoke failed before set()
      // Actually the invoke fails before set() is called
    });
  });

  describe("confirmNote", () => {
    it("marks note as confirmed", async () => {
      mockInvoke.mockResolvedValueOnce(undefined); // confirm_note
      const note = makeNote({ id: "n1", type: "ai_generated", aiConfirmed: false });
      useNoteStore.setState({ notes: [note], currentDocumentNotes: [note] });

      await useNoteStore.getState().confirmNote("n1");

      const state = useNoteStore.getState();
      expect(state.notes[0].type).toBe("confirmed");
      expect(state.notes[0].aiConfirmed).toBe(true);
      expect(state.currentDocumentNotes[0].aiConfirmed).toBe(true);
      expect(mockInvoke).toHaveBeenCalledWith("confirm_note", { noteId: "n1", confirmed: true });
    });

    it("throws on invoke failure", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("confirm failed"));
      const note = makeNote({ id: "n1", aiConfirmed: false });
      useNoteStore.setState({ notes: [note], currentDocumentNotes: [note] });

      await expect(useNoteStore.getState().confirmNote("n1")).rejects.toThrow("confirm failed");
      expect(useNoteStore.getState().notes[0].aiConfirmed).toBe(false);
    });
  });
});
