interface LayoutDiagramProps {
  lang?: 'zh' | 'en';
}

export function LayoutDiagram({ lang }: LayoutDiagramProps) {
  const b = (zh: string, en: string) => (lang === 'en' ? en : zh);

  return (
    <div className="my-4 rounded-lg border border-border overflow-hidden text-[11px] leading-tight select-none" style={{ fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/80 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary">&#9776;</div>
          <span className="text-muted-foreground text-[10px]">{b('文档标题', 'Document Title')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="px-1.5 py-0.5 rounded bg-muted text-[9px]">&#127763;</div>
          <div className="px-1.5 py-0.5 rounded bg-primary/15 text-primary text-[9px] font-medium">AI</div>
          <div className="px-1.5 py-0.5 rounded bg-muted text-[9px]">&#9881;</div>
        </div>
      </div>

      {/* Body */}
      <div className="flex" style={{ height: 180 }}>
        {/* Sidebar */}
        <div className="w-[90px] shrink-0 border-r border-border bg-card/80 flex flex-col">
          <div className="px-2 py-1.5 border-b border-border/60">
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded bg-primary/15 flex items-center justify-center text-[8px] text-primary font-bold">A</div>
              <span className="text-[9px] font-bold"><span className="text-primary">Ai</span><span className="text-foreground/70">Reader</span></span>
            </div>
          </div>
          <div className="px-2 py-1">
            <div className="w-full py-0.5 rounded bg-primary/10 text-center text-[9px] text-primary">{b('导入文档', 'Import')}</div>
          </div>
          <div className="px-2 py-0.5 text-[9px] text-muted-foreground font-medium uppercase">{b('文档', 'Docs')}</div>
          <div className="flex-1 px-1.5 space-y-0.5 overflow-hidden">
            <div className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[9px] truncate">&#128196; Paper.pdf</div>
            <div className="px-1.5 py-0.5 rounded text-foreground/70 text-[9px] truncate">&#128218; Novel.epub</div>
            <div className="px-1.5 py-0.5 rounded text-foreground/70 text-[9px] truncate">&#128221; Notes.md</div>
          </div>
          <div className="border-t border-border/60 px-2 py-1 space-y-0.5">
            <div className="text-[9px] text-muted-foreground">{b('文档库', 'Library')}</div>
            <div className="text-[9px] text-muted-foreground">{b('设置', 'Settings')}</div>
          </div>
        </div>

        {/* Reading area */}
        <div className="flex-1 flex flex-col bg-background relative">
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-muted-foreground/50 text-lg mb-1">&#128214;</div>
              <div className="text-[10px] text-muted-foreground">{b('文档阅读区域', 'Reading Area')}</div>
              <div className="text-[9px] text-muted-foreground/60">PDF / EPUB / MD / TXT</div>
            </div>
          </div>
          {/* Floating toolbar */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-1 rounded-full bg-card/90 border border-border/60 shadow-sm">
            <span className="text-[8px] text-muted-foreground">&#9664;</span>
            <span className="text-[8px] text-muted-foreground">&#9654;</span>
            <span className="text-[8px] text-muted-foreground/60">|</span>
            <span className="text-[8px] text-muted-foreground">&#8722;</span>
            <span className="text-[8px] text-muted-foreground">100%</span>
            <span className="text-[8px] text-muted-foreground">&#43;</span>
            <span className="text-[8px] text-muted-foreground/60">|</span>
            <span className="text-[8px] text-muted-foreground">1/42</span>
            <span className="text-[8px] text-muted-foreground/60">|</span>
            <span className="text-[8px] text-muted-foreground">&#127763;</span>
          </div>
        </div>

        {/* AI Panel */}
        <div className="w-[110px] shrink-0 border-l border-border bg-card/80 flex flex-col">
          <div className="px-2 py-1.5 border-b border-border/60 flex items-center gap-1">
            <span className="text-[10px] font-medium">{b('AI 助手', 'AI')}</span>
            <span className="px-1 py-0.5 text-[8px] rounded bg-primary/10 text-primary">{b('内置', 'Built-in')}</span>
          </div>
          <div className="flex border-b border-border/60">
            <div className="flex-1 py-1 text-center text-[8px] bg-primary/10 text-primary font-medium">{b('译', 'Trans')}</div>
            <div className="flex-1 py-1 text-center text-[8px] text-muted-foreground">{b('释', 'Expl')}</div>
            <div className="flex-1 py-1 text-center text-[8px] text-muted-foreground">{b('聊', 'Chat')}</div>
            <div className="flex-1 py-1 text-center text-[8px] text-muted-foreground">{b('记', 'Note')}</div>
          </div>
          <div className="flex-1 px-2 py-2 space-y-1">
            <div className="text-[9px] text-muted-foreground/80 italic">{b('选中文本后', 'Select text to')}</div>
            <div className="text-[9px] text-muted-foreground/80 italic">{b('自动翻译', 'auto-translate')}</div>
            <div className="mt-2 p-1 rounded bg-muted/50 text-[8px] text-muted-foreground">{b('翻译结果显示区域', 'Translation results')}</div>
          </div>
          <div className="border-t border-border/60 px-2 py-1">
            <div className="flex items-center gap-1">
              <div className="flex-1 rounded bg-muted/50 px-1 py-0.5 text-[8px] text-muted-foreground">{b('输入文本...', 'Input...')}</div>
              <div className="text-[9px] text-primary">&#10148;</div>
            </div>
          </div>
        </div>
      </div>

      {/* Label */}
      <div className="px-3 py-1 bg-muted/40 border-t border-border text-[9px] text-muted-foreground text-center">
        {b('所有面板分隔线均可拖动调节宽度', 'All panel dividers are draggable to resize')}
      </div>
    </div>
  );
}
