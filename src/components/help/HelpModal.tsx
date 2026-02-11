import { useState, useEffect } from "react";
import { X, Search, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Markdown } from "@/components/ui/Markdown";
import { useSettingsStore } from "@/stores/settingsStore";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { LayoutDiagram } from "@/components/help/LayoutDiagram";
import { invoke } from "@tauri-apps/api/core";

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const GUIDE_ZH = `# AiReader 用户指南

> **版本**: {{VERSION}}　|　**支持格式**: PDF · EPUB · Markdown · TXT

---

## 概述

**AiReader** 是一款面向深度阅读的桌面 AI 助手。支持 PDF、EPUB、Markdown 和 TXT 格式文档。核心理念：**选中文字即可翻译、解释，并将结果沉淀为笔记**。

**🔒 隐私优先** — AI 推理完全在本地运行，你的文档永远不会离开你的电脑。

### 核心功能

| 功能 | 说明 |
|---|---|
| 📖 多格式阅读 | PDF / EPUB / Markdown / TXT，阅读进度自动保存 |
| 🤖 本地 AI 推理 | 内置 llama.cpp，零配置开箱即用，自动适配 CPU/CUDA/Vulkan/Metal |
| 🌐 选中即译 | 直译 / 意译 / 白话解释，复杂长句自动拆解 |
| 📝 文法解释 | 拆解句子结构、词汇用法 |
| 💬 上下文对话 | 围绕文档内容自由对话 |
| 📒 智能笔记 | AI 生成候选笔记，人工确认后持久化存储 |
| 🧠 深度思考 | Qwen3 真正的思考模式 |
| � 离线词典 | 内置 ECDICT + CC-CEDICT 词典，中英互译，双击查词 |
| � 多种后端 | 也支持 Ollama、OpenAI 兼容 API |

---

## 界面布局

<!-- LAYOUT_DIAGRAM -->

### 面板说明

- **顶部栏**: 侧边栏切换、文档标题、主题切换、AI 面板切换、设置入口
- **侧边栏**: AiReader Logo（点击返回欢迎页）、导入文档按钮、文档列表（支持搜索/排序/筛选）、底部快捷操作
- **阅读区域**: 文档内容展示，支持目录侧栏、文本选择
- **AI 面板**: 翻译/文法/对话/笔记四个 Tab，支持模型切换和深度思考
- **浮动工具栏**: 目录切换、页码导航、缩放控制、阅读模式、文档主题

所有面板之间的分隔线均可拖动调节宽度。

---

## 导入文档

| 方式 | 说明 |
|---|---|
| 📂 导入文档 | 选择一个或多个文件 |
| 📁 导入文件夹 | 选择文件夹，自动扫描所有支持的文件 |

支持的文件格式：\`.pdf\`、\`.epub\`、\`.md\`、\`.txt\`

---

## 阅读文档

### PDF 阅读

- **连续滚动**: 所有页面纵向排列，平滑滚动
- **缩放**: 通过浮动工具栏的 +/- 按钮或直接输入百分比
- **页码导航**: 工具栏显示当前页/总页数，可直接输入页码跳转
- **文本选择**: 选中文本后自动打开 AI 面板
- **文档主题**: 可独立切换文档区域的亮色/暗色

### EPUB 阅读

- **翻页模式**: 默认左右翻页，点击左/右区域或使用工具栏按钮
- **滚动模式**: 通过工具栏切换为连续滚动模式
- **缩放**: 调整文字大小
- **文档主题**: 独立的亮色/暗色切换
- **目录跟踪**: 当前章节在目录中高亮显示

### Markdown / TXT

- Markdown 支持标题、列表、代码块、表格、图片等
- TXT 纯文本显示，自动换行

---

## 目录导航

PDF 和 EPUB 文档支持目录侧栏。

1. **边缘滑条**: 阅读区域左侧的窄条形按钮 \`>\`，点击展开目录
2. **浮动工具栏**: 底部工具栏最左侧的目录按钮

功能：层级显示、点击跳转、当前位置高亮、可调宽度

---

## AI 助手

### 打开方式

- 点击顶部栏的 **AI** 按钮
- 在文档中选中文本会自动打开

### 功能 Tab

#### 1. 翻译

| 模式 | 说明 |
|---|---|
| 意译 | 自然流畅的翻译 |
| 直译 | 逐词逐句对照翻译 |
| 白话 | 用最简单的语言解释 |

自动检测语言方向：中文→英文 或 英文→中文。

#### 2. 文法解释

拆解选中文本的语法结构、词汇用法，帮助深入理解。

#### 3. 对话

- **围绕上下文**: 选中文本后切换到对话 Tab，AI 自动将选中内容锁定为上下文，你可以针对这段文本追问、讨论
- 对话界面顶部会显示当前锁定的上下文，支持更新或清除
- 暂不支持全文档对话，请先选中文本再进入对话
- **Enter** 发送，**Shift+Enter** 换行
- 可选中多条消息保存为笔记
- 每条助手消息显示思考过程（可折叠）

#### 4. 笔记

- 翻译/解释结果可一键保存为笔记
- 笔记与文档关联，切换文档自动加载
- 支持导出为 Markdown 文件

### 深度思考

- **开启** (琥珀色高亮): AI 先思考再回答，质量更高
- **关闭**: AI 直接回答，速度更快

**内置 Qwen3 模型**支持真正关闭思考——关闭后模型完全不进行内部推理，响应更快更省资源。

---

## 词典弹窗

**双击**文档中的单词会弹出词典窗口。

- **ECDICT**: 英语单词 → 中文释义（音标、词性、解释）
- **CC-CEDICT**: 中文词汇 → 英文释义（拼音、词性、解释）
- 可在设置中独立开关每个方向

---

## 设置

### 通用

所有设置修改即时生效，无需手动保存。

| 设置项 | 说明 |
|---|---|
| 界面语言 | 中文 / English |
| 离线词典 | ECDICT（英→中）、CC-CEDICT（中→英）独立开关 |
| 文档库目录 | 自定义导入副本的存储路径 |
| 模型存储目录 | AI 模型文件（GGUF）存放位置，修改时可迁移旧文件，运行中的服务会自动停止 |

### AI

| 提供方 | 说明 |
|---|---|
| 🖥 内置本地 | 一键配置本地 Qwen3 模型，支持从下拉列表直接启动/停止/下载 |
| 🦙 Ollama | 填写服务地址即可连接 |
| 🌐 OpenAI Compatible | 连接任何 OpenAI 兼容 API |

**模型切换**: 在 AI 面板顶部的模型下拉列表中统一管理所有来源的模型，选择即切换。

**智能分级策略**: 系统采用三层自适应策略自动匹配最流畅的模型：

1. **硬件探测** — 检测 GPU 类型与显存，枚举所有可用后端（CUDA / Vulkan / Metal / CPU）
2. **多引擎测试** — 逐个后端用 llama-bench 实测推理速度 (tok/s)，自动选择最快后端
3. **模型推荐** — 根据测试结果推荐模型，展示完整列表由用户自选

| 基准测试 | 推荐 |
|---|---|
| ≥420 tok/s | T5 (32B) |
| 185–419 | T4 (14B) |
| 100–184 | T3 (8B) |
| 50–99 | T2 (4B) |
| 20–49 | T1 (1.7B) |
| <20 | T0 (0.6B) |

可用模型（均为 Q4_K_M 量化）：Qwen3-0.6B (~0.5GB) / 1.7B (~1.2GB) / 4B (~2.7GB) / 8B (~5GB) / 14B (~9GB) / 32B (~19GB)。

集成显卡（Intel UHD/HD/Iris，显存<2GB）自动回退 CPU 模式。觉得慢？简易模式下有「降级到更小模型」按钮。

### 存储

- 文档缓存管理（LRU 策略）
- 重置应用（清空所有数据回到初始状态）

---

## 快捷键

| 快捷键 | 功能 |
|---|---|
| 双击单词 | 词典弹窗 |
| 选中文本 | 自动打开 AI 面板 |
| Enter (对话框) | 发送消息 |
| Shift + Enter | 换行 |
| F12 / Ctrl+Shift+I | 开发者工具 |

---

## 常见问题

**Q: 内置 AI 模型下载很慢？**
系统会自动探测最快的镜像源（国内 ModelScope / 海外 HuggingFace）。如果仍然慢，可在高级模式中点击 **链接** 复制下载地址 → 用其他工具下载 → 点击 **导入** 导入。

**Q: 深度思考开关有什么用？**
- 内置模型：真正关闭/开启思考，关闭后更快
- Ollama：软关闭，模型仍会思考但隐藏输出

**Q: 支持哪些平台和 GPU？**
- Windows x64 / macOS (arm64/x64) / Ubuntu x64
- NVIDIA (CUDA 12.4/13.1) / AMD·Intel (Vulkan) / Apple Silicon (Metal)
- CPU 模式所有电脑可用

**Q: 集成显卡为什么不用 GPU 加速？**
集成显卡显存通常 < 2GB，实测比纯 CPU 更慢，系统会自动回退 CPU 模式。

**Q: 模型太慢怎么办？**
简易模式下点「降级到更小模型」，或在高级模式手动选择更小模型。

**Q: 如何卸载 / 更新？**
- 更新：下载新版安装包直接运行，自动覆盖，数据保留
- 卸载：通过系统应用管理卸载。模型目录若配置在外部路径需手动删除

---

*AiReader — Read. Select. Translate. Save.*
`;

