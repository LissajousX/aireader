import { useState } from "react";
import { X, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Markdown } from "@/components/ui/Markdown";
import { useSettingsStore } from "@/stores/settingsStore";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { LayoutDiagram } from "@/components/help/LayoutDiagram";

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const GUIDE_ZH = `# AiReader 用户指南

> **版本**: 1.0.0　|　**支持格式**: PDF · EPUB · Markdown · TXT

---

## 概述

**AiReader** 是一款面向深度阅读的桌面 AI 助手。支持 PDF、EPUB、Markdown 和 TXT 格式文档。核心理念：**选中文字即可翻译、解释，并将结果沉淀为笔记**。

**🔒 隐私优先** — AI 推理完全在本地运行，你的文档永远不会离开你的电脑。

### 核心功能

| 功能 | 说明 |
|---|---|
| 📖 多格式阅读 | PDF / EPUB / Markdown / TXT，阅读进度自动保存 |
| 🤖 本地 AI 推理 | 内置 llama.cpp，零配置开箱即用，自动适配 CPU/CUDA/Vulkan |
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

1. **硬件探测** — 检测 GPU 类型与显存，选择计算模式（CUDA / Vulkan / CPU）
2. **资源初筛** — 根据 CPU 核心数、内存、显存预估模型级别
3. **基准测试** — 用 llama-bench 实测推理速度 (tok/s)，精确定级

| 基准测试 | 推荐 |
|---|---|
| ≥100 tok/s | T3 (8B) |
| 50–99 | T2 (4B) |
| 20–49 | T1 (1.7B) |
| <20 | T0 (0.6B) |

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
在高级模式中点击 **链接** 复制下载地址 → 用其他工具下载 → 点击 **导入** 按钮导入。

**Q: 深度思考开关有什么用？**
- 内置模型：真正关闭/开启思考，关闭后更快
- Ollama：软关闭，模型仍会思考但隐藏输出

**Q: 支持哪些 GPU？**
- NVIDIA (CUDA 12.4 / 13.1)
- AMD/Intel 等通过 Vulkan
- CPU 模式所有电脑可用

**Q: 集成显卡为什么不用 GPU 加速？**
集成显卡显存通常 < 2GB，实测比纯 CPU 更慢，系统会自动回退 CPU 模式。

**Q: 模型太慢怎么办？**
简易模式下点「降级到更小模型」，或在高级模式手动选择更小模型。

**Q: 如何卸载 / 更新？**
- 卸载：Windows 设置 → 应用 → 搜索 "Aireader" → 卸载。可勾选「删除应用数据」清理。若模型目录在外部路径需手动删除
- 更新：下载新版安装包直接运行，自动覆盖，数据保留

---

*AiReader — Read. Select. Translate. Save.*
`;

