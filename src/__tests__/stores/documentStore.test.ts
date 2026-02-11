/// <reference types="vitest/globals" />
import { useDocumentStore } from "@/stores/documentStore";
import type { Document } from "@/types";

const makeDoc = (overrides: Partial<Document> = {}): Document => ({
  id: overrides.id ?? "doc-1",
  title: overrides.title ?? "Test Doc",
  type: overrides.type ?? "pdf",
  path: overrides.path ?? "/tmp/test.pdf",
  totalPages: overrides.totalPages ?? 10,
  currentPage: overrides.currentPage ?? 1,
  readingProgress: overrides.readingProgress ?? 0,
  lastPosition: overrides.lastPosition ?? "",
  isCopy: overrides.isCopy ?? false,
  originalPath: overrides.originalPath ?? undefined,
  createdAt: overrides.createdAt ?? "2025-01-01T00:00:00Z",
  updatedAt: overrides.updatedAt ?? "2025-01-01T00:00:00Z",
});

beforeEach(() => {
  localStorage.clear();
  useDocumentStore.setState(useDocumentStore.getInitialState());
});

describe("useDocumentStore", () => {
  describe("defaults", () => {
    it("starts with empty documents array", () => {
      expect(useDocumentStore.getState().documents).toEqual([]);
    });

    it("starts with no current document", () => {
      expect(useDocumentStore.getState().currentDocument).toBeNull();
    });

    it("starts with currentPage 1", () => {
      expect(useDocumentStore.getState().currentPage).toBe(1);
    });

    it("starts with sidebar open", () => {
      expect(useDocumentStore.getState().sidebarOpen).toBe(true);
    });

    it("starts with AI panel closed", () => {
      expect(useDocumentStore.getState().aiPanelOpen).toBe(false);
    });
  });

  describe("setDocuments", () => {
    it("replaces the documents array", () => {
      const docs = [makeDoc({ id: "a" }), makeDoc({ id: "b" })];
      useDocumentStore.getState().setDocuments(docs);
      expect(useDocumentStore.getState().documents).toHaveLength(2);
      expect(useDocumentStore.getState().documents[0].id).toBe("a");
    });
  });

  describe("setCurrentDocument", () => {
    it("sets current document and opens AI panel", () => {
      const doc = makeDoc({ currentPage: 5 });
      useDocumentStore.getState().setCurrentDocument(doc);
      const state = useDocumentStore.getState();
      expect(state.currentDocument?.id).toBe("doc-1");
      expect(state.currentPage).toBe(5);
      expect(state.aiPanelOpen).toBe(true);
    });

    it("clears current document when null", () => {
      useDocumentStore.getState().setCurrentDocument(makeDoc());
      useDocumentStore.getState().setCurrentDocument(null);
      const state = useDocumentStore.getState();
      expect(state.currentDocument).toBeNull();
      expect(state.currentPage).toBe(1);
      expect(state.aiPanelOpen).toBe(false);
    });
  });

  describe("updateDocumentProgress", () => {
    it("updates page and progress for matching document", () => {
      const doc = makeDoc({ id: "d1" });
      useDocumentStore.getState().setDocuments([doc]);
      useDocumentStore.getState().setCurrentDocument(doc);
      useDocumentStore.getState().updateDocumentProgress("d1", 5, 0.5);

      const state = useDocumentStore.getState();
      expect(state.documents[0].currentPage).toBe(5);
      expect(state.documents[0].readingProgress).toBe(0.5);
      expect(state.currentDocument?.currentPage).toBe(5);
      expect(state.currentDocument?.readingProgress).toBe(0.5);
    });

    it("does not affect other documents", () => {
      const docs = [makeDoc({ id: "d1" }), makeDoc({ id: "d2" })];
      useDocumentStore.getState().setDocuments(docs);
      useDocumentStore.getState().updateDocumentProgress("d1", 3, 0.3);
      expect(useDocumentStore.getState().documents[1].currentPage).toBe(1);
    });
  });

  describe("setDocumentTotalPages", () => {
    it("updates totalPages for matching document and currentDocument", () => {
      const doc = makeDoc({ id: "d1", totalPages: 10 });
      useDocumentStore.getState().setDocuments([doc]);
      useDocumentStore.getState().setCurrentDocument(doc);
      useDocumentStore.getState().setDocumentTotalPages("d1", 42);

      const state = useDocumentStore.getState();
      expect(state.documents[0].totalPages).toBe(42);
      expect(state.currentDocument?.totalPages).toBe(42);
    });
  });

  describe("setLastPosition", () => {
    it("stores last position string", () => {
      const doc = makeDoc({ id: "d1" });
      useDocumentStore.getState().setDocuments([doc]);
      useDocumentStore.getState().setCurrentDocument(doc);
      useDocumentStore.getState().setLastPosition("d1", "epubcfi(/6/4)");

      const state = useDocumentStore.getState();
      expect(state.documents[0].lastPosition).toBe("epubcfi(/6/4)");
      expect(state.currentDocument?.lastPosition).toBe("epubcfi(/6/4)");
    });
  });

  describe("panel toggles", () => {
    it("toggleSidebar flips sidebarOpen", () => {
      expect(useDocumentStore.getState().sidebarOpen).toBe(true);
      useDocumentStore.getState().toggleSidebar();
      expect(useDocumentStore.getState().sidebarOpen).toBe(false);
      useDocumentStore.getState().toggleSidebar();
      expect(useDocumentStore.getState().sidebarOpen).toBe(true);
    });

    it("toggleAIPanel flips aiPanelOpen", () => {
      expect(useDocumentStore.getState().aiPanelOpen).toBe(false);
      useDocumentStore.getState().toggleAIPanel();
      expect(useDocumentStore.getState().aiPanelOpen).toBe(true);
    });

    it("openAIPanel / closeAIPanel", () => {
      useDocumentStore.getState().openAIPanel();
      expect(useDocumentStore.getState().aiPanelOpen).toBe(true);
      useDocumentStore.getState().closeAIPanel();
      expect(useDocumentStore.getState().aiPanelOpen).toBe(false);
    });
  });

  describe("width constraints", () => {
    it("clamps sidebarWidth between 200 and 400", () => {
      useDocumentStore.getState().setSidebarWidth(100);
      expect(useDocumentStore.getState().sidebarWidth).toBe(200);
      useDocumentStore.getState().setSidebarWidth(500);
      expect(useDocumentStore.getState().sidebarWidth).toBe(400);
      useDocumentStore.getState().setSidebarWidth(300);
      expect(useDocumentStore.getState().sidebarWidth).toBe(300);
    });

    it("clamps aiPanelWidth between 300 and 600", () => {
      useDocumentStore.getState().setAIPanelWidth(100);
      expect(useDocumentStore.getState().aiPanelWidth).toBe(300);
      useDocumentStore.getState().setAIPanelWidth(800);
      expect(useDocumentStore.getState().aiPanelWidth).toBe(600);
      useDocumentStore.getState().setAIPanelWidth(450);
      expect(useDocumentStore.getState().aiPanelWidth).toBe(450);
    });
  });

  describe("settings / library / help dialogs", () => {
    it("openSettings sets settingsOpen and default tab", () => {
      useDocumentStore.getState().openSettings();
      const state = useDocumentStore.getState();
      expect(state.settingsOpen).toBe(true);
      expect(state.settingsInitialTab).toBe("general");
    });

    it("openSettingsTab sets specific tab", () => {
      useDocumentStore.getState().openSettingsTab("ai");
      expect(useDocumentStore.getState().settingsInitialTab).toBe("ai");
    });

    it("closeSettings", () => {
      useDocumentStore.getState().openSettings();
      useDocumentStore.getState().closeSettings();
      expect(useDocumentStore.getState().settingsOpen).toBe(false);
    });

    it("library open/close", () => {
      useDocumentStore.getState().openLibrary();
      expect(useDocumentStore.getState().libraryOpen).toBe(true);
      useDocumentStore.getState().closeLibrary();
      expect(useDocumentStore.getState().libraryOpen).toBe(false);
    });

    it("help open/close", () => {
      useDocumentStore.getState().openHelp();
      expect(useDocumentStore.getState().helpOpen).toBe(true);
      useDocumentStore.getState().closeHelp();
      expect(useDocumentStore.getState().helpOpen).toBe(false);
    });
  });

  describe("flushRecentOrder", () => {
    it("updates updatedAt for the pending doc", () => {
      const doc = makeDoc({ id: "d1", updatedAt: "2020-01-01T00:00:00Z" });
      useDocumentStore.getState().setDocuments([doc]);
      useDocumentStore.getState().setCurrentDocument(doc);
      useDocumentStore.getState().flushRecentOrder();

      const updated = useDocumentStore.getState().documents[0];
      expect(updated.updatedAt).not.toBe("2020-01-01T00:00:00Z");
    });

    it("is a no-op when no pending doc", () => {
      const doc = makeDoc({ id: "d1", updatedAt: "2020-01-01T00:00:00Z" });
      useDocumentStore.getState().setDocuments([doc]);
      // Don't set current document — no pending
      useDocumentStore.getState().flushRecentOrder();
      expect(useDocumentStore.getState().documents[0].updatedAt).toBe("2020-01-01T00:00:00Z");
    });
  });
});