const GUIDE_EN = `# AiReader User Guide

> **Version**: {{VERSION}}　|　**Supported Formats**: PDF · EPUB · Markdown · TXT

---

## Overview

**AiReader** is a desktop AI assistant designed for deep reading. It supports PDF, EPUB, Markdown, and TXT documents. Core workflow: **select text → translate/explain → save as notes**.

**🔒 Privacy First** — AI inference runs entirely on your local machine. Your documents never leave your computer.

### Key Features

| Feature | Description |
|---|---|
| 📖 Multi-Format Reader | PDF / EPUB / Markdown / TXT with auto-saved progress |
| 🤖 Local AI Inference | Built-in llama.cpp, zero-config, auto adapts to CPU/CUDA/Vulkan/Metal |
| 🌐 Select to Translate | Literal / free / plain-language translation, complex sentence breakdown |
| 📝 Grammar Explain | Break down sentence structure and vocabulary |
| 💬 Contextual Chat | Free-form chat about document content |
| 📒 Smart Notes | AI-generated drafts, human-confirmed persistent storage |
| 🧠 Deep Thinking | True thinking mode with Qwen3 |
| 📚 Offline Dictionary | Built-in ECDICT + CC-CEDICT, bidirectional Chinese-English lookup |
| 🌐 Multiple Backends | Also supports Ollama, OpenAI-compatible APIs |

---

## Interface Layout

<!-- LAYOUT_DIAGRAM -->

### Panel Description

- **Header**: Sidebar toggle, document title, theme toggle, AI panel toggle, settings
- **Sidebar**: AiReader logo (click to return to welcome), import button, document list (search/sort/filter), bottom shortcuts
- **Reading Area**: Document content display, TOC sidebar, text selection
- **AI Panel**: Translate/Grammar/Chat/Notes tabs, model switching, deep thinking toggle
- **Floating Toolbar**: TOC toggle, page navigation, zoom, reading mode, document theme

All panel dividers are draggable to resize.

---

## Importing Documents

| Method | Description |
|---|---|
| 📂 Import Documents | Select one or more files |
| 📁 Import Folder | Select a folder, auto-scans all supported files |

Supported formats: \`.pdf\`, \`.epub\`, \`.md\`, \`.txt\`

---

## Reading Documents

### PDF Reading

- **Continuous scroll**: All pages arranged vertically, smooth scrolling
- **Zoom**: Via floating toolbar +/- buttons or direct percentage input
- **Page navigation**: Toolbar shows current/total pages, click to input and jump
- **Text selection**: Selecting text auto-opens AI panel
- **Document theme**: Independent light/dark toggle for reading area

### EPUB Reading

- **Paginated mode**: Default left/right pagination, click areas or toolbar buttons
- **Scroll mode**: Toggle via toolbar to continuous scroll
- **Zoom**: Adjust text size
- **Document theme**: Independent light/dark toggle
- **TOC tracking**: Current chapter highlighted in table of contents

### Markdown / TXT

- Markdown supports headings, lists, code blocks, tables, images, etc.
- TXT plain text display with word wrap

---

## Table of Contents

PDF and EPUB support a TOC sidebar.

1. **Edge strip**: Narrow strip button \`>\` on the left side of reading area
2. **Floating toolbar**: TOC button on the far left

Features: Hierarchical display, click to navigate, active highlight, resizable width

---

## AI Assistant

### Opening

- Click the **AI** button in the header
- Selecting text in a document auto-opens the panel

### Function Tabs

#### 1. Translate

| Mode | Description |
|---|---|
| Free | Natural, fluent translation |
| Literal | Word-by-word translation |
| Plain | Explained in simplest language |

Auto-detects language direction: Chinese→English or English→Chinese.

#### 2. Grammar Explain

Breaks down selected text's grammar structure and vocabulary usage for deeper understanding.

#### 3. Chat

- **Context-aware**: Select text then switch to Chat tab, AI locks selected content as context for follow-up questions
- Context shown at top of chat, can be updated or cleared
- Full-document chat not yet supported — please select text first
- **Enter** to send, **Shift+Enter** for new line
- Select multiple messages to save as notes
- Each assistant message shows thinking process (collapsible)

#### 4. Notes

- One-click save from translation/explanation results
- Notes linked to documents, auto-loaded on switch
- Export as Markdown file

### Deep Thinking

- **On** (amber highlight): AI thinks before answering, higher quality
- **Off**: AI answers directly, faster response

**Built-in Qwen3 models** support truly disabling thinking — when off, the model skips internal reasoning entirely, faster and lighter.

---

## Dictionary Popup

**Double-click** a word in the document to show a dictionary popup.

- **ECDICT**: English word → Chinese definition (phonetics, parts of speech, meaning)
- **CC-CEDICT**: Chinese word → English definition (pinyin, parts of speech, meaning)
- Each direction can be toggled independently in Settings

---

## Settings

### General

All settings take effect immediately — no save button needed.

| Setting | Description |
|---|---|
| UI Language | Chinese / English |
| Offline Dictionary | ECDICT (EN→CN) and CC-CEDICT (CN→EN) toggles |
| Document Library Directory | Custom storage path for imported copies |
| Model Storage Directory | AI model files (GGUF) location; migration offered when changed; running service auto-stopped |

### AI

| Provider | Description |
|---|---|
| 🖥 Built-in Local | One-click local Qwen3 setup, manage from dropdown |
| 🦙 Ollama | Enter server address to connect |
| 🌐 OpenAI Compatible | Connect to any OpenAI-compatible API |

**Model Switching**: Unified model dropdown at the top of AI panel manages all sources.

**Smart Tier Strategy**: The system uses a 3-layer adaptive strategy:

1. **Hardware Detection** — Detect GPU type & VRAM, enumerate all available backends (CUDA / Vulkan / Metal / CPU)
2. **Multi-Engine Benchmark** — Run llama-bench on each backend to measure actual tok/s, auto-select the fastest
3. **Model Recommendation** — Recommend model based on results, present full list for user to choose

| Benchmark | Recommendation |
|---|---|
| ≥420 tok/s | T5 (32B) |
| 185–419 | T4 (14B) |
| 100–184 | T3 (8B) |
| 50–99 | T2 (4B) |
| 20–49 | T1 (1.7B) |
| <20 | T0 (0.6B) |

Available models (all Q4_K_M): Qwen3-0.6B (~0.5GB) / 1.7B (~1.2GB) / 4B (~2.7GB) / 8B (~5GB) / 14B (~9GB) / 32B (~19GB).

Integrated GPUs (Intel UHD/HD/Iris, VRAM<2GB) auto fall back to CPU mode. Too slow? Use the "Downgrade" button in Simple Mode.

### Storage

- Document cache management (LRU strategy)
- Reset app (clears all data back to initial state)

---

## Keyboard Shortcuts

| Shortcut | Function |
|---|---|
| Double-click word | Dictionary popup |
| Select text | Auto-open AI panel |
| Enter (chat) | Send message |
| Shift + Enter | New line |
| F12 / Ctrl+Shift+I | Developer tools |

---

## FAQ

**Q: Model download is slow?**
The system auto-probes the fastest mirror (ModelScope in China / HuggingFace overseas). If still slow, click **Link** in advanced mode → download with another tool → click **Import**.

**Q: What does the Deep Thinking toggle do?**
- Built-in models: Truly enables/disables thinking, faster when off
- Ollama: Soft disable, model still thinks internally but hides output

**Q: Which platforms and GPUs are supported?**
- Windows x64 / macOS (arm64/x64) / Ubuntu x64
- NVIDIA (CUDA 12.4/13.1) / AMD·Intel (Vulkan) / Apple Silicon (Metal)
- CPU mode works on all computers

**Q: Why doesn't my integrated GPU use GPU acceleration?**
Integrated GPUs typically have < 2GB VRAM. GPU mode is actually slower than pure CPU. The system auto-detects and falls back.

**Q: Model too slow?**
Use the "Downgrade to smaller model" button in Simple Mode, or manually select a smaller model in Advanced Mode.

**Q: How to uninstall / update?**
- Update: Download new installer and run. Automatic overwrite, data preserved
- Uninstall: Use system app management. External model directory must be deleted manually

---

*AiReader — Read. Select. Translate. Save.*
`;

