import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { Note } from '@/types';

function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === 'string') return new Error(error);

  if (error && typeof error === 'object') {
    const anyErr = error as Record<string, unknown>;
    const message = anyErr.message;
    if (typeof message === 'string' && message.trim()) return new Error(message);

    const errText = anyErr.error;
    if (typeof errText === 'string' && errText.trim()) return new Error(errText);
  }

  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error(String(error));
  }
}

interface NoteData {
  id: string;
  document_id: string;
  note_type: string;
  content: string;
  original_text: string | null;
  page_number: number | null;
  position_data: string | null;
  ai_confirmed: boolean;
  created_at: string;
  updated_at: string;
}

function toNoteData(note: Note): NoteData {
  return {
    id: note.id,
    document_id: note.documentId,
    note_type: note.type,
    content: note.content,
    original_text: note.originalText || null,
    page_number: note.pageNumber || null,
    position_data: note.positionData || null,
    ai_confirmed: note.aiConfirmed,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
  };
}

function fromNoteData(data: NoteData): Note {
  return {
    id: data.id,
    documentId: data.document_id,
    type: data.ai_confirmed ? 'confirmed' : (data.note_type as Note['type']),
    content: data.content,
    originalText: data.original_text || undefined,
    pageNumber: data.page_number || undefined,
    positionData: data.position_data || undefined,
    aiConfirmed: data.ai_confirmed,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

interface NoteState {
  notes: Note[];
  currentDocumentNotes: Note[];
  currentDocumentId: string | null;
  loading: boolean;
  _loadSeq: number;
  
  loadNotes: (documentId?: string) => Promise<void>;
  addNote: (note: Note) => Promise<void>;
  updateNote: (id: string, updates: Partial<Note>) => void;
  deleteNote: (id: string) => Promise<void>;
  confirmNote: (id: string) => Promise<void>;
}

export const useNoteStore = create<NoteState>((set, get) => ({
  notes: [],
  currentDocumentNotes: [],
  currentDocumentId: null,
  loading: false,

  _loadSeq: 0,

  loadNotes: async (documentId) => {
    const seq = get()._loadSeq + 1;
    set({ _loadSeq: seq });

    if (documentId) {
      set({ loading: true, currentDocumentId: documentId, currentDocumentNotes: [] });
    } else {
      set({ loading: true });
    }
    try {
      const data = await invoke<NoteData[]>(
        'get_notes',
        documentId ? { documentId } : {}
      );
      const notes = data.map(fromNoteData);

      if (get()._loadSeq !== seq) {
        return;
      }

      if (documentId) {
        set({ notes, currentDocumentNotes: notes, loading: false });
      } else {
        const currentDocumentId = get().currentDocumentId;
        set({
          notes,
          currentDocumentNotes: currentDocumentId ? notes.filter(n => n.documentId === currentDocumentId) : get().currentDocumentNotes,
          loading: false,
        });
      }
    } catch (error) {
      console.error('Failed to load notes:', error);
      if (get()._loadSeq === seq) {
        set({ loading: false });
      }
      throw toError(error);
    }
  },
  
  addNote: async (note) => {
    try {
      await invoke('save_note', { note: toNoteData(note) });
      set((state) => {
        return { 
          notes: [...state.notes, note],
          currentDocumentNotes: state.currentDocumentId && note.documentId === state.currentDocumentId 
            ? [...state.currentDocumentNotes, note]
            : state.currentDocumentNotes
        };
      });
    } catch (error) {
      console.error('Failed to save note:', error);
      throw toError(error);
    }
  },
  
  updateNote: (id, updates) => set((state) => ({
    notes: state.notes.map(n => n.id === id ? { ...n, ...updates } : n),
    currentDocumentNotes: state.currentDocumentNotes.map(n => n.id === id ? { ...n, ...updates } : n),
  })),
  
  deleteNote: async (id) => {
    try {
      await invoke('delete_note', { noteId: id });
      set((state) => ({
        notes: state.notes.filter(n => n.id !== id),
        currentDocumentNotes: state.currentDocumentNotes.filter(n => n.id !== id),
      }));
    } catch (error) {
      console.error('Failed to delete note:', error);
      throw toError(error);
    }
  },
  
  confirmNote: async (id) => {
    try {
      await invoke('confirm_note', { noteId: id, confirmed: true });
      set((state) => ({
        notes: state.notes.map(n => n.id === id ? { ...n, type: 'confirmed' as const, aiConfirmed: true } : n),
        currentDocumentNotes: state.currentDocumentNotes.map(n => n.id === id ? { ...n, type: 'confirmed' as const, aiConfirmed: true } : n),
      }));
    } catch (error) {
      console.error('Failed to confirm note:', error);
      throw toError(error);
    }
  },
}));
