import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { FloatingReaderToolbar } from "@/components/reader/FloatingReaderToolbar";
import { useDocumentStore } from "@/stores/documentStore";
import { useDocumentCacheStore } from "@/stores/documentCacheStore";
import type { TextSelection } from "@/types";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ResizeHandle } from "@/components/ui/ResizeHandle";
import { useI18n } from "@/i18n";

// 配置 pdfjs worker
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface PDFReaderProps {
  filePath: string;
  onTextSelect: (selection: TextSelection) => void;
}

export function PDFReader({ filePath, onTextSelect }: PDFReaderProps) {
  const { b } = useI18n();
  const { currentPage, currentDocument, updateDocumentProgress, setCurrentPage, setDocumentTotalPages, setLastPosition } = useDocumentStore();
  const { getFromCache, addToCache } = useDocumentCacheStore();
  const [scale, setScale] = useState(1.0);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [numPages, setNumPages] = useState<number>(0);
  const [outline, setOutline] = useState<any[]>([]);
  const pdfDocRef = useRef<any>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [tocWidth, setTocWidth] = useState(240);
  const [appDark, setAppDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [docDarkOverride, setDocDarkOverride] = useState<boolean | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const scrollTrackingRef = useRef(false);

  const A4_WIDTH_PX = 794;
  const horizontalPaddingPx = 32;
  const availableWidth = Math.max(320, containerWidth - horizontalPaddingPx);
  const baseWidth = Math.min(A4_WIDTH_PX, availableWidth);
  const pageWidth = useMemo(() => {
    return Math.floor(baseWidth * scale);
  }, [baseWidth, scale]);
  
  // 监听全局主题变化（用于文档明暗的默认值）
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
  
  // 使用 ref 保存回调，避免闭包问题
  const onTextSelectRef = useRef(onTextSelect);
  const currentPageRef = useRef(currentPage);
  
  useEffect(() => {
    onTextSelectRef.current = onTextSelect;
  }, [onTextSelect]);
  
  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  // 当 currentPage 从外部改变时（如点击页码按钮），滚动到对应页面
  // Skip if the change came from scroll tracking to prevent feedback loop
  useEffect(() => {
    if (scrollTrackingRef.current) {
      scrollTrackingRef.current = false;
      return;
    }
    if (!containerRef.current || numPages === 0) return;
    
    const holder = containerRef.current.querySelector(`[data-page="${currentPage}"]`) as HTMLElement | null;
    if (holder) holder.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [currentPage, numPages]);

  // 用于强制重新渲染 Document 组件的 key
  const [documentKey, setDocumentKey] = useState(0);
  const [visiblePages, setVisiblePages] = useState<Set<number>>(() => new Set());
  const ioRef = useRef<IntersectionObserver | null>(null);

  // 当文件路径变化时，完全重置状态并清理旧的 Blob URL
  useEffect(() => {
    // 清理旧的 Blob URL
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
    }
    
    setPdfUrl(null);
    setNumPages(0);
    setOutline([]);
    pdfDocRef.current = null;
    setError(null);
    setLoading(true);
    setScale(1.0);
    setDocumentKey(k => k + 1);
    setVisiblePages(new Set());
  }, [filePath]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || numPages <= 0) return;

    ioRef.current?.disconnect();
    const observer = new IntersectionObserver(
      (entries) => {
        setVisiblePages((prev) => {
          const next = new Set(prev);
          for (const e of entries) {
            const el = e.target as HTMLElement;
            const pageStr = el.dataset.page;
            const page = pageStr ? Number.parseInt(pageStr, 10) : NaN;
            if (!Number.isFinite(page) || page <= 0) continue;
            if (e.isIntersecting) {
              next.add(page);
            } else {
              next.delete(page);
            }
          }
          return next;
        });
      },
      {
        root: container,
        rootMargin: '1200px 0px',
        threshold: 0.01,
      }
    );
    ioRef.current = observer;

    const holders = container.querySelectorAll('[data-page]');
    holders.forEach((h) => observer.observe(h));

    return () => {
      observer.disconnect();
      if (ioRef.current === observer) {
        ioRef.current = null;
      }
    };
  }, [numPages, pageWidth, pdfUrl]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      setContainerWidth(el.clientWidth || 0);
    };

    update();

    const ro = new ResizeObserver(() => update());
    ro.observe(el);

    return () => {
      ro.disconnect();
    };
  }, [pdfUrl]);

  // 加载 PDF 文件并创建 Blob URL（支持缓存）
  useEffect(() => {
    let cancelled = false;
    let blobUrl: string | null = null;
    
    const loadPdf = async () => {
      try {
        setError(null);
        setLoading(true);
        // 尝试从缓存获取
        const cached = getFromCache(filePath);
        let arrayBuffer: ArrayBuffer;
        
        if (cached && cached.content instanceof ArrayBuffer) {
          arrayBuffer = cached.content;
        } else {
          // 从文件系统读取
          const { readFile } = await import("@tauri-apps/plugin-fs");
          const data = await readFile(filePath);
          // 复制为 ArrayBuffer 用于缓存
          arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
          addToCache(filePath, arrayBuffer, 'pdf');
        }
        
        if (cancelled) return;
        
        // 创建 Blob 和 Blob URL
        const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
        blobUrl = URL.createObjectURL(blob);
        
        if (cancelled) {
          URL.revokeObjectURL(blobUrl);
          return;
        }
        
        setPdfUrl(blobUrl);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error("[PDF] 加载失败:", err);
        setError(err instanceof Error ? err.message : "Failed to load PDF");
        setLoading(false);
      }
    };
    
    loadPdf();
    
    return () => {
      cancelled = true;
      // 清理时如果已创建了 Blob URL 但还没设置到状态，需要清理
      if (blobUrl && !pdfUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [filePath]);

  // 组件卸载时清理 Blob URL
  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  const onDocumentLoadSuccess = (pdf: any) => {
    try {
      const total = typeof pdf?.numPages === 'number' ? pdf.numPages : 0;
      setNumPages(total || 0);
      pdfDocRef.current = pdf;
      const doc = useDocumentStore.getState().currentDocument;
      if (doc) {
        setDocumentTotalPages(doc.id, total);
        // B2: Restore saved scroll position after a brief delay for rendering
        if (doc.lastPosition?.startsWith('scroll:')) {
          const scrollTop = parseInt(doc.lastPosition.substring(7), 10);
          if (Number.isFinite(scrollTop) && scrollTop > 0) {
            setTimeout(() => {
              if (containerRef.current) {
                scrollTrackingRef.current = true;
                containerRef.current.scrollTop = scrollTop;
              }
            }, 300);
          }
        }
      }

      Promise.resolve(pdf?.getOutline?.()).then((o: any) => {
        if (Array.isArray(o)) {
          setOutline(o);
        } else {
          setOutline([]);
        }
      }).catch(() => setOutline([]));
    } catch (err) {
      console.error("[PDF] onDocumentLoadSuccess 出错:", err);
    }
  };

  const gotoDest = async (dest: any) => {
    try {
      const pdf = pdfDocRef.current;
      if (!pdf) return;

      let destArray = dest;
      if (typeof dest === 'string') {
        destArray = await pdf.getDestination(dest);
      }
      if (!Array.isArray(destArray) || destArray.length === 0) return;
      const ref = destArray[0];
      const pageIndex = await pdf.getPageIndex(ref);
      const page = (typeof pageIndex === 'number' ? pageIndex : 0) + 1;
      if (page > 0 && page <= (numPages || pdf.numPages || 1)) {
        setCurrentPage(page);
      }
    } catch (e) {
      console.warn('[PDF] gotoDest failed:', e);
    }
  };

  // 文本选择处理 - 支持跨段选择
  useEffect(() => {
    const handleTextSelection = () => {
      try {
        const selection = window.getSelection();
        if (!selection || !selection.toString().trim()) return;
        
        const rawText = selection.toString().trim();
        const text = rawText
          .replace(/\r\n/g, "\n")
          .replace(/\r/g, "\n")
          .replace(/([^\n])\n(?!\n)/g, "$1 ")
          .replace(/\n{3,}/g, "\n\n")
          .replace(/[ \t]{2,}/g, " ")
          .trim();
        const container = containerRef.current;
        if (!container) return;
        
        // 检查选择是否在 PDF 容器内（支持跨段选择）
        const range = selection.getRangeAt(0);
        const startContainer = range.startContainer;
        const endContainer = range.endContainer;
        
        // 只要选择的起始或结束在 PDF 容器内就接受
        const startInPdf = container.contains(startContainer);
        const endInPdf = container.contains(endContainer);
        
        if (!startInPdf && !endInPdf) {
          return;
        }

        const rect = range.getBoundingClientRect();
        
        onTextSelectRef.current({
          text,
          pageNumber: currentPageRef.current,
          position: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
        });
      } catch (err) {
        console.error("[PDF] 处理文本选择时出错:", err);
      }
    };

    // 使用 document 监听，延迟执行以确保选择完成
    const handleMouseUp = () => {
      setTimeout(handleTextSelection, 10);
    };

    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, []);

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setScale((prev) => Math.min(Math.max(prev + delta, 0.5), 3));
    }
  };

  // 滚动追踪：检测当前可见页面并更新阅读进度
  const handleScroll = useCallback(() => {
    if (!containerRef.current || numPages === 0 || !currentDocument) return;
    
    const container = containerRef.current;
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight - container.clientHeight;
    
    // 计算阅读进度 (0-1)
    const progress = scrollHeight > 0 ? scrollTop / scrollHeight : 0;
    
    // 估算当前页码（基于滚动位置）
    const estimatedPage = Math.max(1, Math.ceil((scrollTop / (container.scrollHeight / numPages)) + 0.5));
    const clampedPage = Math.min(estimatedPage, numPages);
    
    // 只在页码变化时更新 — mark as scroll-tracking to prevent scrollIntoView feedback
    if (clampedPage !== currentPageRef.current) {
      scrollTrackingRef.current = true;
      setCurrentPage(clampedPage);
      currentPageRef.current = clampedPage;
    }
    
    // 更新文档进度
    updateDocumentProgress(currentDocument.id, clampedPage, progress);
    // B2: Save precise scroll position (debounced via scrollTop integer)
    setLastPosition(currentDocument.id, `scroll:${Math.round(scrollTop)}`);
  }, [numPages, currentDocument, updateDocumentProgress, setCurrentPage, setLastPosition]);

  // 添加滚动事件监听
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // 拦截链接点击，仅允许文档内跳转
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleLinkClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest("a");
      if (!link) return;

      const href = link.getAttribute("href");
      if (!href) return;

      const lower = href.toLowerCase();
      if (lower.startsWith("http://") || lower.startsWith("https://")) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (href.startsWith("#")) {
        const pageMatch = href.match(/page=(\d+)/i);
        if (pageMatch) {
          e.preventDefault();
          e.stopPropagation();
          const targetPage = parseInt(pageMatch[1], 10);
          if (targetPage > 0 && targetPage <= numPages) {
            const holder = container.querySelector(`[data-page="${targetPage}"]`) as HTMLElement | null;
            holder?.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }
      }
    };

    container.addEventListener("click", handleLinkClick, true);
    return () => container.removeEventListener("click", handleLinkClick, true);
  }, [numPages]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-destructive">Error: {error}</div>
      </div>
    );
  }

  if (loading || !pdfUrl) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const handleZoomIn = () => setScale((prev) => Math.min(prev + 0.2, 3));
  const handleZoomOut = () => setScale((prev) => Math.max(prev - 0.2, 0.5));
  const handleResetZoom = () => setScale(1.0);

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      <div className="flex-1 flex overflow-hidden">
        {outline.length > 0 && !tocOpen && (
          <button
            type="button"
            className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-4 h-16 rounded-r-md bg-background/80 border border-l-0 border-border/60 shadow-sm backdrop-blur-sm flex items-center justify-center hover:bg-background hover:w-5 transition-all"
            onClick={() => setTocOpen(true)}
            title={b('打开目录', 'Open Contents')}
          >
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
          </button>
        )}
        {outline.length > 0 && tocOpen && (
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
        {outline.length > 0 && (
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
                  {(() => {
                    const renderItems = (items: any[], depth: number): any => {
                      return items.map((it, idx) => {
                        const title = typeof it?.title === 'string' ? it.title : '';
                        const sub = Array.isArray(it?.items) ? it.items : [];
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
                              className={`w-full text-left px-2 py-1 rounded-md hover:bg-muted/80 transition-colors truncate leading-snug ${textClass}`}
                              style={{ paddingLeft: 8 + depth * 14, borderLeft: depth > 0 ? '2px solid var(--border)' : 'none' }}
                              onClick={() => {
                                if (it?.dest) {
                                  void gotoDest(it.dest);
                                }
                              }}
                              title={title}
                            >
                              {title || 'Untitled'}
                            </button>
                            {sub.length > 0 && renderItems(sub, depth + 1)}
                          </div>
                        );
                      });
                    };
                    return renderItems(outline, 0);
                  })()}
                </div>
              </>
            )}
          </div>
        )}

        {outline.length > 0 && tocOpen && (
          <ResizeHandle
            direction="right"
            onResize={(delta) => {
              setTocWidth((w) => Math.min(420, Math.max(180, w + delta)));
            }}
          />
        )}

        {/* PDF 内容区域 */}
        <div
          ref={containerRef}
          className={`flex-1 overflow-auto p-4 ${effectiveDocDark ? 'bg-zinc-900' : 'bg-muted/30'}`}
          onWheel={handleWheel}
        >
          <div
            className="flex justify-center"
            style={effectiveDocDark ? { filter: 'invert(0.88) hue-rotate(180deg)' } : undefined}
          >
            <Document
              key={`${filePath}-${documentKey}`}
              file={pdfUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={(err) => {
                console.error("[PDF] Document onLoadError:", err);
                setError(err.message || "PDF加载失败");
              }}
              loading={
                <div className="text-muted-foreground">Parsing PDF...</div>
              }
              error={
                <div className="text-destructive">PDF render failed</div>
              }
            >
              {numPages > 0 && Array.from(new Array(numPages), (_, index) => {
                const pageNumber = index + 1;
                const shouldRender = visiblePages.has(pageNumber) || pageNumber === currentPage;
                return (
                  <div
                    key={`holder_${pageNumber}`}
                    data-page={pageNumber}
                    className="mb-4"
                    style={{ minHeight: Math.max(320, Math.round(pageWidth * 1.3)) }}
                  >
                    {shouldRender ? (
                      <Page
                        key={`page_${pageNumber}`}
                        pageNumber={pageNumber}
                        width={pageWidth}
                        renderTextLayer={true}
                        renderAnnotationLayer={true}
                        className="shadow-lg"
                      />
                    ) : (
                      <div className="w-full flex items-center justify-center text-muted-foreground text-sm" style={{ height: Math.max(320, Math.round(pageWidth * 1.3)) }}>
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                          <span>Page {pageNumber}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </Document>
          </div>
        </div>
      </div>
      
      <FloatingReaderToolbar
        zoomPercent={scale * 100}
        onZoomOut={handleZoomOut}
        onZoomIn={handleZoomIn}
        onReset={handleResetZoom}
        onSetZoomPercent={(nextPercent) => {
          const next = Math.min(3, Math.max(0.5, nextPercent / 100));
          setScale(next);
        }}
        canZoomOut={scale > 0.5}
        canZoomIn={scale < 3}
        pageCurrent={currentPage}
        pageTotal={numPages || currentDocument?.totalPages || 1}
        onSetPageCurrent={(nextPage) => {
          const total = numPages || currentDocument?.totalPages || 1;
          setCurrentPage(Math.min(Math.max(1, Math.floor(nextPage)), total));
        }}
        onPrevPage={() => setCurrentPage(Math.max(1, currentPage - 1))}
        onNextPage={() => setCurrentPage(Math.min((numPages || currentDocument?.totalPages || 1), currentPage + 1))}
        canPrevPage={currentPage > 1}
        canNextPage={currentPage < (numPages || currentDocument?.totalPages || 1)}
        docDark={effectiveDocDark}
        onToggleDocDark={() => setDocDarkOverride((prev) => (prev === null ? !appDark : !prev))}
        showDocThemeToggle
        hasToc={outline.length > 0}
        tocOpen={tocOpen}
        onToggleToc={() => setTocOpen((prev) => !prev)}
        containerStyle={{ left: outline.length > 0 && tocOpen ? `calc(50% + ${tocWidth / 2}px)` : '50%' }}
      />
    </div>
  );
}
