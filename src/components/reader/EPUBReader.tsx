import { useEffect, useMemo, useRef, useState } from "react";
import ePub, { Book, Rendition } from "epubjs";
import type { TextSelection } from "@/types";
import { useDocumentStore } from "@/stores/documentStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { FloatingReaderToolbar } from "@/components/reader/FloatingReaderToolbar";
import { ResizeHandle } from "@/components/ui/ResizeHandle";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "@/i18n";
import { getErrorMessage } from "@/lib/utils";

interface EPUBReaderProps {
  filePath: string;
  onTextSelect: (selection: TextSelection) => void;
  onFatalError?: (message: string) => void;
}

export function EPUBReader({ filePath, onTextSelect, onFatalError }: EPUBReaderProps) {
  const { b } = useI18n();
  const viewerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const onTextSelectRef = useRef(onTextSelect);
  const firstRenderedRef = useRef(false);
  const lastAssetUrlRef = useRef<string>('');
  const opfAbsPathRef = useRef<string>('');
  const opfDirAbsPathRef = useRef<string>('');
  const extractedRootAbsPathRef = useRef<string>('');
  const opfDirUrlRef = useRef<string>('');
  const opfParentDirUrlRef = useRef<string>('');
  const opfDirNameRef = useRef<string>('');
  const pageTurnInFlightRef = useRef(false);
  const pendingTurnRef = useRef(false);
  const pendingTurnTimerRef = useRef<number | null>(null);
  const lastWheelTurnAtRef = useRef(0);
  const coverVisibleRef = useRef(false);
  const lastRelocatedCfiRef = useRef<string | null>(null);
  const restoreGuardRef = useRef<{ enabled: boolean; savedPage: number; startedAt: number } | null>(null);
  const { currentPage, setCurrentPage, updateDocumentProgress, setDocumentTotalPages, currentDocument } = useDocumentStore();
  const markdownScale = useSettingsStore((s) => s.markdownScale);
  const setMarkdownScale = useSettingsStore((s) => s.setMarkdownScale);
  const saveSettings = useSettingsStore((s) => s.saveSettings);
  const currentPageRef = useRef(currentPage);
  const lastRelocatedPageRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState<string>('');
  const openSeqRef = useRef(0);
  const resizeRafRef = useRef<number | null>(null);
  const [appDark, setAppDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [docDarkOverride, setDocDarkOverride] = useState<boolean | null>(null);
  const [hasLocations, setHasLocations] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverVisible, setCoverVisible] = useState(false);
  const [tocItems, setTocItems] = useState<any[]>([]);
  const [fallbackDisplayed, setFallbackDisplayed] = useState<{ page: number; total: number } | null>(null);
  const hasLocationsRef = useRef(hasLocations);
  const fallbackDisplayedRef = useRef(fallbackDisplayed);
  const [tocOpen, setTocOpen] = useState(false);
  const [tocWidth, setTocWidth] = useState(240);
  const [activeHref, setActiveHref] = useState<string>('');
  const tocScrollRef = useRef<HTMLDivElement>(null);
  const ensureLocationsPromiseRef = useRef<Promise<void> | null>(null);

  const [readingMode, setReadingMode] = useState<'paginated' | 'scrolled'>('paginated');
  const readingModeRef = useRef<'paginated' | 'scrolled'>(readingMode);


  // 保持回调引用最新
  useEffect(() => {
    onTextSelectRef.current = onTextSelect;
  }, [onTextSelect]);

  useEffect(() => {
    readingModeRef.current = readingMode;
  }, [readingMode]);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    coverVisibleRef.current = coverVisible;
  }, [coverVisible]);

  useEffect(() => {
    hasLocationsRef.current = hasLocations;
  }, [hasLocations]);

  useEffect(() => {
    fallbackDisplayedRef.current = fallbackDisplayed;
  }, [fallbackDisplayed]);

  const normalizeHref = useMemo(() => {
    return (raw: unknown): string => {
      if (typeof raw !== 'string') return '';
      let s = raw.trim();
      if (!s) return '';
      try {
        s = decodeURIComponent(s);
      } catch {
        // ignore
      }
      return s.replace(/\\/g, '/').split('#')[0].split('?')[0].replace(/^\//, '');
    };
  }, []);

  const locationsKey = useMemo(() => `epub_locations:${filePath}`, [filePath]);

  const ensureLocationsReady = async () => {
    const book = bookRef.current as any;
    if (!book) return;

    const totalExisting =
      (book.locations as any)?.total ||
      (book.locations as any)?.locations?.length ||
      0;
    if (totalExisting > 0) return;

    if (ensureLocationsPromiseRef.current) {
      await ensureLocationsPromiseRef.current;
      return;
    }

    ensureLocationsPromiseRef.current = (async () => {
      let loaded = false;
      try {
        const stored = localStorage.getItem(locationsKey);
        if (stored && stored.trim()) {
          await (book.locations as any).load(stored);
          loaded = true;
        }
      } catch {
        // ignore
      }

      if (!loaded) {
        await (book.locations as any).generate(4096);
        try {
          const saved = (book.locations as any).save?.();
          if (typeof saved === 'string' && saved.trim()) {
            localStorage.setItem(locationsKey, saved);
          }
        } catch {
          // ignore
        }
      }

      const totalNow =
        (book.locations as any)?.total ||
        (book.locations as any)?.locations?.length ||
        1;

      const docNow = useDocumentStore.getState().currentDocument;
      if (!docNow || docNow.path !== filePath) {
        return;
      }
      setDocumentTotalPages(docNow.id, totalNow);
      setHasLocations(true);
      setFallbackDisplayed(null);






      try {
        const cfi = lastRelocatedCfiRef.current;
        if (cfi && (book.locations as any)?.locationFromCfi) {
          const loc = (book.locations as any).locationFromCfi(cfi);
          if (typeof loc === 'number' && Number.isFinite(loc) && loc >= 0) {
            const total =
              (book.locations as any)?.total ||
              (book.locations as any)?.locations?.length ||
              totalNow ||
              1;
            const progress = total > 1 ? Math.min(Math.max(loc / Math.max(1, total), 0), 1) : 0;
            const page = total > 1 ? Math.min(total, Math.max(1, Math.floor(progress * (total - 1) + 1))) : 1;
            lastRelocatedPageRef.current = page;
            if (page !== currentPageRef.current) {
              setCurrentPage(page);
            }
            updateDocumentProgress(docNow.id, page, progress);
          }
        }
      } catch {
      }
    })().finally(() => {
      ensureLocationsPromiseRef.current = null;
    });

    await ensureLocationsPromiseRef.current;
  };

  useEffect(() => {
    if (!tocOpen) return;
    if (!activeHref) return;
    const container = tocScrollRef.current;
    if (!container) return;

    const key = activeHref;
    requestAnimationFrame(() => {
      const el = container.querySelector(`[data-href="${CSS.escape(key)}"]`) as HTMLElement | null;
      el?.scrollIntoView({ block: 'nearest' });
    });
  }, [tocOpen, activeHref]);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setAppDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setDocDarkOverride(null);
  }, [appDark]);

  const effectiveDocDark = docDarkOverride ?? appDark;
  const totalPages = currentDocument?.totalPages || 1;

  const requestPageTurn = (dir: 'prev' | 'next') => {
    if (readingModeRef.current === 'scrolled') return;
    if (pageTurnInFlightRef.current) return;
    if (coverVisibleRef.current) return;
    const r = renditionRef.current as any;
    if (!r) return;

    pageTurnInFlightRef.current = true;
    pendingTurnRef.current = true;
    if (pendingTurnTimerRef.current) {
      window.clearTimeout(pendingTurnTimerRef.current);
      pendingTurnTimerRef.current = null;
    }
    pendingTurnTimerRef.current = window.setTimeout(() => {
      pendingTurnTimerRef.current = null;
      pendingTurnRef.current = false;
      pageTurnInFlightRef.current = false;
    }, 2500);

    try {
      if (dir === 'prev') {
        void Promise.resolve(r.prev?.());
      } else {
        void Promise.resolve(r.next?.());
      }
    } catch {
      pendingTurnRef.current = false;
      pageTurnInFlightRef.current = false;
    }
  };

  useEffect(() => {
    let mounted = true;
    const seq = ++openSeqRef.current;
    let watchdogTimer: number | null = null;
    const originalFetch = window.fetch;
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    const isEpubAssetRequest = (urlStr: string) =>
      typeof urlStr === 'string' &&
      (
        urlStr.includes('epub_extracted') ||
        urlStr.includes('asset.localhost') ||
        urlStr.startsWith('asset://') ||
        urlStr.startsWith('asset:')
      );

    const normalizeRelPath = (raw: string): string | null => {
      const s = String(raw || '').replace(/\\/g, '/').replace(/^\/+/, '');
      const parts = s.split('/');
      const out: string[] = [];
      for (const p of parts) {
        if (!p || p === '.') continue;
        if (p === '..') {
          if (out.length === 0) return null;
          out.pop();
          continue;
        }
        out.push(p);
      }
      return out.join('/');
    };

    const rewriteRelToAssetUrl = (relPath: string, search = '', hash = ''): string | null => {
      const norm = normalizeRelPath(relPath);
      if (!norm) return null;
      const opfBaseAbs = String(opfDirAbsPathRef.current || '').replace(/\\/g, '/').replace(/\/+$/, '');
      const rootBaseAbs = String(extractedRootAbsPathRef.current || '').replace(/\\/g, '/').replace(/\/+$/, '');
      const baseAbs = norm === 'mimetype' || norm.startsWith('META-INF/') ? (rootBaseAbs || opfBaseAbs) : opfBaseAbs;
      if (!baseAbs) return null;
      const abs = `${baseAbs}/${norm}`;
      const out = convertFileSrc(abs);
      return `${out}${search || ''}${hash || ''}`;
    };

    const rewriteAssetUrl = (rawUrl: string): string => {
      if (!rawUrl) return rawUrl;

      {
        const rawNoHash = rawUrl.split('#')[0];
        const rawNoQuery = rawNoHash.split('?')[0];
        const isResourceLike = /\.(xhtml|html|htm|opf|ncx|css|svg|png|jpe?g|gif|webp|avif|ttf|otf|woff2?|js|mjs|json)$/i.test(rawNoQuery);
        const isBareRel =
          isResourceLike &&
          !rawUrl.includes('://') &&
          !rawUrl.startsWith('data:') &&
          !rawUrl.startsWith('blob:') &&
          !rawUrl.startsWith('file:') &&
          !rawUrl.startsWith('asset:') &&
          !/^[a-zA-Z]:[\\/]/.test(rawUrl) &&
          !rawUrl.startsWith('/') &&
          !rawUrl.startsWith('\\');
        if (isBareRel) {
          const rewritten = rewriteRelToAssetUrl(rawUrl);
          if (rewritten) return rewritten;
        }
      }

      if (rawUrl.startsWith('/') && !rawUrl.startsWith('//') && !/^\/[a-zA-Z]:\//.test(rawUrl)) {
        const rawNoHash = rawUrl.split('#')[0];
        const rawNoQuery = rawNoHash.split('?')[0];
        const isResourceLike = /\.(xhtml|html|htm|opf|ncx|css|svg|png|jpe?g|gif|webp|avif|ttf|otf|woff2?|js|mjs|json)$/i.test(rawNoQuery);
        if (isResourceLike) {
          const relPath = rawUrl.replace(/^\/+/, '');
          const rewritten = rewriteRelToAssetUrl(relPath);
          if (rewritten) return rewritten;
        }
      }

      // Handle both Windows (https://asset.localhost/) and macOS/Linux (asset://localhost/) formats
      if (!rawUrl.includes('asset.localhost') && !rawUrl.startsWith('asset://')) return rawUrl;

      try {
        const u = new URL(rawUrl);
        const isAssetUrl = u.hostname === 'asset.localhost' || (u.protocol === 'asset:' && u.hostname === 'localhost');
        if (!isAssetUrl) return rawUrl;
        if (u.pathname.includes('epub_extracted')) return rawUrl;
        if (/^\/[a-zA-Z]%3A(%5C|\/)/i.test(u.pathname)) return rawUrl;

        // On macOS, convertFileSrc encodes the entire path, so %2F appears instead of /
        // Decode the pathname to get the actual relative path
        let relPath = u.pathname.replace(/^\/+/, '');
        try {
          relPath = decodeURIComponent(relPath).replace(/^\/+/, '');
        } catch {}
        // If the decoded path is absolute (starts with / or drive letter), it's already a full path from convertFileSrc
        // — this means the URL is valid and points to the right file
        if (relPath.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(relPath)) return rawUrl;

        const rewritten = rewriteRelToAssetUrl(relPath, u.search, u.hash);
        if (rewritten) return rewritten;
        return rawUrl;
      } catch {
        return rawUrl;
      }
    };

    // ── Shared helpers (used by both spine hooks and rendition content hooks) ──

    const resolveToAssetUrlForSection = (raw: string, sectionBaseAbs: string): string | null => {
      const v = String(raw || '').trim();
      if (!v) return null;
      if (v.startsWith('#')) return null;
      const lower = v.toLowerCase();
      if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('data:') || lower.startsWith('blob:') || lower.startsWith('mailto:') || lower.startsWith('tel:')) {
        if (v.includes('asset.localhost') || lower.startsWith('asset:')) return rewriteAssetUrl(v);
        return null;
      }
      if (v.includes('asset.localhost') || lower.startsWith('asset:')) return rewriteAssetUrl(v);
      let rel = v.replace(/\\/g, '/');
      if (rel.startsWith('/') && !rel.startsWith('//') && !/^\/[a-zA-Z]:\//.test(rel)) {
        rel = rel.replace(/^\/+/, '');
        return rewriteRelToAssetUrl(rel) || null;
      }
      const norm = normalizeRelPath(rel);
      if (!norm) return null;
      return convertFileSrc(`${sectionBaseAbs}/${norm}`);
    };

    const sharedRewriteInlineCss = (text: string, baseDirAbs: string): string => {
      if (!text) return text;
      const base = String(baseDirAbs || '').replace(/\\/g, '/').replace(/\/+$/, '');
      if (!base) return text;
      let out = text;
      out = out.replace(/@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)'|([^\s\)\;]+))\s*\)?\s*([^;]*)\;/gi, (full, a, b, c, rest) => {
        const href = String(a || b || c || '').trim();
        if (!href) return full;
        const lo = href.toLowerCase();
        if (lo.startsWith('data:') || lo.startsWith('http://') || lo.startsWith('https://') || lo.startsWith('blob:') || lo.startsWith('asset:')) return full;
        let rw: string | null = null;
        if (href.startsWith('/') && !href.startsWith('//') && !/^\/[a-zA-Z]:\//.test(href)) {
          rw = rewriteRelToAssetUrl(href.replace(/^\/+/, ''));
        } else {
          const norm = normalizeRelPath(href.replace(/\\/g, '/'));
          if (norm) rw = convertFileSrc(`${base}/${norm}`);
        }
        if (!rw) return full;
        const tail = String(rest || '').trim();
        return `@import url("${rw}")${tail ? ` ${tail}` : ''};`;
      });
      out = out.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (full, q, raw) => {
        const u = String(raw || '').trim();
        if (!u) return full;
        const lo = u.toLowerCase();
        if (lo.startsWith('data:') || lo.startsWith('http://') || lo.startsWith('https://') || lo.startsWith('blob:') || lo.startsWith('asset:')) return full;
        let rw: string | null = null;
        if (u.startsWith('/') && !u.startsWith('//') && !/^\/[a-zA-Z]:\//.test(u)) {
          rw = rewriteRelToAssetUrl(u.replace(/^\/+/, ''));
        } else {
          const norm = normalizeRelPath(u.replace(/\\/g, '/'));
          if (norm) rw = convertFileSrc(`${base}/${norm}`);
        }
        if (!rw) return full;
        return `url(${q || '"'}${rw}${q || '"'})`;
      });
      return out;
    };

    const fixLeadingSlashHrefs = (items: any[] | undefined) => {
      if (!Array.isArray(items)) return;
      for (const it of items) {
        if (it && typeof it.href === 'string' && it.href.startsWith('/') && !it.href.startsWith('//')) {
          it.href = it.href.replace(/^\/+/, '');
        }
      }
    };

    const patchPathResolve = (pathObj: any) => {
      if (pathObj && typeof pathObj.resolve === 'function' && !pathObj.__aireader_resolve_patched) {
        pathObj.__aireader_resolve_patched = true;
        const origResolve = pathObj.resolve.bind(pathObj);
        pathObj.resolve = (href: any, absolute?: any) => {
          const out = origResolve(href, absolute);
          return typeof out === 'string' ? rewriteAssetUrl(out) : out;
        };
      }
    };

    const fixSpineAndManifestPaths = (book: any) => {
      try { fixLeadingSlashHrefs(book?.spine?.spineItems); } catch {}
      try { fixLeadingSlashHrefs(book?.spine?.items); } catch {}
      try {
        const manifest = book?.packaging?.manifest;
        if (manifest && typeof manifest === 'object') {
          for (const k of Object.keys(manifest)) {
            const it = manifest[k];
            if (it && typeof it.href === 'string' && it.href.startsWith('/') && !it.href.startsWith('//')) {
              it.href = it.href.replace(/^\/+/, '');
            }
          }
        }
      } catch {}
      try { patchPathResolve(book?.path); } catch {}
    };

    const patchDocAssets = (doc: any, sectionBaseAbs: string) => {
      try {
        const els = Array.from(doc.querySelectorAll('[src],[href],[poster]')) as any[];
        for (const el of els) {
          const tag = String(el?.tagName || '').toLowerCase();
          for (const attr of ['src', 'href', 'poster'] as const) {
            const v = el.getAttribute?.(attr);
            if (!v) continue;
            if (attr === 'href' && tag !== 'link' && tag !== 'image' && tag !== 'use') continue;
            const rw = resolveToAssetUrlForSection(v, sectionBaseAbs);
            if (rw && rw !== v) {
              el.setAttribute(attr, rw);
            } else if (typeof v === 'string' && v.includes('\\')) {
              el.setAttribute(attr, v.replace(/\\/g, '/'));
            }
          }
        }
      } catch {}
      try {
        for (const s of Array.from(doc.querySelectorAll('style')) as any[]) {
          const t = s?.textContent || '';
          const next = sharedRewriteInlineCss(t, sectionBaseAbs);
          if (next !== t) s.textContent = next;
        }
      } catch {}
      try {
        for (const el of Array.from(doc.querySelectorAll('[style]')) as any[]) {
          const st = el?.getAttribute?.('style');
          if (!st) continue;
          const next = sharedRewriteInlineCss(st, sectionBaseAbs);
          if (next !== st) el.setAttribute('style', next);
        }
      } catch {}
    };

    // ── End shared helpers ──

    (window as any).fetch = async (input: any, init?: any) => {
      let reqInfo: any = input;
      let urlStr = typeof reqInfo === 'string' ? reqInfo : (reqInfo?.url ? String(reqInfo.url) : '');

      const rewritten = typeof urlStr === 'string' ? rewriteAssetUrl(urlStr) : urlStr;
      if (rewritten !== urlStr) {
        if (/\.(opf|xhtml|html|css)$/i.test(urlStr)) {
          console.warn(`[EPUB][rewrite] ${urlStr} -> ${rewritten}`);
        }
        urlStr = rewritten;
        try {
          if (typeof reqInfo === 'string') {
            reqInfo = rewritten;
          } else if (reqInfo instanceof Request) {
            reqInfo = new Request(rewritten, reqInfo);
          } else {
            reqInfo = rewritten;
          }
        } catch {
          reqInfo = rewritten;
        }
      }

      const isEpubAsset = isEpubAssetRequest(urlStr);
      if (!isEpubAsset) {
        return await originalFetch(reqInfo, init as any);
      }

      const shouldTrace = /\.(opf|xhtml|html|css)$/i.test(urlStr);
      const t0 = performance.now();

      lastAssetUrlRef.current = urlStr;

      const hasSignal = !!(init && (init as any).signal);
      const controller = hasSignal ? null : new AbortController();
      const timer = hasSignal ? null : window.setTimeout(() => controller?.abort(), 120000);
      try {
        const nextInit = init ? { ...(init as any) } : {};
        if (!hasSignal && controller) nextInit.signal = controller.signal;
        const resp = await originalFetch(reqInfo, nextInit);
        try {
          if (shouldTrace && resp && typeof resp.ok === 'boolean' && !resp.ok) {
            console.error(`[EPUB][fetch] http_${(resp as any).status} (${(performance.now() - t0).toFixed(0)}ms) ${urlStr}`);
          }
        } catch {
        }
        return resp;
      } catch (e) {
        if (shouldTrace) {
          console.error(`[EPUB][fetch] failed (${(performance.now() - t0).toFixed(0)}ms) ${urlStr}`, e);
        }
        throw e;
      } finally {
        if (timer) window.clearTimeout(timer);
      }
    };

    (XMLHttpRequest.prototype as any).open = function (...args: any[]) {
      try {
        const url = args[1];
        const raw = typeof url === 'string' ? url : String(url ?? '');
        const rewritten = rewriteAssetUrl(raw);
        args[1] = rewritten;
        (this as any).__epub_url = rewritten;
        (this as any).__epub_t0 = performance.now();
      } catch {
      }
      return (originalXHROpen as any).apply(this, args);
    };

    (XMLHttpRequest.prototype as any).send = function (...args: any[]) {
      const urlStr = typeof (this as any).__epub_url === 'string' ? (this as any).__epub_url : '';
      const isEpubAsset =
        typeof urlStr === 'string' &&
        (
          urlStr.includes('epub_extracted') ||
          urlStr.includes('asset.localhost') ||
          urlStr.startsWith('asset://') ||
          urlStr.startsWith('asset:')
        );
      if (!isEpubAsset) {
        return (originalXHRSend as any).apply(this, args);
      }

      lastAssetUrlRef.current = urlStr;

      const shouldTrace = /\.(opf|ncx|xhtml|html|css|svg|js|json|woff2?|ttf|otf)$/i.test(urlStr);
      const t0 = typeof (this as any).__epub_t0 === 'number' ? (this as any).__epub_t0 : performance.now();

      try {
        const timeout = (this as any).timeout;
        if (typeof timeout !== 'number' || timeout <= 0) {
          (this as any).timeout = 120000;
        }
      } catch {
      }

      const onDone = (tag: string, err?: any) => {
        if (!shouldTrace) return;
        const cost = (performance.now() - t0).toFixed(0);
        let status: number | undefined;
        let respUrl = urlStr;
        try {
          const s = (this as any).status;
          if (typeof s === 'number' && Number.isFinite(s)) status = s;
          const r = (this as any).responseURL;
          if (typeof r === 'string' && r) respUrl = r;
        } catch {
        }
        if (respUrl && respUrl !== lastAssetUrlRef.current && isEpubAssetRequest(respUrl)) {
          lastAssetUrlRef.current = respUrl;
        }
        if (tag === 'load' && (!status || status < 400)) {
          return;
        }
        const suffix = typeof status === 'number' ? ` status=${status}` : '';
        console.error(`[EPUB][xhr] ${tag} (${cost}ms) ${respUrl}${suffix}`, err);
      };

      const onLoad = () => onDone('load');
      const onError = (e: any) => onDone('error', e);
      const onAbort = (e: any) => onDone('abort', e);
      const onTimeout = (e: any) => onDone('timeout', e);

      try {
        this.addEventListener('load', onLoad);
        this.addEventListener('error', onError);
        this.addEventListener('abort', onAbort);
        this.addEventListener('timeout', onTimeout);
      } catch {
      }

      try {
        return (originalXHRSend as any).apply(this, args);
      } finally {
        const cleanup = () => {
          try {
            this.removeEventListener('load', onLoad);
            this.removeEventListener('error', onError);
            this.removeEventListener('abort', onAbort);
            this.removeEventListener('timeout', onTimeout);
          } catch {
          }
        };
        try {
          this.addEventListener('loadend', cleanup, { once: true } as any);
        } catch {
          setTimeout(cleanup, 0);
        }
      }
    };

    const safeSetError = (msg: string) => {
      if (!mounted) return;
      if (seq !== openSeqRef.current) return;
      const detail = lastAssetUrlRef.current ? `\n${lastAssetUrlRef.current}` : '';
      setError(msg + detail);
      setLoading(false);
      try {
        onFatalError?.(msg);
      } catch {
      }
    };

    const setStage = (s: string) => {
      if (!mounted) return;
      if (seq !== openSeqRef.current) return;
      setLoadingStage(s);
    };
    
    const loadEpub = async () => {
      try {
        setLoading(true);
        setError(null);
        setLoadingStage('');
        firstRenderedRef.current = false;
        setHasLocations(false);
        setCoverUrl(null);
        setCoverVisible(false);
        setTocItems([]);
        setTocOpen(false);
        setActiveHref('');
        setFallbackDisplayed(null);
        ensureLocationsPromiseRef.current = null;
        watchdogTimer = window.setTimeout(() => {
          if (!mounted) return;
          if (seq !== openSeqRef.current) return;
          if (firstRenderedRef.current) return;
          safeSetError('EPUB loading stuck (180s), check console logs');
        }, 180000);

        const withTimeout = async <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
          let timer: number | undefined;
          try {
            const timeoutPromise = new Promise<T>((_, reject) => {
              timer = window.setTimeout(() => reject(new Error(label)), ms);
            });
            return await Promise.race([promise, timeoutPromise]);
          } finally {
            if (timer) {
              window.clearTimeout(timer);
            }
          }
        };

        const ensureLatest = () => {
          if (!mounted) return false;
          if (seq !== openSeqRef.current) return false;
          return true;
        };

        const lastCfiKey = `epub_last_cfi:${filePath}`;

        // 清理旧的资源
        if (bookRef.current) {
          try {
            bookRef.current.destroy();
          } catch (e) {
            console.warn("[EPUB] 销毁旧实例时出错:", e);
          }
          bookRef.current = null;
        }

        if (!ensureLatest()) return;

        setStage('Initializing');
        let book = ePub();
        bookRef.current = book;

        setStage('Extracting');
        const opfAbs = await withTimeout(invoke<string>('epub_extract', { path: filePath }), 120000, 'EPUB解压超时(120s)');
        if (!ensureLatest()) return;
        const opfAbsNorm = String(opfAbs || '').replace(/\\/g, '/');
        opfAbsPathRef.current = opfAbsNorm;
        try {
          const p = opfAbsNorm;
          const idx = p.lastIndexOf('/');
          opfDirAbsPathRef.current = idx >= 0 ? p.slice(0, idx) : '';
          const dir = opfDirAbsPathRef.current;
          const idx2 = dir.lastIndexOf('/');
          extractedRootAbsPathRef.current = idx2 >= 0 ? dir.slice(0, idx2) : dir;
        } catch {
          opfDirAbsPathRef.current = '';
          extractedRootAbsPathRef.current = '';
        }
        const opfUrl = convertFileSrc(opfAbsNorm);
        try {
          const u = new URL(opfUrl);
          const dirUrl = new URL('.', u);
          const parentUrl = new URL('..', dirUrl);
          opfDirUrlRef.current = dirUrl.toString();
          opfParentDirUrlRef.current = parentUrl.toString();
          const parts = dirUrl.pathname.split('/').filter(Boolean);
          opfDirNameRef.current = parts.length > 0 ? parts[parts.length - 1] : '';
        } catch {
          opfDirUrlRef.current = '';
          opfParentDirUrlRef.current = '';
          opfDirNameRef.current = '';
        }
        setStage('Opening');
        await withTimeout(book.open(opfUrl, 'opf' as any), 120000, 'EPUB打开超时(120s)');
        if (!ensureLatest()) return;

        try {
          const spineHooks = (book as any)?.spine?.hooks?.content;
          if (spineHooks && typeof spineHooks.register === 'function' && !(spineHooks as any).__aireader_asset_rewrite) {
            (spineHooks as any).__aireader_asset_rewrite = true;
            spineHooks.register((doc: any, section: any) => {
              try {
                if (!doc || typeof doc.querySelectorAll !== 'function') return;

                const sectionHrefRaw = (() => {
                  try {
                    const h = section?.href;
                    return typeof h === 'string' ? h : '';
                  } catch {
                    return '';
                  }
                })();

                const sectionHref = String(sectionHrefRaw || '').replace(/\\/g, '/');
                const sectionNorm = normalizeRelPath(sectionHref) || '';
                const sectionDirRel = (() => {
                  const idx = sectionNorm.lastIndexOf('/');
                  return idx >= 0 ? sectionNorm.slice(0, idx) : '';
                })();

                const opfBaseAbs = String(opfDirAbsPathRef.current || '').replace(/\\/g, '/').replace(/\/+$/, '');
                const sectionBaseAbs = sectionDirRel ? `${opfBaseAbs}/${sectionDirRel}` : opfBaseAbs;

                try {
                  const links = Array.from(doc.querySelectorAll('link[rel~="stylesheet"][href]')) as any[];
                  for (const linkEl of links) {
                    try {
                      const href = linkEl.getAttribute('href');
                      if (href && href.includes('\\')) {
                        linkEl.setAttribute('href', href.replace(/\\/g, '/'));
                      }
                      linkEl.setAttribute('rel', 'aireader-stylesheet');
                    } catch {
                    }
                  }
                } catch {
                }

                patchDocAssets(doc, sectionBaseAbs);
              } catch {
              }

              try {
                const onDblClick = (e: MouseEvent) => {
                  try {
                    const clientX = (e as any).clientX;
                    const clientY = (e as any).clientY;

                    const getTokenAtPoint = (): string => {
                      try {
                        const anyDoc = doc as any;
                        let container: Node | null = null;
                        let offset = 0;
                        if (typeof anyDoc.caretRangeFromPoint === 'function') {
                          const range = anyDoc.caretRangeFromPoint(clientX, clientY) as Range | null;
                          container = range?.startContainer || null;
                          offset = typeof range?.startOffset === 'number' ? range.startOffset : 0;
                        } else if (typeof anyDoc.caretPositionFromPoint === 'function') {
                          const pos = anyDoc.caretPositionFromPoint(clientX, clientY) as any;
                          container = pos?.offsetNode || null;
                          offset = typeof pos?.offset === 'number' ? pos.offset : 0;
                        }

                        const findTextIn = (n: Node | null, prefer: 'start' | 'end'): { node: Text; offset: number } | null => {
                          if (!n) return null;
                          if (n.nodeType === Node.TEXT_NODE) {
                            const t = (n as Text).textContent || '';
                            const o = prefer === 'end' ? t.length : 0;
                            return { node: n as Text, offset: o };
                          }
                          if (n.nodeType !== Node.ELEMENT_NODE) return null;
                          const walker = doc.createTreeWalker(n, NodeFilter.SHOW_TEXT);
                          if (prefer === 'start') {
                            const first = walker.nextNode() as Text | null;
                            if (!first) return null;
                            return { node: first, offset: 0 };
                          }
                          let last: Text | null = null;
                          while (walker.nextNode()) {
                            last = walker.currentNode as Text;
                          }
                          if (!last) return null;
                          const t = last.textContent || '';
                          return { node: last, offset: t.length };
                        };

                        const resolveTextPoint = (n: Node | null, off: number): { node: Text; offset: number } | null => {
                          if (!n) return null;
                          if (n.nodeType === Node.TEXT_NODE) return { node: n as Text, offset: off };
                          if (n.nodeType !== Node.ELEMENT_NODE) return null;
                          const el = n as Element;
                          const kids = Array.from(el.childNodes);
                          const idx = Math.min(Math.max(0, off), kids.length);
                          return (
                            findTextIn(kids[idx] || null, 'start') ||
                            findTextIn(kids[idx - 1] || null, 'end') ||
                            findTextIn(el, 'start')
                          );
                        };

                        const tp = resolveTextPoint(container, offset);
                        if (!tp) return '';
                        const text = tp.node.textContent || '';
                        if (!text) return '';
                        const i = Math.min(Math.max(0, tp.offset), text.length);

                        const isLatin = (ch: string) => /[A-Za-z]/.test(ch);
                        const isLatinWord = (ch: string) => /[A-Za-z-]/.test(ch);
                        const isCjk = (ch: string) => /[\u4e00-\u9fff]/.test(ch);

                        const center = text[i] || text[i - 1] || '';
                        if (isCjk(center)) {
                          let l = i;
                          let r = i;
                          while (l > 0 && isCjk(text[l - 1])) l--;
                          while (r < text.length && isCjk(text[r])) r++;
                          return text.slice(l, r).trim();
                        }

                        if (isLatin(center) || isLatin(text[i - 1] || '')) {
                          let l = i;
                          let r = i;
                          while (l > 0 && isLatinWord(text[l - 1])) l--;
                          while (r < text.length && isLatinWord(text[r])) r++;
                          return text.slice(l, r).trim();
                        }

                        return '';
                      } catch {
                        return '';
                      }
                    };

                    window.setTimeout(() => {
                      try {
                        const sel = doc.getSelection?.() || (doc.defaultView ? doc.defaultView.getSelection?.() : null);
                        const selected = sel && typeof sel.toString === 'function' ? sel.toString().trim() : '';
                        const word = selected && !/[\s\u00A0]/.test(selected) ? selected : getTokenAtPoint();
                        if (!word) return;

                        let x = clientX;
                        let y = clientY;
                        try {
                          const frameEl = doc.defaultView?.frameElement as HTMLElement | null;
                          if (frameEl && typeof frameEl.getBoundingClientRect === 'function') {
                            const r = frameEl.getBoundingClientRect();
                            x = (Number.isFinite(x) ? x : 0) + r.left;
                            y = (Number.isFinite(y) ? y : 0) + r.top;
                          }
                        } catch {
                        }

                        window.dispatchEvent(
                          new CustomEvent('aireader-iframe-dblclick', { detail: { word, x, y } })
                        );
                      } catch {
                      }
                    }, 0);
                  } catch {
                  }
                };
                if (!(doc as any).__aireader_dblclick_patched) {
                  (doc as any).__aireader_dblclick_patched = true;
                  doc.addEventListener('dblclick', onDblClick as any);
                }
              } catch {
              }
            });
          }
        } catch {
        }

        try { patchPathResolve((book as any)?.path); } catch {}

        // 等待packaging/spine加载完成，这对epubjs正确渲染是必要的
        const loaded: any = (book as any).loaded;
        if (loaded) {
          try {
            setStage('Parsing');
            const critical: Promise<unknown>[] = [];
            if (loaded.packaging && typeof loaded.packaging.then === 'function') critical.push(loaded.packaging);
            if (loaded.spine && typeof loaded.spine.then === 'function') critical.push(loaded.spine);
            if (critical.length > 0) {
              await withTimeout(Promise.all(critical), 60000, 'EPUB解析超时(60s)');
            }
            fixSpineAndManifestPaths(book);
          } catch (e) {
            console.warn('[EPUB] packaging/spine加载异常，继续尝试渲染:', e);
            fixSpineAndManifestPaths(book);
          }
        }

        if (!mounted || !viewerRef.current) {
          return;
        }

        if (!ensureLatest()) return;

        // 清空容器
        viewerRef.current.innerHTML = '';

        // 等待容器有正确尺寸
        const waitForSize = async (maxWait = 500): Promise<{w: number, h: number}> => {
          const start = Date.now();
          while (Date.now() - start < maxWait) {
            const el = viewerRef.current;
            if (el) {
              const w = el.clientWidth || el.offsetWidth;
              const h = el.clientHeight || el.offsetHeight;
              if (w > 100 && h > 100) {
                return { w, h };
              }
            }
            await new Promise(r => setTimeout(r, 50));
          }
          // 回退到默认尺寸
          return { w: 800, h: 600 };
        };

        const { w: containerWidth, h: containerHeight } = await waitForSize();
        
        setStage('Rendering');
        
        // 使用 paginated 模式 + continuous manager 以获得更好的渲染效果
        const rendition = book.renderTo(viewerRef.current, {
          width: containerWidth,
          height: containerHeight,
          flow: 'paginated',
          spread: 'none',
          manager: 'default',
        });

        renditionRef.current = rendition;

        try {
          rendition.themes.fontSize(`${Math.round(markdownScale * 100)}%`);
        } catch {
          // ignore
        }

        try {
          rendition.themes.register('app', {
            body: {
              margin: '0',
              padding: '20px 40px',
            },
          });
          rendition.themes.select('app');
        } catch {
          // ignore
        }

        try {
          rendition.hooks?.content?.register?.((contents: any) => {
            try {
              const doc = contents?.document;
              if (!doc) return;

              if ((doc as any).__aireader_assets_patched) return;
              (doc as any).__aireader_assets_patched = true;

              const sectionHrefRaw = (() => {
                try {
                  const h = contents?.section?.href;
                  return typeof h === 'string' ? h : '';
                } catch {
                  return '';
                }
              })();

              const sectionHref = String(sectionHrefRaw || '').replace(/\\/g, '/');
              const sectionNorm = normalizeRelPath(sectionHref) || '';
              const sectionDirRel = (() => {
                const idx = sectionNorm.lastIndexOf('/');
                return idx >= 0 ? sectionNorm.slice(0, idx) : '';
              })();

              const opfBaseAbs = String(opfDirAbsPathRef.current || '').replace(/\\/g, '/').replace(/\/+$/, '');
              const sectionBaseAbs = sectionDirRel ? `${opfBaseAbs}/${sectionDirRel}` : opfBaseAbs;

              const resolveToAssetUrl = (raw: string) => resolveToAssetUrlForSection(raw, sectionBaseAbs);

              const decodeAssetAbsPath = (assetUrl: string): string | null => {
                try {
                  const u = new URL(assetUrl);
                  const isAssetHost = u.hostname === 'asset.localhost' || (u.protocol === 'asset:' && u.hostname === 'localhost');
                  if (!isAssetHost) return null;
                  const p = u.pathname.startsWith('/') ? u.pathname.slice(1) : u.pathname;
                  const decoded = decodeURIComponent(p);
                  if (!decoded) return null;
                  return decoded.replace(/\\/g, '/');
                } catch {
                  return null;
                }
              };

              const inlineStylesheet = async (linkEl: HTMLLinkElement) => {
                try {
                  if ((linkEl as any).__aireader_inlined) return;
                  (linkEl as any).__aireader_inlined = true;
                  const hrefRaw = linkEl.getAttribute('href') || '';
                  if (!hrefRaw) return;

                  const resolvedHref = resolveToAssetUrl(hrefRaw) || rewriteAssetUrl(hrefRaw);
                  try {
                    if (resolvedHref && resolvedHref !== hrefRaw) {
                      linkEl.setAttribute('href', resolvedHref);
                    }
                  } catch {
                  }
                  const cssAbs = decodeAssetAbsPath(resolvedHref);
                  const cssDirAbs = cssAbs ? cssAbs.slice(0, Math.max(0, cssAbs.lastIndexOf('/'))) : sectionBaseAbs;

                  const fetchUrl = resolvedHref;
                  const resp = await fetch(fetchUrl);
                  if (!resp.ok) return;
                  const cssText = await resp.text();

                  const rewriteCssUrls = async (text: string, baseDirAbs: string, depth: number): Promise<string> => {
                    if (depth > 4) return text;

                    const outImports: string[] = [];
                    let idx = 0;
                    const importRe = /@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)'|([^\s\)\;]+))\s*\)?\s*([^;]*)\;/gi;
                    let m: RegExpExecArray | null;
                    while ((m = importRe.exec(text))) {
                      const start = m.index;
                      const end = importRe.lastIndex;
                      const href = (m[1] || m[2] || m[3] || '').trim();
                      const media = String(m[4] || '').trim();

                      outImports.push(text.slice(idx, start));
                      idx = end;

                      if (!href || href.startsWith('data:') || href.startsWith('http://') || href.startsWith('https://') || href.startsWith('blob:')) {
                        outImports.push(m[0]);
                        continue;
                      }

                      const absHrefNorm = normalizeRelPath(href.replace(/\\/g, '/'));
                      if (!absHrefNorm) {
                        outImports.push(m[0]);
                        continue;
                      }
                      const importAbs = `${baseDirAbs.replace(/\\/g, '/').replace(/\/+$/, '')}/${absHrefNorm}`;
                      const importUrl = convertFileSrc(importAbs);
                      const r = await fetch(importUrl);
                      if (!r.ok) {
                        outImports.push(m[0]);
                        continue;
                      }
                      const childText = await r.text();
                      const childDir = importAbs.slice(0, Math.max(0, importAbs.lastIndexOf('/')));
                      const inlined = await rewriteCssUrls(childText, childDir, depth + 1);
                      if (media) {
                        outImports.push(`@media ${media} {\n${inlined}\n}`);
                      } else {
                        outImports.push(inlined);
                      }
                    }
                    outImports.push(text.slice(idx));
                    let merged = outImports.join('');

                    merged = merged.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (_full, q: string, raw: string) => {
                      const u = String(raw || '').trim();
                      if (!u) return _full;
                      const lower = u.toLowerCase();
                      if (lower.startsWith('data:') || lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('blob:') || lower.startsWith('asset:')) {
                        return _full;
                      }

                      let rewritten: string | null = null;
                      if (u.startsWith('/') && !u.startsWith('//') && !/^\/[a-zA-Z]:\//.test(u)) {
                        rewritten = rewriteRelToAssetUrl(u.replace(/^\/+/, ''));
                      } else {
                        const norm = normalizeRelPath(u.replace(/\\/g, '/'));
                        if (norm) {
                          const abs = `${baseDirAbs.replace(/\\/g, '/').replace(/\/+$/, '')}/${norm}`;
                          rewritten = convertFileSrc(abs);
                        }
                      }
                      if (!rewritten) return _full;
                      const qq = q || '"';
                      return `url(${qq}${rewritten}${qq})`;
                    });

                    return merged;
                  };

                  const rewritten = await rewriteCssUrls(cssText, cssDirAbs || sectionBaseAbs, 0);

                  const style = doc.createElement('style');
                  style.textContent = rewritten;
                  linkEl.parentElement?.insertBefore(style, linkEl);
                  linkEl.remove();
                } catch {
                }
              };

              try {
                const w = contents?.window;
                if (w && !(w as any).__epub_debug_patched) {
                  (w as any).__epub_debug_patched = true;

                  const originalFetch2 = w.fetch?.bind(w);
                  if (typeof originalFetch2 === 'function') {
                    w.fetch = async (input: any, init?: any) => {
                      let reqInfo: any = input;
                      let urlStr = typeof reqInfo === 'string' ? reqInfo : (reqInfo?.url ? String(reqInfo.url) : '');

                      const rewritten = typeof urlStr === 'string' ? rewriteAssetUrl(urlStr) : urlStr;
                      if (rewritten !== urlStr) {
                        if (/\.(opf|xhtml|html|css)$/i.test(urlStr)) {
                          console.warn(`[EPUB][rewrite][iframe] ${urlStr} -> ${rewritten}`);
                        }
                        urlStr = rewritten;
                        try {
                          if (typeof reqInfo === 'string') {
                            reqInfo = rewritten;
                          } else if (reqInfo instanceof Request) {
                            reqInfo = new Request(rewritten, reqInfo);
                          } else {
                            reqInfo = rewritten;
                          }
                        } catch {
                          reqInfo = rewritten;
                        }
                      }

                      const isEpubAsset =
                        typeof urlStr === 'string' &&
                        (
                          urlStr.includes('epub_extracted') ||
                          urlStr.includes('asset.localhost') ||
                          urlStr.startsWith('asset://') ||
                          urlStr.startsWith('asset:')
                        );
                      if (!isEpubAsset) return originalFetch2(reqInfo, init);

                      lastAssetUrlRef.current = urlStr;
                      const controller = new AbortController();
                      const timer = window.setTimeout(() => controller.abort(), 120000);
                      try {
                        const nextInit = init ? { ...(init as any) } : {};
                        if (!(nextInit as any).signal) (nextInit as any).signal = controller.signal;
                        return await originalFetch2(reqInfo, nextInit);
                      } finally {
                        window.clearTimeout(timer);
                      }
                    };
                  }

                  try {
                    const originalXHROpen2 = w.XMLHttpRequest?.prototype?.open;
                    const originalXHRSend2 = w.XMLHttpRequest?.prototype?.send;
                    if (originalXHROpen2 && originalXHRSend2) {
                      (w.XMLHttpRequest.prototype as any).open = function (...args: any[]) {
                        try {
                          const url = args[1];
                          const raw = typeof url === 'string' ? url : String(url ?? '');
                          const rewritten = rewriteAssetUrl(raw);
                          args[1] = rewritten;
                          (this as any).__epub_url = rewritten;
                        } catch {
                        }
                        return (originalXHROpen2 as any).apply(this, args);
                      };
                      (w.XMLHttpRequest.prototype as any).send = function (...args: any[]) {
                        try {
                          const urlStr = typeof (this as any).__epub_url === 'string' ? (this as any).__epub_url : '';
                          const isEpubAsset =
                            typeof urlStr === 'string' &&
                            (
                              urlStr.includes('epub_extracted') ||
                              urlStr.includes('asset.localhost') ||
                              urlStr.startsWith('asset://') ||
                              urlStr.startsWith('asset:')
                            );
                          if (isEpubAsset) {
                            lastAssetUrlRef.current = urlStr;
                            const timeout = (this as any).timeout;
                            if (typeof timeout !== 'number' || timeout <= 0) {
                              (this as any).timeout = 120000;
                            }
                          }
                        } catch {
                        }
                        return (originalXHRSend2 as any).apply(this, args);
                      };
                    }
                  } catch {
                  }
                }
              } catch {
              }

              try {
                const onResError = (e: any) => {
                  try {
                    const t = e?.target as any;
                    const url = typeof t?.src === 'string' ? t.src : (typeof t?.href === 'string' ? t.href : '');
                    if (url && isEpubAssetRequest(url)) {
                      lastAssetUrlRef.current = url;
                      console.error('[EPUB][iframe] resource error', url);
                    }
                  } catch {
                  }
                };
                doc.addEventListener('error', onResError, true);
              } catch {
              }

              patchDocAssets(doc, sectionBaseAbs);

              try {
                const links = Array.from(doc.querySelectorAll('link[rel~="stylesheet"][href],link[rel="aireader-stylesheet"][href]')) as HTMLLinkElement[];
                for (const l of links) {
                  void inlineStylesheet(l);
                }
              } catch {
              }

              const onWheel = (e: WheelEvent) => {
                if (readingModeRef.current === 'scrolled') {
                  return;
                }
                if (coverVisibleRef.current) {
                  e.preventDefault();
                  e.stopPropagation();
                  return;
                }
                const now = Date.now();
                if (now - lastWheelTurnAtRef.current < 180) return;

                const dy = e.deltaY;
                if (!Number.isFinite(dy) || Math.abs(dy) < 10) return;
                e.preventDefault();
                lastWheelTurnAtRef.current = now;
                requestPageTurn(dy > 0 ? 'next' : 'prev');
              };

              doc.addEventListener('wheel', onWheel, { passive: false });
            } catch {
              // ignore
            }
          });
        } catch {
          // ignore
        }

        // 文本选择处理 - 使用 ref 避免闭包问题
        rendition.on("selected", (_cfiRange: string, contents: any) => {
          try {
            const selection = contents.window.getSelection();
            if (selection && selection.toString().trim()) {
              const text = selection.toString().trim();
              const range = selection.getRangeAt(0);
              const rect = range.getBoundingClientRect();
              let x = rect.x;
              let y = rect.y;
              try {
                const frameEl = contents?.window?.frameElement as HTMLElement | null;
                if (frameEl && typeof frameEl.getBoundingClientRect === 'function') {
                  const fr = frameEl.getBoundingClientRect();
                  x = (Number.isFinite(x) ? x : 0) + fr.left;
                  y = (Number.isFinite(y) ? y : 0) + fr.top;
                }
              } catch {
              }

              onTextSelectRef.current({
                text,
                pageNumber: 0,
                position: {
                  x,
                  y,
                  width: rect.width,
                  height: rect.height,
                },
              });
            }
          } catch (err) {
            console.error("[EPUB] 处理选中文本时出错:", err);
          }
        });

        setStage('Displaying');

        let firstVisibleDone = false;
        let resolveFirstVisible: (() => void) | null = null;
        const createFirstVisiblePromise = () =>
          new Promise<void>((resolve) => {
            resolveFirstVisible = resolve;
          });
        let firstVisiblePromise = createFirstVisiblePromise();

        const markFirstVisible = () => {
          if (firstVisibleDone) return;
          firstVisibleDone = true;
          resolveFirstVisible?.();
          resolveFirstVisible = null;
          if (firstRenderedRef.current) return;
          firstRenderedRef.current = true;
          setLoadingStage('');
          if (mounted) {
            setLoading(false);
          }
          if (watchdogTimer) {
            window.clearTimeout(watchdogTimer);
            watchdogTimer = null;
          }
        };
        
        // 监听渲染事件
        rendition.on("rendered", (_section: any) => {
          markFirstVisible();
          // 渲染后立即调整尺寸
          try {
            const el = viewerRef.current;
            if (el && renditionRef.current) {
              const w = el.clientWidth || el.offsetWidth || 800;
              const h = el.clientHeight || el.offsetHeight || 600;
              renditionRef.current.resize(w, h);
            }
          } catch {}
        });
        
        rendition.on("displayError", (err: any) => {
          console.error("[EPUB] 显示错误:", err);
        });

        rendition.on("relocated", (location: any) => {
          markFirstVisible(); // 确保relocated也能触发首屏完成
          try {
            const doc = useDocumentStore.getState().currentDocument;
            if (!doc || doc.path !== filePath) return;

            const hasLocationsNow = !!hasLocationsRef.current;
            const fallbackNow = fallbackDisplayedRef.current;

            const cfi = location?.start?.cfi;
            if (typeof cfi === 'string' && cfi.trim()) {
              lastRelocatedCfiRef.current = cfi;
              try {
                localStorage.setItem(lastCfiKey, cfi);
              } catch {
                // ignore
              }
            }
            const displayedPageRaw = location?.start?.displayed?.page;
            const displayedTotalRaw = location?.start?.displayed?.total;

            const locHref = normalizeHref(location?.start?.href);
            if (locHref) {
              setActiveHref(locHref);
            }

            const total =
              (book.locations as any)?.total ||
              (book.locations as any)?.locations?.length ||
              (hasLocationsNow ? doc.totalPages : 0) ||
              0;

            let progress = 0;
            if (cfi && (book.locations as any)?.percentageFromCfi) {
              const p = (book.locations as any).percentageFromCfi(cfi);
              if (typeof p === 'number' && Number.isFinite(p)) {
                progress = Math.min(Math.max(p, 0), 1);
              }
            } else if (typeof location?.start?.percentage === 'number') {
              progress = Math.min(Math.max(location.start.percentage, 0), 1);
            }

            if (!hasLocationsNow && typeof displayedPageRaw === 'number' && typeof displayedTotalRaw === 'number') {
              const dp = Math.max(1, Math.floor(displayedPageRaw));
              const dt = Math.max(1, Math.floor(displayedTotalRaw));
              setFallbackDisplayed({ page: Math.min(dp, dt), total: dt });
            } else if (hasLocationsNow && fallbackNow) {
              setFallbackDisplayed(null);
            }

            const effectiveTotal = total > 0 ? total : (fallbackNow?.total || 1);
            const page = effectiveTotal > 1 ? Math.min(effectiveTotal, Math.max(1, Math.floor(progress * (effectiveTotal - 1) + 1))) : 1;

            lastRelocatedPageRef.current = page;

            const guard = restoreGuardRef.current;
            if (guard?.enabled && !hasLocationsNow) {
              const tooSoon = Date.now() - guard.startedAt < 4000;
              const looksLikeReset = page === 1 && guard.savedPage > 1 && progress <= 0.001;
              if (tooSoon || looksLikeReset) {
                return;
              }
              restoreGuardRef.current = { ...guard, enabled: false };
            }
            if (hasLocationsNow && restoreGuardRef.current?.enabled) {
              restoreGuardRef.current = { ...restoreGuardRef.current, enabled: false };
            }

            if (page !== currentPageRef.current) {
              setCurrentPage(page);
            }
            updateDocumentProgress(doc.id, page, progress);

            if (pendingTurnRef.current) {
              pendingTurnRef.current = false;
              pageTurnInFlightRef.current = false;
              if (pendingTurnTimerRef.current) {
                window.clearTimeout(pendingTurnTimerRef.current);
                pendingTurnTimerRef.current = null;
              }
            }
          } catch (e) {
            console.warn("[EPUB] relocated 处理失败:", e);
          }
        });
        
        // 添加超时处理，防止卡死
        const docForDisplay = useDocumentStore.getState().currentDocument;
        const savedPage = docForDisplay?.path === filePath ? (docForDisplay.currentPage || 1) : 1;
        let target: any = undefined;
        const storedCfi = (() => {
          try {
            return localStorage.getItem(lastCfiKey);
          } catch {
            return null;
          }
        })();
        if (storedCfi && storedCfi.trim()) {
          target = storedCfi.trim();
        } else {
          const lastCfi = lastRelocatedCfiRef.current;
          if (lastCfi) {
            target = lastCfi;
          }
        }

        const shouldAutoShowCover = !target && savedPage <= 1;
        restoreGuardRef.current = { enabled: !!target || savedPage > 1, savedPage, startedAt: Date.now() };
        // 调用display并等待完成
        const attemptDisplay = async (t?: any) => {
          firstVisibleDone = false;
          firstVisiblePromise = createFirstVisiblePromise();
          await withTimeout((t ? rendition.display(t) : rendition.display()) as any, 120000, 'EPUB渲染超时(120s)');
          await withTimeout(firstVisiblePromise, 120000, 'EPUB首屏渲染超时(120s)');
        };

        try {
          await attemptDisplay(target);
        } catch (displayErr) {
          console.error("[EPUB] display() 失败:", displayErr);
          if (target) {
            console.warn('[EPUB] 尝试从开头重新 display');
            try {
              await attemptDisplay(undefined);
            } catch (e2) {
              try {
                const flow = (rendition as any)?.flow;
                if (typeof flow === 'function') {
                  console.warn('[EPUB] 切换为 scrolled-doc 再尝试渲染');
                  flow.call(rendition, 'scrolled-doc');
                  await attemptDisplay(undefined);
                } else {
                  throw e2;
                }
              } catch {
                throw e2;
              }
            }
          } else {
            try {
              const flow = (rendition as any)?.flow;
              if (typeof flow === 'function') {
                console.warn('[EPUB] 切换为 scrolled-doc 再尝试渲染');
                flow.call(rendition, 'scrolled-doc');
                await attemptDisplay(undefined);
              } else {
                throw displayErr;
              }
            } catch {
              throw displayErr;
            }
          }
        }

        // 异步加载TOC和封面，完全不阻塞
        setTimeout(() => {
          (async () => {
            try {
              const bookNow = bookRef.current;
              const docNow = useDocumentStore.getState().currentDocument;
              if (!bookNow || !docNow || docNow.path !== filePath) return;

              // TOC
              try {
                const nav = await Promise.race([
                  (bookNow.loaded as any)?.navigation,
                  new Promise((_, reject) => setTimeout(() => reject(), 5000))
                ]);
                setTocItems(Array.isArray(nav?.toc) ? nav.toc : []);
              } catch {
                setTocItems([]);
              }

              // 封面
              try {
                const c = await Promise.race([
                  (bookNow as any).coverUrl?.() ?? Promise.resolve(null),
                  new Promise((_, reject) => setTimeout(() => reject(), 3000))
                ]);
                if (typeof c === 'string' && c.trim()) {
                  const cover = rewriteAssetUrl(c);
                  setCoverUrl(cover);
                  if (shouldAutoShowCover) {
                    setCoverVisible(true);
                  }
                }
              } catch {
                // ignore
              }
            } catch {
              // ignore
            }
          })();
        }, 100);

        // 延迟加载locations，完全不阻塞首屏
        setTimeout(() => {
          void ensureLocationsReady();
        }, 1000);
      } catch (err) {
        const msg = getErrorMessage(err);
        console.error("[EPUB] 加载失败:", err);
        setLoadingStage('');
        safeSetError(msg || "Failed to load EPUB");

        try {
          await invoke("append_log", { level: "error", message: `[EPUB] 加载失败: ${filePath} :: ${msg}` });
        } catch {
          // ignore
        }
      }
    };

    loadEpub();

    return () => {
      mounted = false;
      window.fetch = originalFetch;
      XMLHttpRequest.prototype.open = originalXHROpen;
      XMLHttpRequest.prototype.send = originalXHRSend;
      if (watchdogTimer) {
        window.clearTimeout(watchdogTimer);
        watchdogTimer = null;
      }
      if (pendingTurnTimerRef.current) {
        window.clearTimeout(pendingTurnTimerRef.current);
        pendingTurnTimerRef.current = null;
      }
      if (bookRef.current) {
        try {
          bookRef.current.destroy();
        } catch (e) {
          console.warn("[EPUB] 清理时销毁出错:", e);
        }
      }
    };
  }, [filePath, normalizeHref]);

  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    try {
      rendition.themes.fontSize(`${Math.round(markdownScale * 100)}%`);
    } catch {
      // ignore
    }
  }, [markdownScale, filePath]);

  useEffect(() => {
    const el = viewerRef.current;
    if (!el) return;

    const doResize = () => {
      const rendition = renditionRef.current;
      if (!rendition) return;
      const w = el.clientWidth || 600;
      const h = el.clientHeight || 500;
      try {
        rendition.resize(w, h);
      } catch {
        // ignore
      }
    };

    const ro = new ResizeObserver(() => {
      if (resizeRafRef.current) {
        cancelAnimationFrame(resizeRafRef.current);
      }
      resizeRafRef.current = requestAnimationFrame(() => {
        resizeRafRef.current = null;
        doResize();
      });
    });

    ro.observe(el);
    doResize();

    return () => {
      ro.disconnect();
      if (resizeRafRef.current) {
        cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = null;
      }
    };
  }, [filePath]);

  return (
    <div className={`h-full w-full overflow-hidden relative ${effectiveDocDark ? 'bg-zinc-900' : 'bg-white'}`}>
      {/* 加载/错误状态遮罩 */}
      {(loading || error) && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
          {error ? (
            <div className="text-destructive whitespace-pre-wrap">Error: {error}</div>
          ) : (
            <div className="text-muted-foreground">Loading EPUB...{loadingStage ? ` (${loadingStage})` : ''}</div>
          )}
        </div>
      )}

      <div className="h-full w-full flex overflow-hidden">
        {tocItems.length > 0 && !tocOpen && (
          <button
            type="button"
            className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-4 h-16 rounded-r-md bg-background/80 border border-l-0 border-border/60 shadow-sm backdrop-blur-sm flex items-center justify-center hover:bg-background hover:w-5 transition-all"
            onClick={() => setTocOpen(true)}
            title={b('打开目录', 'Open Contents')}
          >
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
          </button>
        )}
        {tocItems.length > 0 && tocOpen && (
          <button
            type="button"
            className="absolute top-1/2 -translate-y-1/2 z-20 w-4 h-16 rounded-r-md bg-background/80 border border-l-0 border-border/60 shadow-sm backdrop-blur-sm flex items-center justify-center hover:bg-background hover:w-5 transition-all"
            style={{ left: tocWidth }}
            onClick={() => setTocOpen(false)}
            title={b('收起目录', 'Close Contents')}
          >
            <ChevronLeft className="w-3 h-3 text-muted-foreground" />
          </button>
        )}
        {tocItems.length > 0 && (
          <div
            className={`shrink-0 bg-card/60 backdrop-blur overflow-hidden transition-[width] duration-200 ${
              tocOpen ? 'border-r border-border' : ''
            }`}
            style={{ width: tocOpen ? tocWidth : 0 }}
          >
            {tocOpen && (
              <>
                <div className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/60 bg-muted/30">
                  {b('目录', 'Contents')}
                </div>
                <div ref={tocScrollRef} className="p-1.5 text-sm overflow-auto h-full">
                  {(() => {
                    const renderItems = (items: any[], depth: number): any => {
                      return items.map((it, idx) => {
                        const label = typeof it?.label === 'string' ? it.label : (typeof it?.title === 'string' ? it.title : '');
                        const href = typeof it?.href === 'string' ? it.href : '';
                        const hrefKey = normalizeHref(href);
                        const sub = Array.isArray(it?.subitems) ? it.subitems : Array.isArray(it?.items) ? it.items : [];
                        const isActive = !!hrefKey && hrefKey === activeHref;
                        const textClass =
                          depth === 0
                            ? 'text-[13px] font-medium'
                            : depth === 1
                              ? 'text-[12px]'
                              : 'text-[11px] text-muted-foreground';
                        return (
                          <div key={`${depth}-${idx}`}>
                            <button
                              type="button"
                              data-href={hrefKey}
                              className={`w-full text-left px-2 py-1 rounded-md transition-colors truncate leading-snug ${textClass} ${
                                isActive ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted/80'
                              }`}
                              style={{ paddingLeft: 8 + depth * 14, borderLeft: depth > 0 ? '2px solid var(--border)' : 'none' }}
                              onClick={() => {
                                if (!href) return;
                                setCoverVisible(false);
                                try {
                                  void (renditionRef.current as any)?.display?.(href);
                                } catch {
                                  // ignore
                                }
                              }}
                              title={label || href}
                            >
                              {label || href}
                            </button>
                            {sub.length > 0 && renderItems(sub, depth + 1)}
                          </div>
                        );
                      });
                    };
                    return renderItems(tocItems, 0);
                  })()}
                </div>
              </>
            )}
          </div>
        )}

        {tocItems.length > 0 && tocOpen && (
          <ResizeHandle
            direction="right"
            onResize={(delta) => {
              setTocWidth((w) => Math.min(420, Math.max(180, w + delta)));
            }}
          />
        )}

        {/* EPUB 渲染容器 - 始终存在以便 ref 可用 */}
        <div
          ref={viewerRef}
          className="flex-1 overflow-hidden"
          style={{
            filter: effectiveDocDark ? 'invert(0.88) hue-rotate(180deg)' : undefined,
            minHeight: '400px',
            minWidth: '300px',
            width: '100%',
            height: '100%',
          }}
        />
      </div>

      {coverVisible && coverUrl && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-background/95"
          onClick={() => {
            setCoverVisible(false);
          }}
          onWheel={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <img
            src={coverUrl}
            alt="cover"
            className="max-h-[90%] max-w-[90%] object-contain"
            draggable={false}
          />
        </div>
      )}

      <FloatingReaderToolbar
        zoomPercent={markdownScale * 100}
        onZoomOut={() => {
          setMarkdownScale(markdownScale - 0.05);
          saveSettings();
        }}
        onZoomIn={() => {
          setMarkdownScale(markdownScale + 0.05);
          saveSettings();
        }}
        onReset={() => {
          setMarkdownScale(0.95);
          saveSettings();
        }}
        onSetZoomPercent={(nextPercent) => {
          const next = Math.min(1.2, Math.max(0.8, nextPercent / 100));
          setMarkdownScale(next);
          saveSettings();
        }}
        canZoomOut={markdownScale > 0.8}
        canZoomIn={markdownScale < 1.2}
        readingMode={readingMode}
        showReadingModeToggle
        onToggleReadingMode={() => {
          const rendition = renditionRef.current as any;
          const next = readingModeRef.current === 'paginated' ? 'scrolled' : 'paginated';
          setReadingMode(next);
          try {
            if (rendition?.flow) {
              rendition.flow(next === 'scrolled' ? 'scrolled-doc' : 'paginated');
            }
          } catch {
            // ignore
          }
        }}
        pageCurrent={readingMode === 'paginated' ? (hasLocations ? currentPage : (fallbackDisplayed?.page ?? currentPage)) : undefined}
        pageTotal={readingMode === 'paginated' ? (hasLocations ? totalPages : (fallbackDisplayed?.total ?? Math.max(1, totalPages))) : undefined}
        onSetPageCurrent={readingMode === 'paginated' ? ((nextPage) => {
          void (async () => {
            await ensureLocationsReady();
            const book = bookRef.current as any;
            const rendition = renditionRef.current as any;
            if (!book || !rendition) return;
            try {
              const total =
                (book.locations as any)?.total ||
                (book.locations as any)?.locations?.length ||
                totalPages ||
                1;
              const clamped = Math.min(Math.max(1, Math.floor(nextPage)), total);
              const cfi = (book.locations as any)?.cfiFromLocation?.(Math.max(0, clamped - 1));
              if (typeof cfi === 'string' && cfi.trim()) {
                setCoverVisible(false);
                void rendition.display?.(cfi);
              }
            } catch {
              // ignore
            }
          })();
        }) : undefined}
        onPrevPage={readingMode === 'paginated' ? (() => {
          if (coverVisible) {
            setCoverVisible(false);
            return;
          }
          requestPageTurn('prev');
        }) : undefined}
        onNextPage={readingMode === 'paginated' ? (() => {
          if (coverVisible) {
            setCoverVisible(false);
            return;
          }
          requestPageTurn('next');
        }) : undefined}
        canPrevPage={readingMode === 'paginated' ? (hasLocations ? currentPage > 1 : true) : undefined}
        canNextPage={readingMode === 'paginated' ? (hasLocations ? currentPage < totalPages : true) : undefined}
        docDark={effectiveDocDark}
        onToggleDocDark={() => setDocDarkOverride((prev) => (prev === null ? !appDark : !prev))}
        showDocThemeToggle
        hasToc={tocItems.length > 0}
        tocOpen={tocOpen}
        onToggleToc={() => setTocOpen((prev) => !prev)}
        containerStyle={{ left: tocItems.length > 0 && tocOpen ? `calc(50% + ${tocWidth / 2}px)` : '50%' }}
      />
    </div>
  );
}
