import { useCallback, useState, useEffect, useRef } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { PDFReader } from "@/components/reader/PDFReader";
import { EPUBReader } from "@/components/reader/EPUBReader";
import { TextReader } from "@/components/reader/TextReader";
import { WelcomeScreen } from "@/components/reader/WelcomeScreen";
import { AIPanel } from "@/components/ai/AIPanel";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ResizeHandle } from "@/components/ui/ResizeHandle";
import { WordPopup } from "@/components/ui/WordPopup";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { HelpModal } from "@/components/help/HelpModal";
import { DocumentLibrary } from "@/components/library/DocumentLibrary";
import { SetupWizard } from "@/components/setup/SetupWizard";
import { useDocumentStore } from "@/stores/documentStore";
import { invoke, Channel } from "@tauri-apps/api/core";
import { isSingleCJKWord, isSingleWord } from "@/services/dictionary";
import { useSettingsStore } from "@/stores/settingsStore";
import { useI18n } from "@/i18n";
import { Menu, Moon, Sun, Bot, X, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { TextSelection, Document } from "@/types";

type DocType = "pdf" | "epub" | "txt" | "md";

function getDocType(filePath: string): DocType {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (ext === "epub") return "epub";
  if (ext === "txt") return "txt";
  if (ext === "md") return "md";
  return "pdf";
}

function App() {
  const { t } = useI18n();
  const [setupDone, setSetupDone] = useState(() => localStorage.getItem('aireader_setup_completed') === '1');
  const { 
    currentDocument, setCurrentDocument, setDocuments, documents, 
    setSelectedText,
    sidebarOpen, sidebarWidth, setSidebarWidth,
    aiPanelOpen, aiPanelWidth, setAIPanelWidth,
    openAIPanel, toggleSidebar, toggleAIPanel,
    settingsOpen, settingsInitialTab,
    helpOpen,
    libraryOpen,
    closeSettings,
    closeHelp,
    closeLibrary
  } = useDocumentStore();

  // Load saved settings from combined localStorage on mount (before auto-start)
  const didLoadSettingsRef = useRef(false);
  if (!didLoadSettingsRef.current) {
    didLoadSettingsRef.current = true;
    useSettingsStore.getState().loadSettings();
  }

  const dictEnableEnToZh = useSettingsStore((s) => s.dictEnableEnToZh);
  const dictEnableZhToEn = useSettingsStore((s) => s.dictEnableZhToEn);
  const documentsDir = useSettingsStore((s) => s.documentsDir);

  // Dark mode
  const [isDark, setIsDark] = useState(() => typeof window !== 'undefined' && document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
      setIsDark(true);
    }
  }, []);
  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  // 双击单词弹窗状态
  const [wordPopup, setWordPopup] = useState<{
    word: string;
    position: { x: number; y: number };
  } | null>(null);

  // 双击选词处理 - 仅在文档区域生效
  const mainRef = useRef<HTMLElement>(null);

  const extractLookupToken = useCallback((raw: string): string | null => {
    const t = String(raw || '').trim();
    if (!t) return null;
    if (isSingleWord(t) || isSingleCJKWord(t)) return t;

    const en = t.match(/[A-Za-z]+(?:-[A-Za-z]+)?/);
    if (en && isSingleWord(en[0])) return en[0];

    const zh = t.match(/[\u4e00-\u9fff]{1,20}/);
    if (zh && isSingleCJKWord(zh[0])) return zh[0];

    return null;
  }, []);

  const addPathsToLibrary = useCallback(
    (paths: string[], autoOpen = true, opts?: { isCopy?: boolean; originalPaths?: string[] }) => {
      if (paths.length === 0) return;

      let nextDocs = [...documents];
      let firstToOpen: Document | null = null;

      for (let i = 0; i < paths.length; i++) {
        const openPath = paths[i];
        if (!openPath) continue;

        const existing = nextDocs
          .filter((d) => d.path === openPath)
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];

        if (existing) {
          if (!firstToOpen) firstToOpen = existing;
          continue;
        }

        const fileName = openPath.split(/[/\\]/).pop() || t("app.untitled");
        const docType = getDocType(openPath);

        const newDoc: Document = {
          id: crypto.randomUUID(),
          title: fileName,
          type: docType,
          path: openPath,
          totalPages: 0,
          currentPage: 1,
          readingProgress: 0,
          isCopy: opts?.isCopy,
          originalPath: opts?.originalPaths?.[i] || (opts?.isCopy === false ? openPath : undefined),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        nextDocs.push(newDoc);
        if (!firstToOpen) firstToOpen = newDoc;
      }

      if (nextDocs.length !== documents.length) {
        setDocuments(nextDocs);
      }
      if (autoOpen && firstToOpen) {
        setCurrentDocument(firstToOpen);
      }
    },
    [documents, setCurrentDocument, setDocuments, t]
  );

  // C7: Auto-start AI on startup if previously configured (silent, failure-safe)
  const [aiAutoStartFailed, setAiAutoStartFailed] = useState(false);
  const didAutoStartRef = useRef(false);
  useEffect(() => {
    if (!setupDone) return; // skip if setup wizard is active
    if (didAutoStartRef.current) return;
    didAutoStartRef.current = true;
    (async () => {
      const s = useSettingsStore.getState();
      if (!s.builtinAutoEnabled || s.llmProvider !== 'builtin_local') {
        return;
      }
      try {
        console.log('[App] Auto-starting AI with model:', s.builtinModelId);
        await invoke("builtin_llm_ensure_running", {
          options: {
            modelId: s.builtinModelId,
            mode: "bundled_only",
            computeMode: s.builtinComputeMode,
            gpuBackend: s.builtinGpuBackend,
            gpuLayers: s.builtinGpuLayers,
            cudaVersion: s.builtinCudaVersion,
          },
          onProgress: new Channel(),
        });
        console.log('[App] AI auto-started successfully');
      } catch (e) {
        console.warn('[App] AI auto-start failed (non-blocking):', e);
        setAiAutoStartFailed(true);
      }
    })();
  }, [setupDone]);

  // T1: Auto-import sample documents on first launch
  const didImportSamplesRef = useRef(false);
  useEffect(() => {
    if (didImportSamplesRef.current) return;
    didImportSamplesRef.current = true;
    const key = 'aireader_samples_imported';
    if (localStorage.getItem(key)) return;
    (async () => {
      try {
        const imported = await invoke<string[]>("import_samples", { destDir: documentsDir || null });
        if (imported.length > 0) {
          addPathsToLibrary(imported, false, { isCopy: true });
          localStorage.setItem(key, '1');
        }
      } catch (e) {
        console.warn('[App] Failed to import samples:', e);
      }
    })();
  }, [addPathsToLibrary, documentsDir]);

  const didDedupDocumentsRef = useRef(false);

  useEffect(() => {
    if (didDedupDocumentsRef.current) return;
    if (documents.length === 0) return;

    didDedupDocumentsRef.current = true;

    (async () => {
      try {
        const byPath = new Map<string, Document[]>();
        for (const d of documents) {
          const list = byPath.get(d.path) ?? [];
          list.push(d);
          byPath.set(d.path, list);
        }

        let nextDocs = [...documents];
        for (const [path, docs] of byPath.entries()) {
          if (docs.length <= 1) continue;

          const sorted = [...docs].sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
          const canonical = sorted[0];
          const duplicates = sorted.slice(1);

          for (const dup of duplicates) {
            await invoke<number>("reassign_notes_document", {
              oldDocumentId: dup.id,
              newDocumentId: canonical.id,
            });
          }

          nextDocs = nextDocs.filter((d) => d.path !== path || d.id === canonical.id);

          if (currentDocument && docs.some((d) => d.id === currentDocument.id) && currentDocument.id !== canonical.id) {
            setCurrentDocument(canonical);
          }
        }

        if (nextDocs.length !== documents.length) {
          setDocuments(nextDocs);
        }
      } catch (error) {
        console.error("Failed to dedupe documents:", error);
      }
    })();
  }, [documents, currentDocument, setCurrentDocument, setDocuments]);
  
  useEffect(() => {
    const handleDoubleClick = (e: MouseEvent) => {
      if (!currentDocument) return;
      // 检查是否在文档区域内
      if (!mainRef.current?.contains(e.target as Node)) return;

      const x = e.clientX;
      const y = e.clientY;
      window.setTimeout(() => {
        const getTokenAtPoint = (): string | null => {
          try {
            const doc = document;
            let node: Node | null = null;
            let offset = 0;

            const anyDoc = doc as any;
            if (typeof anyDoc.caretRangeFromPoint === 'function') {
              const range = anyDoc.caretRangeFromPoint(x, y) as Range | null;
              node = range?.startContainer || null;
              offset = typeof range?.startOffset === 'number' ? range.startOffset : 0;
            } else if (typeof anyDoc.caretPositionFromPoint === 'function') {
              const pos = anyDoc.caretPositionFromPoint(x, y) as any;
              node = pos?.offsetNode || null;
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

            const resolveTextPoint = (container: Node | null, off: number): { node: Text; offset: number } | null => {
              if (!container) return null;
              if (container.nodeType === Node.TEXT_NODE) {
                return { node: container as Text, offset: off };
              }
              if (container.nodeType !== Node.ELEMENT_NODE) return null;
              const el = container as Element;
              const kids = Array.from(el.childNodes);
              const idx = Math.min(Math.max(0, off), kids.length);

              return (
                findTextIn(kids[idx] || null, 'start') ||
                findTextIn(kids[idx - 1] || null, 'end') ||
                findTextIn(el, 'start')
              );
            };

            const textPoint = resolveTextPoint(node, offset);
            if (!textPoint) return null;

            const text = textPoint.node.textContent || '';
            if (!text) return null;

            const i = Math.min(Math.max(0, textPoint.offset), text.length);
            const isLatin = (ch: string) => /[A-Za-z]/.test(ch);
            const isLatinWord = (ch: string) => /[A-Za-z-]/.test(ch);
            const isCjk = (ch: string) => /[\u4e00-\u9fff]/.test(ch);

            const center = text[i] || text[i - 1] || '';
            if (isCjk(center)) {
              let l = i;
              let r = i;
              while (l > 0 && isCjk(text[l - 1])) l--;
              while (r < text.length && isCjk(text[r])) r++;
              const tok = text.slice(l, r).trim();
              return extractLookupToken(tok);
            }

            if (isLatin(center) || isLatin(text[i - 1] || '')) {
              let l = i;
              let r = i;
              while (l > 0 && isLatinWord(text[l - 1])) l--;
              while (r < text.length && isLatinWord(text[r])) r++;
              const tok = text.slice(l, r).trim();
              return extractLookupToken(tok);
            }

            return null;
          } catch {
            return null;
          }
        };

        const selection = window.getSelection();
        const selected = selection ? selection.toString().trim() : '';
        const token = selected && !/[\s\u00A0]/.test(selected) ? extractLookupToken(selected) : null;
        const finalToken = token || getTokenAtPoint();
        if (!finalToken) return;

        if (isSingleWord(finalToken) && !dictEnableEnToZh) return;
        if (isSingleCJKWord(finalToken) && !dictEnableZhToEn) return;

        e.preventDefault();
        setWordPopup({
          word: finalToken,
          position: { x, y },
        });
      }, 0);
    };

    document.addEventListener("dblclick", handleDoubleClick);
    return () => document.removeEventListener("dblclick", handleDoubleClick);
  }, [currentDocument, extractLookupToken, dictEnableEnToZh, dictEnableZhToEn]);

  useEffect(() => {
    const onIframeDblClick = (event: Event) => {
      if (!currentDocument) return;
      if (currentDocument.type !== 'epub') return;
      const detail = (event as CustomEvent)?.detail as any;
      const token = extractLookupToken(typeof detail?.word === 'string' ? detail.word : '');
      const x = typeof detail?.x === 'number' ? detail.x : 0;
      const y = typeof detail?.y === 'number' ? detail.y : 0;
      if (!token) return;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;

      if (isSingleWord(token) && !dictEnableEnToZh) return;
      if (isSingleCJKWord(token) && !dictEnableZhToEn) return;

      setWordPopup({ word: token, position: { x, y } });
    };

    window.addEventListener('aireader-iframe-dblclick', onIframeDblClick as any);
    return () => window.removeEventListener('aireader-iframe-dblclick', onIframeDblClick as any);
  }, [currentDocument, extractLookupToken, dictEnableEnToZh, dictEnableZhToEn]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = String(e.key || '').toLowerCase();
      const isDevtools = e.key === 'F12' || ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'i');
      if (!isDevtools) return;
      e.preventDefault();
      e.stopPropagation();
      invoke('open_devtools').catch(() => {});
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  const handleOpenFile = useCallback(async () => {
    try {
      const { open, ask } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: t("app.open_dialog.filter_name"),
            extensions: ["pdf", "epub", "txt", "md"],
          },
        ],
      });

      const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];
      if (paths.length === 0) return;

      // D2: Ask user whether to import a copy or open directly
      const importCopy = await ask(
        t("app.import_option.msg"),
        {
          title: t("app.import_option.title"),
          kind: "info",
          okLabel: t("app.import_option.ok"),
          cancelLabel: t("app.import_option.cancel"),
        }
      );

      if (importCopy) {
        const imported: string[] = [];
        const importedOriginals: string[] = [];
        const failed: string[] = [];
        for (const p of paths) {
          try {
            const selectedType = getDocType(p);
            if (selectedType === "md") {
              imported.push(
                await invoke<string>("import_markdown_copy", {
                  sourcePath: p,
                  destDir: documentsDir || null,
                })
              );
            } else {
              imported.push(
                await invoke<string>("import_document_copy", {
                  sourcePath: p,
                  destDir: documentsDir || null,
                })
              );
            }
            importedOriginals.push(p);
          } catch (err) {
            console.warn(`[App] Failed to import "${p}":`, err);
            failed.push(p.split(/[/\\]/).pop() || p);
          }
        }
        if (imported.length > 0) {
          const isBatch = imported.length > 1;
          addPathsToLibrary(imported, !isBatch, { isCopy: true, originalPaths: importedOriginals });
        }
        if (failed.length > 0) {
          const { message } = await import("@tauri-apps/plugin-dialog");
          await message(
            t("app.import_failed_partial").replace("{files}", failed.join(", ")) || `Failed to import: ${failed.join(", ")}`,
            { title: t("app.import_error_title") || "Import Error", kind: "error" }
          );
        }
      } else {
        // Open directly — use original paths without copying
        const isBatch = paths.length > 1;
        addPathsToLibrary(paths, !isBatch, { isCopy: false });
      }
    } catch (error) {
      console.error("Failed to open file:", error);
    }
  }, [addPathsToLibrary, documentsDir, t]);

  const handleImportFolder = useCallback(async () => {
    try {
      const { open, ask } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
      } as any);

      const folder = typeof selected === "string" ? selected : null;
      if (!folder) return;

      const importCopy = await ask(
        t("app.import_option.msg"),
        {
          title: t("app.import_option.title"),
          kind: "info",
          okLabel: t("app.import_option.ok"),
          cancelLabel: t("app.import_option.cancel"),
        }
      );

      if (importCopy) {
        const imported = await invoke<string[]>("import_folder_copies", { folderPath: folder, destDir: documentsDir || null });
        const originalPaths = await invoke<string[]>("scan_folder_documents", { folderPath: folder });
        addPathsToLibrary(imported, false, { isCopy: true, originalPaths });
      } else {
        const paths = await invoke<string[]>("scan_folder_documents", { folderPath: folder });
        addPathsToLibrary(paths, false, { isCopy: false });
      }
    } catch (error) {
      console.error("Failed to import folder:", error);
    }
  }, [addPathsToLibrary, documentsDir, t]);

  const handleTextSelect = useCallback(
    (selection: TextSelection) => {
      if (selection.text.length > 0) {
        setSelectedText(selection);

        const text = selection.text.trim();
        const token = !/[\s\u00A0]/.test(text) ? extractLookupToken(text) : null;
        const isLookupToken =
          !!token &&
          ((isSingleWord(token) && dictEnableEnToZh) || (isSingleCJKWord(token) && token.length <= 6 && dictEnableZhToEn));
        if (isLookupToken && token && (currentDocument?.type === 'epub' || currentDocument?.type === 'md')) {
          setWordPopup({
            word: token,
            position: { x: selection.position.x, y: selection.position.y },
          });
        }
        if (!isLookupToken) {
          openAIPanel();
        } else if (aiPanelOpen) {
          openAIPanel();
        }
      }
    },
    [setSelectedText, openAIPanel, aiPanelOpen, extractLookupToken, dictEnableEnToZh, dictEnableZhToEn, currentDocument]
  );

  // Show setup wizard on first launch
  if (!setupDone) {
    return <SetupWizard onComplete={() => setSetupDone(true)} />;
  }

  return (
    <div className="h-screen flex bg-background text-foreground">
      {sidebarOpen && (
        <>
          <Sidebar onOpenFile={handleOpenFile} style={{ width: sidebarWidth }} />
          <ResizeHandle 
            direction="right" 
            onResize={(delta) => setSidebarWidth(sidebarWidth + delta)} 
          />
        </>
      )}
      <main ref={mainRef} className="flex-1 flex flex-col overflow-hidden relative">
        {/* Sidebar expand button — welcome page only (document view uses Menu button in toolbar) */}
        {!sidebarOpen && !currentDocument && (
          <button
            onClick={toggleSidebar}
            className="absolute left-3 top-3 z-20 flex items-center justify-center w-8 h-8 rounded-lg bg-background/70 hover:bg-background/90 border border-border/50 hover:border-border backdrop-blur-md shadow-sm transition-all cursor-pointer group"
            title={t('sidebar.show')}
          >
            <PanelLeftOpen className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          </button>
        )}
        {/* Floating toolbar for document view */}
        {currentDocument && (
          <div className="flex items-center justify-between px-2 py-1 border-b border-border/40 bg-background/80 backdrop-blur-sm z-10 flex-shrink-0">
            <div className="flex items-center gap-1 min-w-0">
              <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={toggleSidebar} title={sidebarOpen ? t('sidebar.hide') : t('sidebar.show')}>
                <Menu className="w-4 h-4" />
              </Button>
              <span className="text-xs text-muted-foreground truncate max-w-[300px]" title={currentDocument.title}>
                {currentDocument.title}
              </span>
              <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0 text-muted-foreground hover:text-foreground" onClick={() => setCurrentDocument(null)} title="Close">
                <X className="w-3 h-3" />
              </Button>
            </div>
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleTheme} title={isDark ? t("theme.switch_to_light") : t("theme.switch_to_dark")}>
                {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              </Button>
              <Button
                variant={aiPanelOpen ? "secondary" : "default"}
                size="sm"
                onClick={toggleAIPanel}
                className="h-7 px-2.5 text-xs"
              >
                <Bot className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
        <div className="flex-1 flex overflow-hidden relative">
          <ErrorBoundary>
            {currentDocument ? (
              currentDocument.type === "epub" ? (
                <div className="relative h-full w-full">
                  <EPUBReader filePath={currentDocument.path} onTextSelect={handleTextSelect} />
                </div>
              ) : currentDocument.type === "txt" || currentDocument.type === "md" ? (
                <TextReader
                  filePath={currentDocument.path}
                  onTextSelect={handleTextSelect}
                />
              ) : (
                <PDFReader
                  filePath={currentDocument.path}
                  onTextSelect={handleTextSelect}
                />
              )
            ) : (
              <WelcomeScreen
                onOpenFile={handleOpenFile}
                onImportFolder={handleImportFolder}
                isDark={isDark}
                onToggleTheme={toggleTheme}
                aiAutoStartFailed={aiAutoStartFailed}
              />
            )}
          </ErrorBoundary>
          
          {/* 双击单词弹窗 - 限制在文档区域内 */}
          {wordPopup && (
            <WordPopup
              word={wordPopup.word}
              position={wordPopup.position}
              onClose={() => setWordPopup(null)}
            />
          )}
        </div>
      </main>
      {aiPanelOpen && (
        <>
          <ResizeHandle 
            direction="left" 
            onResize={(delta) => setAIPanelWidth(aiPanelWidth + delta)} 
          />
          <AIPanel style={{ width: aiPanelWidth }} />
        </>
      )}

      <SettingsModal isOpen={settingsOpen} onClose={closeSettings} initialTab={settingsInitialTab} />
      <HelpModal isOpen={helpOpen} onClose={closeHelp} />
      {libraryOpen && (
        <DocumentLibrary onImportFiles={handleOpenFile} onImportFolder={handleImportFolder} onClose={closeLibrary} />
      )}
    </div>
  );
}

export default App;
