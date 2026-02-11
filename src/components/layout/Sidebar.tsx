import { useMemo, useState, useEffect, useCallback } from "react";
import { ChevronUp, ChevronDown, FileText, FolderOpen, Settings, BookOpen, Library, HelpCircle, Search, X, Trash2, AlertTriangle } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/Button";
import { useDocumentStore } from "@/stores/documentStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import type { Document } from "@/types";

interface SidebarProps {
  onOpenFile: () => void;
  style?: React.CSSProperties;
}

export function Sidebar({ onOpenFile, style }: SidebarProps) {
  const { documents, currentDocument, setCurrentDocument, setDocuments, setSelectedText, closeAIPanel, openSettings, openLibrary, openHelp, flushRecentOrder } = useDocumentStore();
  const { t, b } = useI18n();
  const documentsDir = useSettingsStore((s) => s.documentsDir);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "name" | "progress">("recent");
  const [sortDesc, setSortDesc] = useState(true);
  const [typeFilter, setTypeFilter] = useState<"all" | Document["type"]>("all");
  const [brokenLinks, setBrokenLinks] = useState<Set<string>>(new Set());

  // N5: Check if linked (non-copy) documents still exist
  useEffect(() => {
    const linked = documents.filter((d) => d.isCopy === false);
    if (linked.length === 0) { setBrokenLinks(new Set()); return; }
    (async () => {
      const { exists } = await import("@tauri-apps/plugin-fs");
      const broken = new Set<string>();
      for (const doc of linked) {
        try {
          if (!(await exists(doc.path))) broken.add(doc.id);
        } catch { broken.add(doc.id); }
      }
      setBrokenLinks(broken);
    })();
  }, [documents]);

  // N6: Delete document with confirmation
  const handleDeleteDoc = useCallback(async (doc: Document, e: React.MouseEvent) => {
    e.stopPropagation();
    const { confirm } = await import("@tauri-apps/plugin-dialog");
    const ok = await confirm(
      b(`确定要从文档库中删除「${doc.title}」吗？${doc.isCopy ? '\n副本文件也会被删除。' : ''}`,
        `Remove "${doc.title}" from library?${doc.isCopy ? '\nThe copied file will also be deleted.' : ''}`),
      { title: b('删除文档', 'Remove Document'), kind: 'warning', okLabel: b('删除', 'Delete'), cancelLabel: b('取消', 'Cancel') }
    );
    if (!ok) return;
    // If it's a copy, delete physical file
    if (doc.isCopy === true) {
      try { await invoke('delete_document_copy', { path: doc.path, documentsDir: documentsDir || null }); } catch (err) { console.warn('[Sidebar] delete copy failed:', err); }
    }
    const newDocs = documents.filter((d) => d.id !== doc.id);
    setDocuments(newDocs);
    if (currentDocument?.id === doc.id) setCurrentDocument(null);
  }, [documents, currentDocument, setDocuments, setCurrentDocument, b, documentsDir]);

  const displayedDocuments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = documents
      .filter((d) => (q ? d.title.toLowerCase().includes(q) : true))
      .filter((d) => (typeFilter === "all" ? true : d.type === typeFilter));

    const dir = sortDesc ? -1 : 1;
    return [...list].sort((a, b) => {
      if (sortBy === "name") {
        return a.title.localeCompare(b.title) * dir;
      }
      if (sortBy === "progress") {
        return (a.readingProgress - b.readingProgress) * dir;
      }
      const at = new Date(a.updatedAt).getTime();
      const bt = new Date(b.updatedAt).getTime();
      return (at - bt) * dir;
    });
  }, [documents, searchQuery, sortBy, sortDesc, typeFilter]);

  const handleGoHome = () => {
    setSelectedText(null);
    setCurrentDocument(null);
    closeAIPanel();
  };

  return (
    <div className="h-full bg-card border-r border-border flex flex-col" style={style}>
      <div className="p-4 border-b border-border">
        <button
          type="button"
          onClick={handleGoHome}
          className="flex items-center gap-2.5 mb-4 w-full text-left group"
          title={t("common.back_to_home")}
        >
          <div className="w-7 h-7 rounded bg-primary/15 flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-primary" />
          </div>
          <span className="text-[13px] font-black uppercase tracking-[0.1em]"><span className="text-primary">Ai</span><span className="text-foreground/80">Reader</span></span>
        </button>
        <Button onClick={onOpenFile} className="w-full" size="sm">
          <FolderOpen className="w-4 h-4 mr-2" />
          {t("common.open_file")}
        </Button>
      </div>

      {/* Search & filter — fixed, not scrollable */}
      <div className="px-2 pt-2 pb-1 space-y-1.5 flex-shrink-0">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
          {t("sidebar.documents")}
        </div>
        <div className="px-2 space-y-1.5">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("sidebar.search_placeholder")}
              className="w-full pl-7 pr-7 py-1 border border-border rounded-lg bg-background text-sm focus:ring-1 focus:ring-primary/40 focus:border-primary/40 outline-none transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-sm text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            <select
              value={sortBy}
              onChange={(e) => {
                const v = e.target.value as any;
                flushRecentOrder();
                setSortBy(v);
                if (v === "name") setSortDesc(false);
                if (v === "progress") setSortDesc(true);
                if (v === "recent") setSortDesc(true);
              }}
              className="flex-1 min-w-0 px-1.5 py-1 border border-border rounded-lg bg-background text-xs focus:ring-1 focus:ring-primary/40 outline-none transition-colors"
              aria-label={t("sidebar.sort.label")}
              title={t("sidebar.sort.label")}
            >
              <option value="recent">{t("sidebar.sort.recent")}</option>
              <option value="name">{t("sidebar.sort.name")}</option>
              <option value="progress">{t("sidebar.sort.progress")}</option>
            </select>
            <button
              type="button"
              className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-border bg-background hover:bg-accent transition-colors flex-shrink-0"
              onClick={() => setSortDesc((v) => !v)}
              title={sortDesc ? t("sidebar.sort.order.desc") : t("sidebar.sort.order.asc")}
            >
              {sortDesc ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />}
            </button>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="flex-1 min-w-0 px-1.5 py-1 border border-border rounded-lg bg-background text-xs focus:ring-1 focus:ring-primary/40 outline-none transition-colors"
              aria-label={t("sidebar.filter.type")}
              title={t("sidebar.filter.type")}
            >
              <option value="all">{t("common.all")}</option>
              <option value="pdf">{t("common.type.pdf")}</option>
              <option value="epub">{t("common.type.epub")}</option>
              <option value="md">{t("common.type.md")}</option>
              <option value="txt">{t("common.type.txt")}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Document list — scrollable */}
      <div className="flex-1 overflow-auto px-2 pb-2">
        {displayedDocuments.length === 0 ? (
          <div className="text-sm text-muted-foreground px-2 py-4 text-center">
            {t("sidebar.no_documents")}
          </div>
        ) : (
          <div className="space-y-1">
            {displayedDocuments.map((doc: Document) => (
              <div
                key={doc.id}
                className={cn(
                  "group w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm text-left transition-colors cursor-pointer",
                  currentDocument?.id === doc.id
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-accent"
                )}
                onClick={() => setCurrentDocument(doc)}
              >
                <FileText className={cn("w-4 h-4 flex-shrink-0", brokenLinks.has(doc.id) && "text-destructive")} />
                <span className="truncate flex-1">{doc.title}</span>
                {brokenLinks.has(doc.id) && (
                  <span title={b('源文件已失效', 'Source file missing')} className="flex-shrink-0"><AlertTriangle className="w-3.5 h-3.5 text-destructive" /></span>
                )}
                {doc.isCopy === true && (
                  <span className="text-[9px] px-1 rounded bg-green-500/10 text-green-600 dark:text-green-400 flex-shrink-0" title={t("sidebar.copy_badge_title")}>
                    {t("sidebar.copy_badge")}
                  </span>
                )}
                {doc.isCopy === false && !brokenLinks.has(doc.id) && (
                  <span className="text-[9px] px-1 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 flex-shrink-0" title={doc.originalPath || doc.path}>
                    {t("sidebar.link_badge")}
                  </span>
                )}
                <button
                  type="button"
                  className="w-5 h-5 hidden group-hover:inline-flex items-center justify-center rounded hover:bg-destructive/10 transition-colors flex-shrink-0"
                  onClick={(e) => handleDeleteDoc(doc, e)}
                  title={b('删除', 'Delete')}
                >
                  <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-2 border-t border-border space-y-1">
        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full justify-start"
          onClick={openLibrary}
        >
          <Library className="w-4 h-4 mr-2 text-blue-500" />
          {t("common.library")}
        </Button>
        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full justify-start"
          onClick={openHelp}
        >
          <HelpCircle className="w-4 h-4 mr-2 text-emerald-500" />
          {t("common.help")}
        </Button>
        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full justify-start"
          onClick={openSettings}
        >
          <Settings className="w-4 h-4 mr-2 text-muted-foreground" />
          {t("common.settings")}
        </Button>
      </div>


    </div>
  );
}
