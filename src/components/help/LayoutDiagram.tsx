interface LayoutDiagramProps {
  lang?: 'zh' | 'en';
}

export function LayoutDiagram({ lang }: LayoutDiagramProps) {
  const b = (zh: string, en: string) => (lang === 'en' ? en : zh);

  return (
    <div className="my-4 rounded-xl border border-border shadow-sm overflow-hidden text-[11px] leading-tight select-none" style={{ fontFamily: 'system-ui, sans-serif' }}>
      {/* Title bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/60 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-400/70" />
          </div>
          <span className="text-[10px] text-muted-foreground ml-1">AiReader</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1 bg-muted/30 border-b border-border/60">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded flex items-center justify-center text-[9px] text-muted-foreground">&#9776;</div>
          <span className="text-[10px] text-foreground/70 truncate">Robinson Crusoe.epub</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded flex items-center justify-center text-[9px] text-muted-foreground">&#127763;</div>
          <div className="px-1.5 py-0.5 rounded-md bg-primary text-primary-foreground text-[8px] font-medium">&#129302;</div>
        </div>
      </div>

      {/* Body */}
      <div className="flex" style={{ height: 160 }}>
        {/* Sidebar */}
        <div className="w-[85px] shrink-0 border-r border-border/60 bg-card/60 flex flex-col">
          <div className="px-2 py-1.5">
            <div className="w-full py-1 rounded-md bg-primary/10 text-center text-[8px] text-primary font-medium">{b('+ 导入文档', '+ Import')}</div>
          </div>
          <div className="flex-1 px-1.5 space-y-px overflow-hidden">
            <div className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[8px] truncate flex items-center gap-1">
              <span className="opacity-60">&#128196;</span> Paper.pdf
            </div>
            <div className="px-1.5 py-0.5 rounded text-foreground/60 text-[8px] truncate flex items-center gap-1">
              <span className="opacity-60">&#128218;</span> Novel.epub
            </div>
            <div className="px-1.5 py-0.5 rounded text-foreground/60 text-[8px] truncate flex items-center gap-1">
              <span className="opacity-60">&#128221;</span> Notes.md
            </div>
          </div>
          <div className="border-t border-border/40 px-2 py-1 space-y-0.5">
            <div className="text-[8px] text-muted-foreground flex items-center gap-1"><span className="opacity-50">&#128218;</span> {b('文档库', 'Library')}</div>
            <div className="text-[8px] text-muted-foreground flex items-center gap-1"><span className="opacity-50">&#9881;</span> {b('设置', 'Settings')}</div>
          </div>
        </div>

        {/* Resize hint */}
        <div className="w-px bg-border/60 relative group cursor-col-resize">
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 left-1/2 w-1 h-6 rounded-full bg-border" />
        </div>

        {/* Reading area */}
        <div className="flex-1 flex flex-col bg-background relative min-w-0">
          <div className="flex-1 flex items-center justify-center px-4">
            <div className="text-center space-y-1">
              <div className="text-[10px] text-muted-foreground/70">{b('文档阅读区域', 'Reading Area')}</div>
              <div className="text-[8px] text-muted-foreground/40">PDF / EPUB / Markdown / TXT</div>
              <div className="mt-2 mx-auto w-[80%] space-y-1">
                <div className="h-1 bg-muted/60 rounded-full" />
                <div className="h-1 bg-muted/40 rounded-full w-[90%]" />
                <div className="h-1 bg-muted/30 rounded-full w-[70%]" />
              </div>
            </div>
          </div>
          {/* Floating toolbar */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card border border-border/60 shadow-sm">
            <span className="text-[8px] text-muted-foreground">&#9664; &#9654;</span>
            <span className="text-[7px] text-muted-foreground/40">|</span>
            <span className="text-[8px] text-muted-foreground">100%</span>
            <span className="text-[7px] text-muted-foreground/40">|</span>
            <span className="text-[8px] text-muted-foreground">1/42</span>
          </div>
        </div>

        {/* Resize hint */}
        <div className="w-px bg-border/60 relative cursor-col-resize">
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 left-1/2 w-1 h-6 rounded-full bg-border" />
        </div>

        {/* AI Panel */}
        <div className="w-[105px] shrink-0 bg-card/60 flex flex-col">
          <div className="px-2 py-1.5 border-b border-border/40 flex items-center gap-1">
            <span className="text-[9px]">&#129302;</span>
            <span className="px-1 py-0.5 text-[7px] rounded bg-primary/10 text-primary">{b('内置', 'Built-in')}</span>
          </div>
          <div className="flex border-b border-border/40">
            <div className="flex-1 py-0.5 text-center text-[7px] bg-primary/10 text-primary font-medium border-b-2 border-primary">{b('翻译', 'Trans')}</div>
            <div className="flex-1 py-0.5 text-center text-[7px] text-muted-foreground">{b('释义', 'Expl')}</div>
            <div className="flex-1 py-0.5 text-center text-[7px] text-muted-foreground">{b('对话', 'Chat')}</div>
            <div className="flex-1 py-0.5 text-center text-[7px] text-muted-foreground">{b('笔记', 'Note')}</div>
          </div>
          <div className="flex-1 px-2 py-1.5 space-y-1.5">
            <div className="text-[8px] text-muted-foreground/60 italic">{b('选中文本 → 自动翻译', 'Select → Auto translate')}</div>
            <div className="p-1 rounded bg-muted/40 space-y-0.5">
              <div className="h-0.5 bg-primary/20 rounded-full w-full" />
              <div className="h-0.5 bg-primary/15 rounded-full w-[85%]" />
              <div className="h-0.5 bg-primary/10 rounded-full w-[60%]" />
            </div>
          </div>
          <div className="border-t border-border/40 px-1.5 py-1">
            <div className="flex items-center gap-0.5">
              <div className="flex-1 rounded bg-muted/40 px-1 py-0.5 text-[7px] text-muted-foreground/50">{b('输入...', 'Input...')}</div>
              <div className="w-4 h-4 rounded bg-primary/10 flex items-center justify-center text-[8px] text-primary">&#10148;</div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer label */}
      <div className="px-3 py-1 bg-muted/30 border-t border-border/60 text-[8px] text-muted-foreground/60 text-center">
        {b('&#8596; 面板分隔线可拖动调节宽度', '&#8596; Panel dividers are draggable')}
      </div>
    </div>
  );
}
