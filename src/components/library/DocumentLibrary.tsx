import { useState } from "react";
import { FileText, Trash2, Clock, BookOpen, Search, FolderOpen, CheckSquare, Square } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useDocumentStore } from "@/stores/documentStore";
import { useDocumentCacheStore } from "@/stores/documentCacheStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { cn } from "@/lib/utils";
import type { Document } from "@/types";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "@/i18n";

interface DocumentLibraryProps {
  onImportFiles: () => void;
  onImportFolder: () => void;
  onClose: () => void;
}

export function DocumentLibrary({ onImportFiles, onImportFolder, onClose }: DocumentLibraryProps) {
  const { t, lang } = useI18n();
  const { documents, setDocuments, setCurrentDocument, currentDocument } = useDocumentStore();
  const removeFromCache = useDocumentCacheStore((s) => s.removeFromCache);
  const documentsDir = useSettingsStore((s) => s.documentsDir);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "name" | "progress">("recent");
  const [typeFilter, setTypeFilter] = useState<"all" | Document["type"]>("all");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const bi = (zh: string, en: string) => lang === 'en' ? en : zh;

  const filteredDocs = documents
    .filter((doc) =>
      doc.title.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .filter((doc) => (typeFilter === "all" ? true : doc.type === typeFilter))
    .sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.title.localeCompare(b.title);
        case "progress":
          return b.readingProgress - a.readingProgress;
        case "recent":
        default:
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
    });

  const handleDelete = async (doc: Document, e: React.MouseEvent) => {
    e.stopPropagation();

    const { confirm } = await import("@tauri-apps/plugin-dialog");
    const ok = await confirm(t("library.remove_dialog.msg"), {
      title: t("library.remove_dialog.title"),
      kind: "warning",
      okLabel: t("library.remove_dialog.ok"),
      cancelLabel: t("common.cancel"),
    });

    if (!ok) return;

    setDocuments(documents.filter((d) => d.id !== doc.id));
    removeFromCache(doc.path);
    if (currentDocument?.id === doc.id) {
      setCurrentDocument(null);
    }

    try {
      if (doc.isCopy === true) {
        await invoke("delete_document_copy", { path: doc.path, documentsDir: documentsDir || null });
      }
    } catch {
    }
  };

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredDocs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredDocs.map(d => d.id)));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    const { confirm } = await import("@tauri-apps/plugin-dialog");
    const ok = await confirm(
      bi(`确定要删除选中的 ${selectedIds.size} 个文档吗？副本文件也会被删除。`, `Delete ${selectedIds.size} selected document(s)? Copied files will also be removed.`),
      { title: bi('批量删除', 'Batch Delete'), kind: 'warning', okLabel: bi('删除', 'Delete'), cancelLabel: bi('取消', 'Cancel') }
    );
    if (!ok) return;

    const toDelete = documents.filter(d => selectedIds.has(d.id));
    setDocuments(documents.filter(d => !selectedIds.has(d.id)));
    for (const doc of toDelete) {
      removeFromCache(doc.path);
      if (currentDocument?.id === doc.id) setCurrentDocument(null);
      if (doc.isCopy === true) {
        try { await invoke("delete_document_copy", { path: doc.path, documentsDir: documentsDir || null }); } catch {}
      }
    }
    setSelectedIds(new Set());
    setSelectMode(false);
  };

  const handleOpenFolder = async (filePath: string) => {
    const dir = filePath.replace(/[\\/][^\\/]+$/, '');
    try { await invoke("open_in_file_manager", { path: dir }); } catch {}
  };

  const handleOpenDocument = (doc: Document) => {
    setCurrentDocument(doc);
    onClose();
  };

  const getDocTypeIcon = (type: Document["type"]) => {
    switch (type) {
      case "pdf":
        return "📄";
      case "epub":
        return "📚";
      case "txt":
      case "md":
        return "📝";
      default:
        return "📄";
    }
  };

  const formatProgress = (progress: number) => {
    return `${Math.round(progress * 100)}%`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return t("date.today");
    if (diffDays === 1) return t("date.yesterday");
    if (diffDays < 7) return t("date.days_ago", { days: diffDays });
    return date.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US");
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-card rounded-2xl shadow-2xl w-[720px] max-w-[90vw] max-h-[80vh] flex flex-col border border-border/50">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-primary" />
            </div>
            <h2 className="font-semibold text-base">{t("library.title")}</h2>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {t("library.count", { count: documents.length })}
            </span>
          </div>
          <Button variant="ghost" size="sm" className="rounded-lg" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>

        <div className="px-5 py-3 border-b border-border/60 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("library.search_placeholder")}
                className="w-full pl-9 pr-3 py-2 border border-border rounded-lg bg-background text-sm focus:ring-1 focus:ring-primary/40 focus:border-primary/40 outline-none transition-colors"
              />
            </div>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="px-3 py-2 border border-border rounded-lg bg-background text-sm"
              aria-label={t("library.filter.type")}
              title={t("library.filter.type")}
            >
              <option value="all">{t("common.all")}</option>
              <option value="pdf">{t("common.type.pdf")}</option>
              <option value="epub">{t("common.type.epub")}</option>
              <option value="md">{t("common.type.md")}</option>
              <option value="txt">{t("common.type.txt")}</option>
            </select>

            <Button onClick={onImportFiles} size="sm" className="rounded-lg">
              <FolderOpen className="w-4 h-4 mr-1" />
              {t("library.add_files")}
            </Button>
            <Button onClick={onImportFolder} variant="outline" size="sm" className="rounded-lg">
              <FolderOpen className="w-4 h-4 mr-1" />
              {t("library.add_folder")}
            </Button>
          </div>

          <div className="flex gap-1.5 text-sm items-center">
            <span className="text-muted-foreground text-xs self-center mr-1">{t("library.sort")}</span>
            {[
              { key: "recent", label: t("library.sort.recent") },
              { key: "name", label: t("library.sort.name") },
              { key: "progress", label: t("library.sort.progress") },
            ].map((option) => (
              <button
                key={option.key}
                onClick={() => setSortBy(option.key as typeof sortBy)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs transition-colors",
                  sortBy === option.key
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-muted-foreground"
                )}
              >
                {option.label}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-1.5">
              {selectMode && selectedIds.size > 0 && (
                <Button size="sm" variant="destructive" className="rounded-lg text-xs h-7" onClick={handleBatchDelete}>
                  <Trash2 className="w-3 h-3 mr-1" />{bi(`删除 (${selectedIds.size})`, `Delete (${selectedIds.size})`)}
                </Button>
              )}
              {selectMode && (
                <Button size="sm" variant="ghost" className="rounded-lg text-xs h-7" onClick={toggleSelectAll}>
                  {selectedIds.size === filteredDocs.length ? bi('取消全选', 'Deselect All') : bi('全选', 'Select All')}
                </Button>
              )}
              <Button size="sm" variant={selectMode ? "secondary" : "ghost"} className="rounded-lg text-xs h-7" onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()); }}>
                <CheckSquare className="w-3 h-3 mr-1" />{bi('多选', 'Select')}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-5 py-3">
          {filteredDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
              <div className="w-14 h-14 rounded-2xl bg-muted/60 flex items-center justify-center mb-4">
                <FileText className="w-7 h-7 opacity-40" />
              </div>
              <p className="text-sm">
                {searchQuery ? t("library.no_match") : t("library.empty")}
              </p>
              <p className="text-xs mt-1">{t("library.empty_hint")}</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredDocs.map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => selectMode ? toggleSelect(doc.id, { stopPropagation: () => {} } as React.MouseEvent) : handleOpenDocument(doc)}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all group",
                    selectMode && selectedIds.has(doc.id)
                      ? "bg-primary/8 ring-1 ring-primary/25"
                      : currentDocument?.id === doc.id
                        ? "bg-primary/8 ring-1 ring-primary/25"
                        : "hover:bg-muted/60"
                  )}
                >
                  {selectMode ? (
                    <button onClick={(e) => toggleSelect(doc.id, e)} className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0">
                      {selectedIds.has(doc.id)
                        ? <CheckSquare className="w-5 h-5 text-primary" />
                        : <Square className="w-5 h-5 text-muted-foreground" />}
                    </button>
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-muted/60 flex items-center justify-center flex-shrink-0 text-lg">
                      {getDocTypeIcon(doc.type)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium truncate text-sm">{doc.title}</span>
                      {doc.isCopy === true && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400 flex-shrink-0">
                          {t("sidebar.copy_badge")}
                        </span>
                      )}
                      {doc.isCopy === false && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 flex-shrink-0" title={doc.originalPath || doc.path}>
                          {t("sidebar.link_badge")}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(doc.updatedAt)}
                      </span>
                      {doc.totalPages > 0 && (
                        <span>
                          {doc.currentPage}/{doc.totalPages} {t("date.page")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-20">
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary/70 rounded-full transition-all"
                          style={{ width: formatProgress(doc.readingProgress) }}
                        />
                      </div>
                      <div className="text-[10px] text-center text-muted-foreground mt-0.5">
                        {formatProgress(doc.readingProgress)}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => { e.stopPropagation(); handleOpenFolder(doc.path); }}
                      title={bi('打开所在文件夹', 'Open folder')}
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => handleDelete(doc, e)}
                      title={t("library.remove_title")}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