const GUIDE_EN = `# AiReader User Guide

> **Version**: 1.0.0　|　**Supported Formats**: PDF · EPUB · Markdown · TXT

---

## Overview

**AiReader** is a desktop AI assistant designed for deep reading. It supports PDF, EPUB, Markdown, and TXT documents. Core workflow: **select text → translate/explain → save as notes**.

**🔒 Privacy First** — AI inference runs entirely on your local machine. Your documents never leave your computer.

### Key Features

| Feature | Description |
|---|---|
| 📖 Multi-Format Reader | PDF / EPUB / Markdown / TXT with auto-saved progress |
| 🤖 Local AI Inference | Built-in llama.cpp, zero-config, auto adapts to CPU/CUDA/Vulkan |
| 🌐 Select to Translate | Literal / free / plain-language translation, complex sentence breakdown |
| 📝 Grammar Explain | Break down sentence structure and vocabulary |
| 💬 Contextual Chat | Free-form chat about document content |
| 📒 Smart Notes | AI-generated draft notes, human-confirmed persistent storage |
| 🧠 Deep Thinking | True thinking mode with Qwen3 |
| � Offline Dictionary | Built-in ECDICT + CC-CEDICT, bidirectional Chinese-English, double-click to look up |
| � Multiple Backends | Also supports Ollama, OpenAI-compatible APIs |

---

## Interface Layout

<!-- LAYOUT_DIAGRAM -->

### Panel Descriptions

- **Header**: Sidebar toggle, document title, theme switch, AI panel toggle, settings
- **Sidebar**: AiReader Logo (click to go home), import button, document list (search/sort/filter), bottom shortcuts
- **Reading Area**: Document content with TOC sidebar and text selection
- **AI Panel**: Four tabs (Translate/Grammar/Chat/Notes), model selector, deep thinking toggle
- **Floating Toolbar**: TOC toggle, page navigation, zoom, reading mode, document theme

All panel dividers are draggable to resize.

---

## Importing Documents

| Method | Description |
|---|---|
| 📂 Import Documents | Select one or more files |
| 📁 Import Folder | Pick a folder to scan for supported files |

Supported formats: \`.pdf\`, \`.epub\`, \`.md\`, \`.txt\`

---

## Reading Documents

### PDF Reader

- **Continuous Scroll**: All pages laid out vertically with smooth scrolling
- **Zoom**: Use +/- buttons in toolbar or type a percentage directly
- **Page Navigation**: Toolbar shows current/total pages; type a page number to jump
- **Text Selection**: Selecting text auto-opens the AI panel
- **Doc Theme**: Toggle light/dark independently for the document area

### EPUB Reader

- **Paginated**: Default left/right paging; click left/right area or toolbar buttons
- **Scrolling Mode**: Switch via toolbar to continuous scroll
- **Zoom**: Adjust text size
- **Doc Theme**: Independent light/dark toggle
- **TOC Tracking**: Current chapter highlighted in the table of contents

### Markdown / TXT

- Markdown supports headings, lists, code blocks, tables, images, etc.
- TXT displays plain text with word wrap

---

## Table of Contents

PDF and EPUB documents support a table of contents sidebar.

1. **Edge Strip**: A narrow strip button \`>\` on the left edge of the reading area
2. **Floating Toolbar**: The TOC button on the far left of the bottom toolbar

Features: hierarchical display, click to navigate, active position highlight, resizable width

---

## AI Assistant

### How to Open

- Click the **AI** button in the header
- Selecting text in the document auto-opens the AI panel

### Four Tabs

#### 1. Translate

| Mode | Description |
|---|---|
| Free | Natural, fluent translation |
| Literal | Word-by-word translation |
| Plain | Simplest language explanation |

Auto-detects language direction: Chinese→English or English→Chinese.

#### 2. Grammar

Breaks down grammar structure and vocabulary usage for deeper understanding.

#### 3. Chat

- **Contextual Chat**: After selecting text, switch to Chat tab — the AI automatically locks your selection as context so you can ask follow-up questions about it
- A context preview bar at the top shows the locked text; you can update or clear it
- Full-document chat is not yet supported; please select text first
- **Enter** to send, **Shift+Enter** for new line
- Select multiple messages to save as notes
- Each assistant message shows thinking process (collapsible)

#### 4. Notes

- Save translation/explanation results as notes with one click
- Notes are linked to documents; switching documents auto-loads notes
- Export as Markdown file

### Deep Thinking

- **ON** (amber highlight): AI thinks before answering, higher quality
- **OFF**: AI answers directly, faster response

Built-in Qwen3 models support **truly disabling** thinking for faster, lighter responses.

---

## Dictionary Popup

**Double-click** a word in the document to show a dictionary popup.

- **ECDICT (EN→ZH)**: Look up English words with Chinese definitions (phonetic, POS, explanation)
- **CC-CEDICT (ZH→EN)**: Look up Chinese words with English definitions (pinyin, POS, explanation)
- Toggle each direction in Settings

---

## Settings

### General

All settings take effect immediately — no save button needed.

| Setting | Description |
|---|---|
| UI Language | Chinese / English |
| Dictionary | Toggle ECDICT (EN→ZH) and CC-CEDICT (ZH→EN) independently |
| Library Folder | Custom path for imported copies |
| Model Storage | AI model files (GGUF) location; migration supported on change, running service auto-stops |

### AI

| Provider | Description |
|---|---|
| 🖥 Built-in | One-click local Qwen3 model setup; start/stop/download directly from the dropdown |
| 🦙 Ollama | Enter server URL to connect |
| 🌐 OpenAI Compatible | Connect to any OpenAI-compatible API |

**Model Switching**: Use the unified model dropdown in the AI panel header to manage and switch between all providers' models.

**Smart Tier Strategy**: The system uses a 3-layer adaptive strategy:

1. **Hardware Detection** — Detect GPU type & VRAM, select compute mode (CUDA / Vulkan / CPU)
2. **Resource Pre-filter** — Quick estimate based on CPU cores, RAM, VRAM
3. **Benchmark** — Run llama-bench to measure actual tok/s, precisely select the smoothest model

| Benchmark | Recommendation |
|---|---|
| ≥100 tok/s | T3 (8B) |
| 50–99 | T2 (4B) |
| 20–49 | T1 (1.7B) |
| <20 | T0 (0.6B) |

Integrated GPUs (Intel UHD/HD/Iris, VRAM<2GB) auto fall back to CPU mode. Too slow? Use the "Downgrade" button in Simple Mode.

### Storage

- Document cache management (LRU policy)
- Reset app (clears all data back to initial state)

---

## Keyboard Shortcuts

| Shortcut | Function |
|---|---|
| Double-click | Dictionary popup |
| Select text | Auto-open AI panel |
| Enter (in chat) | Send message |
| Shift + Enter | New line |
| F12 / Ctrl+Shift+I | DevTools |

---

## FAQ

**Q: Model download is slow?**
Click **Link** in advanced mode → download with another tool → click **Import**.

**Q: What does Deep Thinking do?**
- Built-in: Truly enables/disables thinking; faster when off
- Ollama: Soft toggle; model still thinks but output is hidden

**Q: Which GPUs are supported?**
- NVIDIA (CUDA 12.4 / 13.1)
- AMD/Intel via Vulkan
- CPU mode works on all computers

**Q: Why doesn't my integrated GPU use GPU acceleration?**
Integrated GPUs typically have < 2GB VRAM. GPU acceleration is actually slower than CPU mode. The system auto-detects and falls back.

**Q: Model is too slow?**
Use the "Downgrade to a smaller model" button in Simple Mode, or manually select a smaller model in Advanced Mode.

**Q: How to uninstall / update?**
- Uninstall: Windows Settings → Apps → search "Aireader" → Uninstall. Check "Delete app data" to clean up. External model directory must be deleted manually
- Update: Download new installer and run. Automatic overwrite, data preserved

---

*AiReader — Read. Select. Translate. Save.*
`;

export function HelpModal({ isOpen, onClose }: HelpModalProps) {
  const { t } = useI18n();
  const markdownScale = useSettingsStore((s) => s.markdownScale);
  const uiLanguage = useSettingsStore((s) => s.uiLanguage);
  const [searchQuery, setSearchQuery] = useState('');
  const [guideLang, setGuideLang] = useState<'zh' | 'en' | null>(null);

  if (!isOpen) return null;

  const activeLang = guideLang ?? uiLanguage;
  const guideContent = activeLang === 'en' ? GUIDE_EN : GUIDE_ZH;

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
          <h2 className="font-semibold flex-shrink-0">{t("common.help")}</h2>
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