export function HelpModal({ isOpen, onClose }: HelpModalProps) {
  const { t } = useI18n();
  const markdownScale = useSettingsStore((s) => s.markdownScale);
  const uiLanguage = useSettingsStore((s) => s.uiLanguage);
  const [searchQuery, setSearchQuery] = useState('');
  const [guideLang, setGuideLang] = useState<'zh' | 'en' | null>(null);
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    if (isOpen && !appVersion) {
      invoke<string>('get_app_version').then(v => setAppVersion(v)).catch(() => setAppVersion(''));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const activeLang = guideLang ?? uiLanguage;
  const guideContent = (activeLang === 'en' ? GUIDE_EN : GUIDE_ZH).replace('{{VERSION}}', appVersion || '…');

  const filteredGuide = searchQuery.trim()
    ? guideContent.split('\n').filter((line) => {
        const lower = line.toLowerCase();
        return lower.includes(searchQuery.toLowerCase());
      }).join('\n')
    : guideContent;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-card rounded-2xl shadow-2xl w-[820px] max-w-[92vw] max-h-[90vh] flex flex-col border border-border/50">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/60 gap-3">
          <div className="flex items-center gap-2 flex-shrink-0">
            <BookOpen className="w-4 h-4 text-emerald-500" />
            <h2 className="font-semibold">{t("common.help")}</h2>
          </div>
          <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
            <button
              onClick={() => setGuideLang('zh')}
              className={cn(
                "px-2.5 py-1 text-xs rounded-md transition-all",
                activeLang === 'zh' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              中文
            </button>
            <button
              onClick={() => setGuideLang('en')}
              className={cn(
                "px-2.5 py-1 text-xs rounded-md transition-all",
                activeLang === 'en' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              EN
            </button>
          </div>
          <div className="flex-1 max-w-xs relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={activeLang === 'en' ? 'Search...' : '搜索...'}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground"
            />
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          <div
            className="prose prose-sm dark:prose-invert max-w-none prose-h1:text-[1.6em] prose-h2:text-[1.35em] prose-h3:text-[1.15em] prose-h4:text-[1.05em] prose-table:text-[0.92em]"
            style={{ fontSize: `${markdownScale}rem` }}
          >
            {(() => {
              const marker = '<!-- LAYOUT_DIAGRAM -->';
              const idx = filteredGuide.indexOf(marker);
              if (idx === -1) return <Markdown>{filteredGuide}</Markdown>;
              const before = filteredGuide.slice(0, idx);
              const after = filteredGuide.slice(idx + marker.length);
              return (
                <>
                  <Markdown>{before}</Markdown>
                  <LayoutDiagram lang={activeLang} />
                  <Markdown>{after}</Markdown>
                </>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
