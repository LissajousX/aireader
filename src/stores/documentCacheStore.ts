import { create } from 'zustand';

interface CachedDocument {
  id: string;
  filePath: string;
  content: ArrayBuffer | string;
  type: 'pdf' | 'epub' | 'txt' | 'md';
  size: number;
  lastAccessed: number;
}

interface DocumentCacheState {
  cache: Map<string, CachedDocument>;
  maxCacheSize: number; // 默认 100MB
  currentCacheSize: number;
  
  // Actions
  getFromCache: (filePath: string) => CachedDocument | null;
  addToCache: (filePath: string, content: ArrayBuffer | string, type: CachedDocument['type']) => void;
  removeFromCache: (filePath: string) => void;
  clearCache: () => void;
  getCacheStats: () => { count: number; size: number; maxSize: number };
  setMaxCacheSize: (sizeMB: number) => void;
}

// LRU 缓存实现
export const useDocumentCacheStore = create<DocumentCacheState>((set, get) => ({
  cache: new Map(),
  maxCacheSize: 200 * 1024 * 1024, // 200MB
  currentCacheSize: 0,

  getFromCache: (filePath: string) => {
    const { cache } = get();
    const cached = cache.get(filePath);
    if (cached) {
      // 更新访问时间 (LRU)
      cached.lastAccessed = Date.now();
      set({ cache: new Map(cache) });
      return cached;
    }
    return null;
  },

  addToCache: (filePath: string, content: ArrayBuffer | string, type: CachedDocument['type']) => {
    const { cache, maxCacheSize, currentCacheSize } = get();
    
    // 计算内容大小
    const size = typeof content === 'string' 
      ? new Blob([content]).size 
      : content.byteLength;
    
    // 如果单个文件超过最大缓存容量，无法缓存
    if (size > maxCacheSize) {
      return;
    }
    
    // 需要清理空间
    let newCacheSize = currentCacheSize;
    const newCache = new Map(cache);

    const existing = newCache.get(filePath);
    if (existing) {
      newCacheSize -= existing.size;
      newCache.delete(filePath);
    }
    
    // LRU: 移除最久未访问的文档直到有足够空间
    while (newCacheSize + size > maxCacheSize && newCache.size > 0) {
      let oldestKey = '';
      let oldestTime = Infinity;
      
      newCache.forEach((doc, key) => {
        if (doc.lastAccessed < oldestTime) {
          oldestTime = doc.lastAccessed;
          oldestKey = key;
        }
      });
      
      if (oldestKey) {
        const removed = newCache.get(oldestKey);
        if (removed) {
          newCacheSize -= removed.size;
          newCache.delete(oldestKey);
        }
      }
    }
    
    // 添加新文档
    const newDoc: CachedDocument = {
      id: crypto.randomUUID(),
      filePath,
      content,
      type,
      size,
      lastAccessed: Date.now(),
    };
    
    newCache.set(filePath, newDoc);
    newCacheSize += size;
    
    set({ cache: newCache, currentCacheSize: newCacheSize });
  },

  removeFromCache: (filePath: string) => {
    const { cache, currentCacheSize } = get();
    const doc = cache.get(filePath);
    if (doc) {
      const newCache = new Map(cache);
      newCache.delete(filePath);
      set({ 
        cache: newCache, 
        currentCacheSize: currentCacheSize - doc.size 
      });
    }
  },

  clearCache: () => {
    set({ cache: new Map(), currentCacheSize: 0 });
  },

  getCacheStats: () => {
    const { cache, currentCacheSize, maxCacheSize } = get();
    return {
      count: cache.size,
      size: currentCacheSize,
      maxSize: maxCacheSize,
    };
  },

  setMaxCacheSize: (sizeMB: number) => {
    const clamped = Math.max(50, Math.min(1024, Math.floor(sizeMB)));
    set({ maxCacheSize: clamped * 1024 * 1024 });
  },
}));
