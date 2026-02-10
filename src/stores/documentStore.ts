import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Document, TextSelection } from '@/types';

interface DocumentState {
  documents: Document[];
  currentDocument: Document | null;
  currentPage: number;
  selectedText: TextSelection | null;
  sidebarOpen: boolean;
  aiPanelOpen: boolean;
  sidebarWidth: number;
  aiPanelWidth: number;

  settingsOpen: boolean;
  settingsInitialTab: 'general' | 'ai' | 'storage';
  libraryOpen: boolean;
  helpOpen: boolean;
  
  setDocuments: (documents: Document[]) => void;
  setCurrentDocument: (document: Document | null) => void;
  setCurrentPage: (page: number) => void;
  setSelectedText: (selection: TextSelection | null) => void;
  toggleSidebar: () => void;
  toggleAIPanel: () => void;
  openAIPanel: () => void;
  closeAIPanel: () => void;
  openSettings: () => void;
  openSettingsTab: (tab: 'general' | 'ai' | 'storage') => void;
  closeSettings: () => void;
  openLibrary: () => void;
  closeLibrary: () => void;
  openHelp: () => void;
  closeHelp: () => void;
  setSidebarWidth: (width: number) => void;
  setAIPanelWidth: (width: number) => void;
  updateDocumentProgress: (docId: string, page: number, progress: number) => void;
  setDocumentTotalPages: (docId: string, totalPages: number) => void;
  setLastPosition: (docId: string, position: string) => void;
  flushRecentOrder: () => void;
}

export const useDocumentStore = create<DocumentState>()(
  persist(
    (set) => ({
      documents: [],
      currentDocument: null,
      currentPage: 1,
      selectedText: null,
      sidebarOpen: true,
      aiPanelOpen: false,
      sidebarWidth: 256,
      aiPanelWidth: 400,

      settingsOpen: false,
      settingsInitialTab: 'general' as const,
      libraryOpen: false,
      helpOpen: false,

      setDocuments: (documents) => set({ documents }),
      setCurrentDocument: (document) =>
        set({
          currentDocument: document,
          currentPage: document?.currentPage || 1,
          aiPanelOpen: document ? true : false,
          _pendingRecentDocId: document ? document.id : null,
        } as any),
      setCurrentPage: (page) => set({ currentPage: page }),
      setSelectedText: (selection) => set({ selectedText: selection }),
      toggleSidebar: () => set((state) => {
        // When closing sidebar, flush the pending recent doc
        if (state.sidebarOpen && (state as any)._pendingRecentDocId) {
          const pid = (state as any)._pendingRecentDocId as string;
          return {
            sidebarOpen: false,
            _pendingRecentDocId: null,
            documents: state.documents.map(d => d.id === pid ? { ...d, updatedAt: new Date().toISOString() } : d),
          };
        }
        return { sidebarOpen: !state.sidebarOpen };
      }),
      toggleAIPanel: () => set((state) => ({ aiPanelOpen: !state.aiPanelOpen })),
      openAIPanel: () => set({ aiPanelOpen: true }),
      closeAIPanel: () => set({ aiPanelOpen: false }),
      openSettings: () => set({ settingsOpen: true, settingsInitialTab: 'general' }),
      openSettingsTab: (tab) => set({ settingsOpen: true, settingsInitialTab: tab }),
      closeSettings: () => set({ settingsOpen: false }),
      openLibrary: () => set({ libraryOpen: true }),
      closeLibrary: () => set({ libraryOpen: false }),
      openHelp: () => set({ helpOpen: true }),
      closeHelp: () => set({ helpOpen: false }),
      setSidebarWidth: (width) => set({ sidebarWidth: Math.max(200, Math.min(400, width)) }),
      setAIPanelWidth: (width) => set({ aiPanelWidth: Math.max(300, Math.min(600, width)) }),
      updateDocumentProgress: (docId, page, progress) => set((state) => ({
        documents: state.documents.map(d => 
          d.id === docId ? { ...d, currentPage: page, readingProgress: progress } : d
        ),
        currentDocument: state.currentDocument?.id === docId 
          ? { ...state.currentDocument, currentPage: page, readingProgress: progress } 
          : state.currentDocument
      })),
      setDocumentTotalPages: (docId, totalPages) => set((state) => ({
        documents: state.documents.map(d =>
          d.id === docId ? { ...d, totalPages } : d
        ),
        currentDocument: state.currentDocument?.id === docId
          ? { ...state.currentDocument, totalPages }
          : state.currentDocument,
      })),
      setLastPosition: (docId, position) => set((state) => ({
        documents: state.documents.map(d =>
          d.id === docId ? { ...d, lastPosition: position } : d
        ),
        currentDocument: state.currentDocument?.id === docId
          ? { ...state.currentDocument, lastPosition: position }
          : state.currentDocument,
      })),
      flushRecentOrder: () => set((state) => {
        const pid = (state as any)._pendingRecentDocId as string | null;
        if (!pid) return {};
        return {
          _pendingRecentDocId: null,
          documents: state.documents.map(d => d.id === pid ? { ...d, updatedAt: new Date().toISOString() } : d),
        };
      }),
    }),
    {
      name: 'aireader-documents',
      version: 2,
      migrate: (persistedState: any, version) => {
        if (version < 2) {
          try {
            if (persistedState && typeof persistedState === 'object') {
              if ('aiPanelOpen' in (persistedState as any)) {
                delete (persistedState as any).aiPanelOpen;
              }
              const state = (persistedState as any).state;
              if (state && typeof state === 'object') {
                delete (state as any).aiPanelOpen;
              }
            }
          } catch {
            // ignore
          }
        }
        return persistedState;
      },
      partialize: (state) => ({
        documents: state.documents,
        sidebarWidth: state.sidebarWidth,
        aiPanelWidth: state.aiPanelWidth,
      }),
    }
  )
);
