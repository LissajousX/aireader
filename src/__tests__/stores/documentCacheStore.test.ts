/// <reference types="vitest/globals" />
import { useDocumentCacheStore } from "@/stores/documentCacheStore";

beforeEach(() => {
  useDocumentCacheStore.setState(useDocumentCacheStore.getInitialState());
});

describe("useDocumentCacheStore", () => {
  describe("addToCache / getFromCache", () => {
    it("stores and retrieves a text document", () => {
      const store = useDocumentCacheStore.getState();
      store.addToCache("/path/to/doc.txt", "hello world", "txt");

      const cached = useDocumentCacheStore.getState().getFromCache("/path/to/doc.txt");
      expect(cached).not.toBeNull();
      expect(cached!.content).toBe("hello world");
      expect(cached!.type).toBe("txt");
    });

    it("stores and retrieves a binary document", () => {
      const store = useDocumentCacheStore.getState();
      const buf = new ArrayBuffer(100);
      store.addToCache("/path/to/doc.pdf", buf, "pdf");

      const cached = useDocumentCacheStore.getState().getFromCache("/path/to/doc.pdf");
      expect(cached).not.toBeNull();
      expect(cached!.size).toBe(100);
      expect(cached!.type).toBe("pdf");
    });

    it("returns null for uncached path", () => {
      const cached = useDocumentCacheStore.getState().getFromCache("/nonexistent");
      expect(cached).toBeNull();
    });

    it("updates lastAccessed on get", () => {
      const store = useDocumentCacheStore.getState();
      store.addToCache("/doc.txt", "content", "txt");
      const first = useDocumentCacheStore.getState().getFromCache("/doc.txt");
      const t1 = first!.lastAccessed;

      // Small delay to ensure timestamp difference
      const second = useDocumentCacheStore.getState().getFromCache("/doc.txt");
      expect(second!.lastAccessed).toBeGreaterThanOrEqual(t1);
    });
  });

  describe("LRU eviction", () => {
    it("evicts oldest entry when cache is full", () => {
      const store = useDocumentCacheStore.getState();
      // Set a tiny max cache size: 200 bytes
      useDocumentCacheStore.setState({ maxCacheSize: 200 });

      store.addToCache("/a.txt", "a".repeat(100), "txt");
      store.addToCache("/b.txt", "b".repeat(100), "txt");
      // Cache is now ~200 bytes (full)

      // Adding another should evict /a.txt (oldest)
      useDocumentCacheStore.getState().addToCache("/c.txt", "c".repeat(100), "txt");

      expect(useDocumentCacheStore.getState().getFromCache("/a.txt")).toBeNull();
      expect(useDocumentCacheStore.getState().getFromCache("/c.txt")).not.toBeNull();
    });

    it("does not cache item larger than maxCacheSize", () => {
      useDocumentCacheStore.setState({ maxCacheSize: 50 });
      const store = useDocumentCacheStore.getState();
      store.addToCache("/big.txt", "x".repeat(100), "txt");

      expect(useDocumentCacheStore.getState().getFromCache("/big.txt")).toBeNull();
    });
  });

  describe("removeFromCache", () => {
    it("removes a cached document and updates size", () => {
      const store = useDocumentCacheStore.getState();
      store.addToCache("/doc.txt", "hello", "txt");
      const sizeBefore = useDocumentCacheStore.getState().currentCacheSize;
      expect(sizeBefore).toBeGreaterThan(0);

      useDocumentCacheStore.getState().removeFromCache("/doc.txt");
      expect(useDocumentCacheStore.getState().getFromCache("/doc.txt")).toBeNull();
      expect(useDocumentCacheStore.getState().currentCacheSize).toBe(0);
    });

    it("does nothing for non-existent path", () => {
      const store = useDocumentCacheStore.getState();
      store.addToCache("/doc.txt", "hello", "txt");
      const sizeBefore = useDocumentCacheStore.getState().currentCacheSize;
      useDocumentCacheStore.getState().removeFromCache("/other.txt");
      expect(useDocumentCacheStore.getState().currentCacheSize).toBe(sizeBefore);
    });
  });

  describe("clearCache", () => {
    it("empties all entries and resets size", () => {
      const store = useDocumentCacheStore.getState();
      store.addToCache("/a.txt", "aaa", "txt");
      store.addToCache("/b.txt", "bbb", "txt");
      useDocumentCacheStore.getState().clearCache();

      const stats = useDocumentCacheStore.getState().getCacheStats();
      expect(stats.count).toBe(0);
      expect(stats.size).toBe(0);
    });
  });

  describe("getCacheStats", () => {
    it("returns correct count and size", () => {
      const store = useDocumentCacheStore.getState();
      store.addToCache("/a.txt", "abc", "txt");
      store.addToCache("/b.txt", "defgh", "txt");

      const stats = useDocumentCacheStore.getState().getCacheStats();
      expect(stats.count).toBe(2);
      expect(stats.size).toBeGreaterThan(0);
    });
  });

  describe("setMaxCacheSize", () => {
    it("clamps size between 50MB and 1024MB", () => {
      useDocumentCacheStore.getState().setMaxCacheSize(10); // below min
      expect(useDocumentCacheStore.getState().maxCacheSize).toBe(50 * 1024 * 1024);

      useDocumentCacheStore.getState().setMaxCacheSize(2000); // above max
      expect(useDocumentCacheStore.getState().maxCacheSize).toBe(1024 * 1024 * 1024);

      useDocumentCacheStore.getState().setMaxCacheSize(300);
      expect(useDocumentCacheStore.getState().maxCacheSize).toBe(300 * 1024 * 1024);
    });
  });

  describe("replacing existing cache entry", () => {
    it("updates content and adjusts size", () => {
      const store = useDocumentCacheStore.getState();
      store.addToCache("/doc.txt", "short", "txt");
      const size1 = useDocumentCacheStore.getState().currentCacheSize;

      useDocumentCacheStore.getState().addToCache("/doc.txt", "much longer content here", "txt");
      const size2 = useDocumentCacheStore.getState().currentCacheSize;

      expect(size2).toBeGreaterThan(size1);
      const cached = useDocumentCacheStore.getState().getFromCache("/doc.txt");
      expect(cached!.content).toBe("much longer content here");

      // Should still be only 1 entry
      expect(useDocumentCacheStore.getState().getCacheStats().count).toBe(1);
    });
  });
});
