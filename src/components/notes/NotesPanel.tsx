import { useState, useEffect } from "react";
import { Trash2, Check, BookOpen, StickyNote, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Markdown } from "@/components/ui/Markdown";
import { useDocumentStore } from "@/stores/documentStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useNoteStore } from "@/stores/noteStore";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import type { Note } from "@/types";

interface NotesPanelProps {
  style?: React.CSSProperties;
}

export function NotesPanel({ style }: NotesPanelProps) {
  const { currentDocument } = useDocumentStore();
  const { currentDocumentNotes, loadNotes, deleteNote, confirmNote } = useNoteStore();
  const markdownScale = useSettingsStore((s) => s.markdownScale);
  const { b } = useI18n();
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

  const effectiveDocId = currentDocument?.id ?? '__global__';

  useEffect(() => {
    (async () => {
      try {
        await loadNotes(effectiveDocId);
      } catch (error) {
        console.error("Load notes failed:", error);
      }
    })();
  }, [effectiveDocId, loadNotes]);

  const toggleExpand = (noteId: string) => {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(noteId)) {
        next.delete(noteId);
      } else {
        next.add(noteId);
      }
      return next;
    });
  };

  const handleDelete = async (noteId: string) => {
    const { confirm } = await import("@tauri-apps/plugin-dialog");
    const ok = await confirm(b("确定要删除这条笔记吗？", "Delete this note?"), {
      title: b("删除笔记", "Delete Note"),
      kind: "warning",
      okLabel: b("删除", "Delete"),
      cancelLabel: b("取消", "Cancel"),
    });
    if (!ok) return;

    try {
      await deleteNote(noteId);
      await loadNotes(effectiveDocId);
    } catch (error) {
      console.error("Delete note failed:", error);
      alert(b("删除笔记失败: ", "Failed to delete note: ") + (error instanceof Error ? error.message : b("未知错误", "Unknown error")));
    }
  };

  const handleConfirm = async (noteId: string) => {
    try {
      await confirmNote(noteId);
      await loadNotes(effectiveDocId);
    } catch (error) {
      console.error("Confirm note failed:", error);
      alert(b("确认笔记失败: ", "Failed to confirm note: ") + (error instanceof Error ? error.message : b("未知错误", "Unknown error")));
    }
  };

  const getNoteTypeLabel = (type: Note["type"]) => {
    switch (type) {
      case "ai_generated":
        return { label: b("AI 生成", "AI Generated"), color: "bg-yellow-500/20 text-yellow-700" };
      case "confirmed":
        return { label: b("已确认", "Confirmed"), color: "bg-green-500/20 text-green-700" };
      case "user":
        return { label: b("用户笔记", "User Note"), color: "bg-blue-500/20 text-blue-700" };
      default:
        return { label: b("笔记", "Note"), color: "bg-muted" };
    }
  };

  return (
    <div className="h-full bg-card flex flex-col" style={style}>
      <div className="flex items-center justify-between p-3 border-b border-border">
        <span className="font-medium flex items-center gap-2">
          <StickyNote className="w-4 h-4" />
          {b('笔记', 'Notes')} ({currentDocumentNotes.length})
          {!currentDocument && <span className="text-xs text-muted-foreground font-normal">{b('(全局)', '(Global)')}</span>}
        </span>
      </div>

      <div className="flex-1 overflow-auto p-2">
        {currentDocumentNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <BookOpen className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm">{b('暂无笔记', 'No notes yet')}</p>
            <p className="text-xs">{b('选中文本后使用 AI 功能生成笔记', 'Select text and use AI to generate notes')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {currentDocumentNotes.map((note) => {
              const typeInfo = getNoteTypeLabel(note.type);
              const isExpanded = expandedNotes.has(note.id);

              return (
                <div
                  key={note.id}
                  className="bg-background border border-border rounded-md overflow-hidden"
                >
                  <div
                    className="flex items-center justify-between p-2 cursor-pointer hover:bg-muted/50"
                    onClick={() => toggleExpand(note.id)}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className={cn("text-xs px-1 rounded", typeInfo.color)}>
                        {typeInfo.label}
                      </span>
                      {note.pageNumber && (
                        <span className="text-xs text-muted-foreground">
                          P{note.pageNumber}
                        </span>
                      )}
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>

                  {isExpanded && (
                    <div className="p-2 pt-0 space-y-2">
                      {note.originalText && (
                        <div className="text-xs">
                          <div className="text-muted-foreground mb-1">{b('原文', 'Original')}:</div>
                          <div className="bg-muted/50 p-2 rounded text-foreground/80 max-h-20 overflow-auto">
                            {note.originalText}
                          </div>
                        </div>
                      )}
                      <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
                        <div style={{ fontSize: `${markdownScale}rem` }}>
                          <Markdown>{note.content}</Markdown>
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-border">
                        <span className="text-xs text-muted-foreground">
                          {new Date(note.createdAt).toLocaleString()}
                        </span>
                        <div className="flex gap-1">
                          {note.type === "ai_generated" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleConfirm(note.id);
                              }}
                              title={b('确认笔记', 'Confirm note')}
                            >
                              <Check className="w-3 h-3 text-green-600" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(note.id);
                            }}
                            title={b('删除笔记', 'Delete note')}
                          >
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
