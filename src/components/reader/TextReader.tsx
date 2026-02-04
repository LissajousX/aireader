import { useEffect, useState, useRef } from "react";
import { Markdown } from "@/components/ui/Markdown";
import { useSettingsStore } from "@/stores/settingsStore";
import { useDocumentStore } from "@/stores/documentStore";
import { FloatingReaderToolbar } from "@/components/reader/FloatingReaderToolbar";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ResizeHandle } from "@/components/ui/ResizeHandle";
import type { TextSelection } from "@/types";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getErrorMessage } from "@/lib/utils";
import { useI18n } from "@/i18n";

interface TextReaderProps {
  filePath: string;
  onTextSelect: (selection: TextSelection) => void;
}

export function TextReader({ filePath, onTextSelect }: TextReaderProps) {
  const { b } = useI18n();
  const [content, setContent] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { currentDocument, updateDocumentProgress } = useDocumentStore();
  const markdownScale = useSettingsStore((s) => s.markdownScale);
  const setMarkdownScale = useSettingsStore((s) => s.setMarkdownScale);
  const saveSettings = useSettingsStore((s) => s.saveSettings);
  const onTextSelectRef = useRef(onTextSelect);
  const [appDark, setAppDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [docDarkOverride, setDocDarkOverride] = useState<boolean | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderWindow, setRenderWindow] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [mdToc, setMdToc] = useState<{ id: string; text: string; level: number }[]>([]);
  const [tocOpen, setTocOpen] = useState(false);
  const [tocWidth, setTocWidth] = useState(240);

  const getDirName = (path: string) => {
    const normalized = path.replace(/\\/g, "/");
    const idx = normalized.lastIndexOf("/");
    if (idx === -1) return "";
    return normalized.slice(0, idx);
  };

  const normalizeJoin = (baseDir: string, rel: string) => {
    const base = baseDir.replace(/\\/g, "/");
    let r = rel.trim();
    if (r.startsWith("<") && r.endsWith(">") && r.length >= 2) {
      r = r.slice(1, -1);
    }
    r = r.replace(/\\/g, "/");
    if (r.startsWith("./")) r = r.slice(2);

    const combined = (base ? `${base}/${r}` : r).split("?")[0].split("#")[0];
    const parts = combined.split("/");
    const out: string[] = [];
    for (const p of parts) {
      if (!p || p === ".") continue;
      if (p === "..") {
        out.pop();
        continue;
      }
      out.push(p);
    }
    const prefix = combined.startsWith("/") ? "/" : "";
    return prefix + out.join("/");
  };

  const resolveMarkdownSrc = (src?: string) => {
    if (!src) return src;
    const s = src.trim();
    if (!s) return s;
    const lower = s.toLowerCase();
    if (lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("data:")) return s;
    if (/^[a-zA-Z]:\\/.test(s) || /^[a-zA-Z]:\//.test(s)) return convertFileSrc(s);
    if (s.startsWith("/")) return convertFileSrc(s);

    const baseDir = getDirName(filePath);
    const abs = normalizeJoin(baseDir, s);
    return convertFileSrc(abs);
  };

  
  // 判断是否为 Markdown 文件
  const isMarkdown = filePath.toLowerCase().endsWith('.md');
  const mdFull = isMarkdown && content.length > 0 && content.length <= 220_000;

  useEffect(() => {
    onTextSelectRef.current = onTextSelect;
  }, [onTextSelect]);

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

  useEffect(() => {
    const loadText = async () => {
      try {
        setLoading(true);
        setError(null);
        const { readTextFile, readFile } = await import("@tauri-apps/plugin-fs");

        let text: string;
        try {
          text = await readTextFile(filePath);
        } catch (err) {
          console.warn("[TXT] readTextFile 失败，尝试 readFile + TextDecoder:", err);
          const bytes = await readFile(filePath);
          text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
        }
        setContent(text);
        if (isMarkdown && text.length <= 220_000) {
          setRenderWindow({ start: 0, end: text.length });
        } else {
          setRenderWindow({ start: 0, end: Math.min(text.length, 80_000) });
        }
        setLoading(false);
      } catch (err) {
        const msg = getErrorMessage(err);
        console.error("[TXT] 加载失败:", err);
        setError(msg || "Failed to load text");
        try {
          await invoke("append_log", { level: "error", message: `[TXT] 加载失败: ${filePath} :: ${msg}` });
        } catch {
          // ignore
        }
        setLoading(false);
      }
    };

    loadText();
  }, [filePath]);

  useEffect(() => {
    if (!isMarkdown || !mdFull) {
      setMdToc([]);
      return;
    }

    const stripInlineMd = (s: string) => {
      return s
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/<[^>]+>/g, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        .replace(/~~([^~]+)~~/g, '$1');
    };

    const slugify = (s: string) => {
      return s
        .toLowerCase()
        .trim()
        .replace(/[\s\u00A0]+/g, "-")
        .replace(/[^a-z0-9\-\u4e00-\u9fff]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
    };

    const counts = new Map<string, number>();
    const getId = (text: string) => {
      const base = slugify(text) || 'section';
      const c = counts.get(base) ?? 0;
      counts.set(base, c + 1);
      return c === 0 ? base : `${base}-${c + 1}`;
    };

    const lines = content.split(/\r?\n/);
    const items: { id: string; text: string; level: number }[] = [];
    let inFence = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('```')) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;

      const m = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
      if (!m) continue;
      const level = m[1].length;
      const text = stripInlineMd(m[2].replace(/#+\s*$/, '')).trim().replace(/\\([\\`*_{}\[\]()#+\-.!])/g, '$1');
      if (!text) continue;
      const id = getId(text);
      items.push({ id, text, level });
    }

    setMdToc(items);
  }, [content, isMarkdown, mdFull]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (isMarkdown && mdFull) return;

    const update = () => {
      const total = content.length;
      if (!total) return;
      const win = Math.min(total, 140_000);
      // Short files: render everything, no virtual window needed
      if (total <= win) {
        setRenderWindow((prev) => prev.start === 0 && prev.end === total ? prev : { start: 0, end: total });
        return;
      }

      const top = el.scrollTop;
      const height = el.clientHeight || 1;
      const scrollHeight = el.scrollHeight || 1;
      const ratio = Math.min(Math.max(top / Math.max(1, scrollHeight - height), 0), 1);

      const center = Math.floor(ratio * total);
      const start = Math.max(0, center - Math.floor(win / 2));
      const end = Math.min(total, start + win);
      setRenderWindow({ start, end });
    };

    update();
    el.addEventListener('scroll', update, { passive: true });
    return () => el.removeEventListener('scroll', update);
  }, [content]);

  // I4: Track reading progress for md/txt via scroll position
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !currentDocument) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const scrollTop = el.scrollTop;
        const scrollHeight = el.scrollHeight;
        const clientHeight = el.clientHeight;
        const maxScroll = scrollHeight - clientHeight;
        if (maxScroll <= 0) return;
        const progress = Math.min(1, Math.max(0, scrollTop / maxScroll));
        updateDocumentProgress(currentDocument.id, 1, progress);
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [currentDocument, updateDocumentProgress]);

  const handleMouseUp = () => {
    try {
      const selection = window.getSelection();
      if (selection && selection.toString().trim()) {
        const text = selection.toString().trim();
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        onTextSelectRef.current({
          text,
          pageNumber: 0,
          position: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
        });
      }
    } catch (err) {
      console.error("[TXT] 处理文本选择时出错:", err);
    }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-destructive">Error: {error}</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      <div className="flex-1 flex overflow-hidden">
        {isMarkdown && mdFull && mdToc.length > 0 && !tocOpen && (
          <button
            type="button"
            className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-4 h-16 rounded-r-md bg-background/80 border border-l-0 border-border/60 shadow-sm backdrop-blur-sm flex items-center justify-center hover:bg-background hover:w-5 transition-all"
            onClick={() => setTocOpen(true)}
            title={isMarkdown ? b('目录', 'TOC') : b('打开目录', 'Open TOC')}
          >
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
          </button>
        )}
        {isMarkdown && mdFull && mdToc.length > 0 && tocOpen && (
          <button
            type="button"
            className="absolute top-1/2 -translate-y-1/2 z-20 w-4 h-16 rounded-r-md bg-background/80 border border-l-0 border-border/60 shadow-sm backdrop-blur-sm flex items-center justify-center hover:bg-background hover:w-5 transition-all"
            style={{ left: tocWidth }}
            onClick={() => setTocOpen(false)}
            title={b('关闭目录', 'Close TOC')}
          >
            <ChevronLeft className="w-3 h-3 text-muted-foreground" />
          </button>
        )}
        {isMarkdown && mdFull && mdToc.length > 0 && (
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
                <div className="p-1.5 text-sm overflow-auto h-full">
                  {mdToc.map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      className={`w-full text-left px-2 py-1 rounded-md hover:bg-muted/80 transition-colors truncate leading-snug ${
                        it.level === 1
                          ? 'text-[13px] font-medium'
                          : it.level === 2
                            ? 'text-[12px]'
                            : 'text-[11px] text-muted-foreground'
                      }`}
                      style={{ paddingLeft: 8 + (it.level - 1) * 14, borderLeft: it.level > 1 ? '2px solid var(--border)' : 'none' }}
                      onClick={() => {
                        const c = containerRef.current;
                        if (!c) return;

                        const scrollToEl = (el: HTMLElement) => {
                          const cRect = c.getBoundingClientRect();
                          const tRect = el.getBoundingClientRect();
                          const top = tRect.top - cRect.top + c.scrollTop;
                          c.scrollTo({ top: Math.max(0, top - 8), behavior: 'smooth' });
                        };

                        const globalById = document.getElementById(it.id) as HTMLElement | null;
                        if (globalById && c.contains(globalById)) {
                          scrollToEl(globalById);
                          return;
                        }

                        const byId = c.querySelector(`#${CSS.escape(it.id)}`) as HTMLElement | null;
                        if (byId) {
                          scrollToEl(byId);
                          return;
                        }

                        const norm = (s: string) => s.replace(/[\s\u00A0]+/g, ' ').trim();
                        const want = norm(it.text);
                        const headings = Array.from(c.querySelectorAll('h1,h2,h3,h4,h5,h6')) as HTMLElement[];
                        const byText = headings.find((h) => norm(h.textContent || '') === want) || null;
                        if (byText) {
                          scrollToEl(byText);
                          return;
                        }

                        console.warn('[MD] TOC jump target not found:', { id: it.id, text: it.text, headings: headings.length });
                      }}
                      title={it.text}
                    >
                      {it.text}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {isMarkdown && mdFull && mdToc.length > 0 && tocOpen && (
          <ResizeHandle
            direction="right"
            onResize={(delta) => {
              setTocWidth((w) => Math.min(420, Math.max(180, w + delta)));
            }}
          />
        )}

        <div ref={containerRef} className={`flex-1 overflow-auto p-4 ${effectiveDocDark ? 'bg-zinc-900' : 'bg-muted/30'}`}>
          <div
            className="w-full max-w-[794px] mx-auto bg-white shadow-lg rounded-sm p-8 prose prose-sm prose-h1:text-[1.8em] prose-h2:text-[1.5em] prose-h3:text-[1.25em] prose-h4:text-[1.1em] prose-pre:bg-muted prose-pre:text-foreground"
            style={{ fontSize: `${markdownScale}rem`, filter: effectiveDocDark ? 'invert(0.88) hue-rotate(180deg)' : undefined }}
            onMouseUp={handleMouseUp}
          >
            {isMarkdown ? (
              <Markdown resolveImageSrc={resolveMarkdownSrc}>{mdFull ? content : content.slice(renderWindow.start, renderWindow.end)}</Markdown>
            ) : (
              <pre
                className="whitespace-pre-wrap font-sans text-base leading-relaxed"
                style={{ fontSize: `${markdownScale}rem` }}
              >
                {content.slice(renderWindow.start, renderWindow.end)}
              </pre>
            )}
          </div>
        </div>
      </div>

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
        docDark={effectiveDocDark}
        onToggleDocDark={() => setDocDarkOverride((prev) => (prev === null ? !appDark : !prev))}
        showDocThemeToggle
        hasToc={isMarkdown && mdFull && mdToc.length > 0}
        tocOpen={tocOpen}
        onToggleToc={() => setTocOpen((v) => !v)}
        containerStyle={{ left: isMarkdown && mdFull && mdToc.length > 0 && tocOpen ? `calc(50% + ${tocWidth / 2}px)` : '50%' }}
      />
    </div>
  );
}
