import { useEffect, useState, useRef, useCallback, type CSSProperties } from "react";
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  Moon,
  Sun,
  ChevronLeft,
  ChevronRight,
  Columns2,
  ScrollText,
  List,
  Pin,
  PinOff,
} from "lucide-react";
import { useI18n } from "@/i18n";

interface FloatingReaderToolbarProps {
  zoomPercent: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onSetZoomPercent?: (nextPercent: number) => void;
  canZoomIn?: boolean;
  canZoomOut?: boolean;

  readingMode?: 'paginated' | 'scrolled';
  onToggleReadingMode?: () => void;
  showReadingModeToggle?: boolean;

  pageCurrent?: number;
  pageTotal?: number;
  onPrevPage?: () => void;
  onNextPage?: () => void;
  onSetPageCurrent?: (nextPage: number) => void;
  canPrevPage?: boolean;
  canNextPage?: boolean;

  docDark?: boolean;
  onToggleDocDark?: () => void;
  showDocThemeToggle?: boolean;

  hasToc?: boolean;
  tocOpen?: boolean;
  onToggleToc?: () => void;

  containerStyle?: CSSProperties;
  containerClassName?: string;
}

export function FloatingReaderToolbar({
  zoomPercent,
  onZoomIn,
  onZoomOut,
  onReset,
  onSetZoomPercent,
  canZoomIn = true,
  canZoomOut = true,
  readingMode = 'paginated',
  onToggleReadingMode,
  showReadingModeToggle = false,
  pageCurrent,
  pageTotal,
  onPrevPage,
  onNextPage,
  onSetPageCurrent,
  canPrevPage = true,
  canNextPage = true,
  docDark,
  onToggleDocDark,
  showDocThemeToggle = false,
  hasToc = false,
  tocOpen = false,
  onToggleToc,
  containerStyle,
  containerClassName,
}: FloatingReaderToolbarProps) {
  const { b } = useI18n();
  const [pinned, setPinned] = useState(false);
  const [visible, setVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const resetHideTimer = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setVisible(true);
    if (!pinned) {
      hideTimerRef.current = setTimeout(() => setVisible(false), 3000);
    }
  }, [pinned]);

  useEffect(() => {
    if (pinned) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      setVisible(true);
      return;
    }
    resetHideTimer();
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, [pinned, resetHideTimer]);

  const showPagination =
    typeof pageCurrent === "number" &&
    typeof pageTotal === "number" &&
    !!onPrevPage &&
    !!onNextPage;

  const [pageInput, setPageInput] = useState<string>(
    typeof pageCurrent === "number" ? String(pageCurrent) : ""
  );
  const [zoomInput, setZoomInput] = useState<string>(String(Math.round(zoomPercent)));

  useEffect(() => {
    if (typeof pageCurrent === "number") {
      setPageInput(String(pageCurrent));
    }
  }, [pageCurrent]);

  useEffect(() => {
    setZoomInput(String(Math.round(zoomPercent)));
  }, [zoomPercent]);

  const commitPage = () => {
    if (!onSetPageCurrent) {
      if (typeof pageCurrent === "number") setPageInput(String(pageCurrent));
      return;
    }
    const next = Number.parseInt(pageInput, 10);
    if (!Number.isFinite(next) || next <= 0) {
      if (typeof pageCurrent === "number") setPageInput(String(pageCurrent));
      return;
    }
    const total = typeof pageTotal === "number" && pageTotal > 0 ? pageTotal : next;
    const clamped = Math.min(Math.max(1, next), total);
    if (clamped !== next) setPageInput(String(clamped));
    onSetPageCurrent(clamped);
  };

  const commitZoom = () => {
    if (!onSetZoomPercent) {
      setZoomInput(String(Math.round(zoomPercent)));
      return;
    }
    const next = Number.parseFloat(zoomInput);
    if (!Number.isFinite(next) || next <= 0) {
      setZoomInput(String(Math.round(zoomPercent)));
      return;
    }
    onSetZoomPercent(next);
  };

  return (
    <div
      ref={toolbarRef}
      className={`absolute bottom-3 left-1/2 -translate-x-1/2 z-30 transition-all duration-300 ${containerClassName || ''}`}
      style={containerStyle}
      onMouseEnter={resetHideTimer}
      onMouseMove={resetHideTimer}
    >
      {!visible && !pinned ? (
        <button
          onClick={() => { setVisible(true); resetHideTimer(); }}
          className="pointer-events-auto mx-auto flex items-center justify-center w-10 h-3 rounded-full bg-background/50 border border-border/40 hover:bg-background/80 transition-colors cursor-pointer"
          title={b('显示工具栏', 'Show toolbar')}
        >
          <div className="w-6 h-0.5 rounded-full bg-muted-foreground/40" />
        </button>
      ) : (
      <div className="pointer-events-auto flex items-center gap-0.5 px-1.5 py-1 rounded-full bg-background/70 border border-border/60 shadow-lg backdrop-blur-xl">
        {hasToc && onToggleToc && (
          <>
            <button
              onClick={onToggleToc}
              className={`h-7 w-7 inline-flex items-center justify-center rounded-full transition-colors ${tocOpen ? 'bg-primary/15 text-primary' : 'hover:bg-muted/50'}`}
              title={tocOpen ? b('收起目录', 'Close Contents') : b('打开目录', 'Open Contents')}
            >
              <List className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-border/60 mx-1" />
          </>
        )}
        {showPagination && (
          <>
            <button
              onClick={onPrevPage}
              disabled={!canPrevPage}
              className="h-7 w-7 inline-flex items-center justify-center rounded-full hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:pointer-events-none"
              title={b('上一页', 'Previous page')}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {onSetPageCurrent ? (
              <div className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                <input
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value)}
                  onBlur={commitPage}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      (e.target as HTMLInputElement).blur();
                    } else if (e.key === "Escape") {
                      if (typeof pageCurrent === "number") setPageInput(String(pageCurrent));
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  inputMode="numeric"
                  className="h-6 w-11 px-1 rounded bg-transparent border border-border/60 text-center outline-none focus:border-border"
                  title={b('跳转页码', 'Go to page')}
                />
                <span>/</span>
                <span className="min-w-[20px] text-center">{pageTotal}</span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground min-w-[72px] text-center tabular-nums">
                {pageCurrent} / {pageTotal}
              </span>
            )}
            <button
              onClick={onNextPage}
              disabled={!canNextPage}
              className="h-7 w-7 inline-flex items-center justify-center rounded-full hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:pointer-events-none"
              title={b('下一页', 'Next page')}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-border/60 mx-1" />
          </>
        )}

        <button
          onClick={onZoomOut}
          disabled={!canZoomOut}
          className="h-7 w-7 inline-flex items-center justify-center rounded-full hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:pointer-events-none"
          title={b('缩小', 'Zoom out')}
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        {onSetZoomPercent ? (
          <div className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
            <input
              value={zoomInput}
              onChange={(e) => setZoomInput(e.target.value)}
              onBlur={commitZoom}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  (e.target as HTMLInputElement).blur();
                } else if (e.key === "Escape") {
                  setZoomInput(String(Math.round(zoomPercent)));
                  (e.target as HTMLInputElement).blur();
                }
              }}
              inputMode="decimal"
              className="h-6 w-12 px-1 rounded bg-transparent border border-border/60 text-center outline-none focus:border-border"
              title={b('设置缩放百分比', 'Set zoom percent')}
            />
            <span>%</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground min-w-[44px] text-center tabular-nums">
            {Math.round(zoomPercent)}%
          </span>
        )}
        <button
          onClick={onZoomIn}
          disabled={!canZoomIn}
          className="h-7 w-7 inline-flex items-center justify-center rounded-full hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:pointer-events-none"
          title={b('放大', 'Zoom in')}
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-border/60 mx-1" />
        <button
          onClick={onReset}
          className="h-7 w-7 inline-flex items-center justify-center rounded-full hover:bg-muted/50 transition-colors"
          title={b('重置', 'Reset')}
        >
          <RotateCw className="w-4 h-4" />
        </button>

        {showReadingModeToggle && onToggleReadingMode && (
          <button
            onClick={onToggleReadingMode}
            className="h-7 w-7 inline-flex items-center justify-center rounded-full hover:bg-muted/50 transition-colors"
            title={readingMode === 'scrolled' ? b('切换到分页模式', 'Switch to paginated') : b('切换到滚动模式', 'Switch to scrolled')}
          >
            {readingMode === 'scrolled' ? (
              <ScrollText className="w-4 h-4" />
            ) : (
              <Columns2 className="w-4 h-4" />
            )}
          </button>
        )}

        {showDocThemeToggle && onToggleDocDark && (
          <button
            onClick={onToggleDocDark}
            className="h-7 w-7 inline-flex items-center justify-center rounded-full hover:bg-muted/50 transition-colors"
            title={docDark ? b('文档切换到亮色', 'Document light mode') : b('文档切换到暗色', 'Document dark mode')}
          >
            {docDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        )}
        <div className="w-px h-5 bg-border/60 mx-0.5" />
        <button
          onClick={() => setPinned(!pinned)}
          className={`h-7 w-7 inline-flex items-center justify-center rounded-full transition-colors ${pinned ? 'bg-primary/15 text-primary' : 'hover:bg-muted/50'}`}
          title={pinned ? b('取消固定', 'Unpin toolbar') : b('固定工具栏', 'Pin toolbar')}
        >
          {pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
        </button>
      </div>
      )}
    </div>
  );
}
