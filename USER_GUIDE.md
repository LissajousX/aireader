<div align="center">

# AiReader User Guide / 用户指南

**Version 0.1.0** · PDF · EPUB · Markdown · TXT

[English](#english) | [中文](#中文)

</div>

---

<a id="中文"></a>

## 🇨🇳 中文用户指南

### 概述

**AiReader** 是一款面向深度阅读的桌面 AI 助手。支持 PDF、EPUB、Markdown 和 TXT 格式。核心理念：**选中文字即可翻译、解释，并将结果沉淀为笔记**。AI 推理完全在本地运行，你的文档永远不会离开你的电脑。

### 核心功能

| 功能 | 说明 |
|:---|:---|
| 📖 多格式阅读 | PDF / EPUB / Markdown / TXT，阅读进度自动保存 |
| 🤖 本地 AI 推理 | 内置 llama.cpp，零配置开箱即用，自动适配硬件 |
| 🌐 选中即译 | 直译 / 意译 / 白话解释，复杂长句自动拆解 |
| 📝 文法解释 | 拆解句子结构、词汇用法 |
| 💬 上下文对话 | 围绕文档内容自由对话 |
| 📒 智能笔记 | AI 生成候选笔记，人工确认后持久化存储 |
| 🧠 深度思考 | Qwen3 真正的思考模式 |
| 📕 离线词典 | 内置 ECDICT 英汉词典，双击查词 |
| 🌐 多种后端 | 也支持 Ollama、OpenAI 兼容 API |

### 界面布局

<table>
<tr>
<td colspan="3" align="center"><b>☰ &nbsp; 文档标题 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 🌓 &nbsp; AI &nbsp; ⚙</b></td>
</tr>
<tr>
<td width="120" valign="top">
<b>侧边栏</b><br/>
🅰 AiReader<br/><br/>
📂 导入文档<br/><br/>
📄 Paper.pdf<br/>
📘 Novel.epub<br/>
📝 Notes.md<br/><br/>
<sub>文档库 · 设置 · 帮助</sub>
</td>
<td width="320" align="center" valign="middle">
<br/><br/>
📖<br/>
<b>文档阅读区域</b><br/>
<sub>PDF / EPUB / Markdown / TXT</sub><br/><br/><br/>
<sub>◀ ▶ &nbsp; ➖ 100% ➕ &nbsp; 1/42 &nbsp; 🌓</sub><br/>
<sub>↑ 浮动工具栏</sub><br/>
</td>
<td width="160" valign="top">
<b>AI 助手</b> <sub>内置</sub><br/><br/>
<code>译</code> · 释 · 聊 · 记<br/><br/>
<em>选中文本后<br/>自动翻译</em><br/><br/>
<sub>翻译结果显示区域</sub><br/><br/>
<sub>💬 输入文本... ➤</sub>
</td>
</tr>
<tr>
<td colspan="3" align="center"><sub>所有面板分隔线均可拖动调节宽度</sub></td>
</tr>
</table>

### 欢迎页

启动应用后默认显示欢迎页，包含：

1. **语言切换** — 右上角可切换中文/English
2. **核心功能介绍** — 选中即译、文法解释、随时对话、笔记沉淀
3. **快速操作** — 导入文档 / 导入文件夹
4. **最近文档** — 显示最近打开过的文档，点击直接打开
5. **底部快捷入口** — 设置、文档库、使用说明

### 导入文档

| 方式 | 说明 |
|:---|:---|
| 📂 导入文档 | 选择一个或多个文件 |
| 📁 导入文件夹 | 选择文件夹，自动扫描所有支持的文件 |

导入时可选择：

- **导入副本**（推荐）— 复制文件到应用数据目录，移动/删除原文件不影响阅读
- **直接打开** — 直接读取原文件路径，文件被移动或删除后将无法打开

支持格式：`.pdf` `.epub` `.md` `.txt`

### 文档库

点击侧边栏底部的 **文档库** 图标打开。功能包括：

- 按文档名搜索
- 按最近阅读 / 名称 / 阅读进度排序
- 按文件类型筛选
- 添加/删除文档
- 自定义文档库存储路径

### 阅读文档

**PDF 阅读器：** 连续滚动，缩放控制，页码导航，文本选择自动打开 AI，内部链接跳转，独立文档主题。

**EPUB 阅读器：** 翻页/滚动模式切换，缩放，独立文档主题，目录章节高亮跟踪。

**Markdown 阅读器：** 渲染 Markdown 格式，支持标题、列表、代码块、表格、图片等。

**TXT 阅读器：** 纯文本显示，自动换行。

### 目录导航

PDF 和 EPUB 支持目录侧栏，两种打开方式：

1. 阅读区域左侧边缘滑条 `>`
2. 浮动工具栏最左侧的目录按钮

支持多级嵌套、点击跳转、当前位置高亮、宽度可调。

### 浮动工具栏

底部居中的半透明药丸形工具栏：

| 按钮 | 功能 |
|:---|:---|
| 📋 | 切换目录（仅有目录时显示） |
| ◀ ▶ | 翻页（EPUB 翻页模式） |
| 页码 | 当前页/总页数，可直接输入跳转 |
| ➖ ➕ | 缩放 |
| 百分比 | 当前缩放比例，可直接输入 |
| 🔄 | 重置缩放 |
| 📖/📜 | 切换翻页/滚动模式（EPUB） |
| 🌓 | 文档亮色/暗色切换 |

### AI 助手

**打开方式：** 点击顶部栏 AI 按钮，或选中文本自动打开。

**四个功能 Tab：**

1. **翻译** — 意译（自然流畅）/ 直译（逐词对照）/ 白话（最简单语言），自动检测中↔英方向
2. **文法解释** — 拆解语法结构、词汇用法
3. **对话** — ChatGPT 风格对话界面，Enter 发送，Shift+Enter 换行，对话历史持久化，可选中消息保存为笔记
4. **笔记** — 翻译/解释结果一键保存，与文档关联，支持导出 Markdown

**深度思考：** 对话输入区域上方的 🧠 按钮。内置 Qwen3 模型支持**真正关闭**思考（不做内部推理，更快更省资源），与 Ollama 的软关闭不同。

**模型切换：** AI 面板顶部点击模型名称展开选择（内置 / Ollama / OpenAI Compatible）。

### 词典弹窗

**双击**文档中的单词弹出词典窗口，支持英汉/汉英，可在设置中独立开关。

### 笔记系统

| 来源 | 方式 |
|:---|:---|
| 翻译结果 | 点击 💾 保存 |
| 文法解释 | 点击 💾 保存 |
| 对话消息 | 勾选消息 → 保存为笔记 |

笔记类型：🟡 AI 生成 → 🟢 已确认 → 🔵 用户笔记。支持确认、删除、导出 Markdown。

### 设置

点击顶部栏 ⚙ 按钮打开。分为三个选项卡：

**通用：** 界面语言、离线词典开关、AI 提示词自定义（可单独重置为默认值）。

**AI：** 三种 AI 服务提供方：

| 提供方 | 说明 |
|:---|:---|
| 🖥 内置本地 | 使用内置 Qwen3 模型，零配置离线运行 |
| 🦙 Ollama | 连接本地 Ollama 服务 |
| 🌐 OpenAI Compatible | 连接任何 OpenAI 兼容 API |

内置 AI 提供**简易模式**（一键配置）和**高级模式**（手动选型、GPU 配置、模型管理）。

可用模型：

| 模型 | 大小 | 说明 |
|:---|:---|:---|
| Qwen3-0.6B Q4 | ~400MB | 最小最快，适合低配电脑 |
| Qwen3-1.7B Q4 | ~1GB | 轻量 |
| Qwen3-4B Q4 | ~2.5GB | 均衡 |
| Qwen3-8B Q4 | ~5GB | 高质量 |
| Qwen3-8B Q5 | ~6GB | 最高质量 |

**存储：** 文档缓存管理、应用数据目录、重置应用。

### 主题切换

- **应用主题** — 顶部栏 🌓 按钮切换整体亮色/暗色
- **文档主题** — 浮动工具栏 🌓 按钮**独立**切换文档区域亮色/暗色

### 快捷键

| 快捷键 | 功能 |
|:---|:---|
| 双击单词 | 词典弹窗 |
| 选中文本 | 自动打开 AI 面板 |
| Enter（对话框） | 发送消息 |
| Shift + Enter（对话框） | 换行 |

### 常见问题

**Q: 模型下载很慢？**
模型从 ModelScope 下载。可以在高级模式中点击 **链接** 复制下载地址，用其他下载工具下载后点击 **导入** 导入。

**Q: 如何切换 AI 提供方？**
设置 → AI 选项卡 → 顶部的提供方选择按钮。

**Q: 导入副本和直接打开有什么区别？**
导入副本复制文件到应用目录（安全），直接打开只记录路径（原文件不能移动）。

**Q: 深度思考开关有什么用？**
内置模型真正关闭/开启思考；Ollama 为软关闭（仍会思考但隐藏输出）。

**Q: 支持哪些 GPU？**
NVIDIA (CUDA 12.4/13.1)、AMD/Intel (Vulkan)、CPU 模式（所有电脑可用）。

---

<a id="english"></a>

## 🇬🇧 English User Guide

### Overview

**AiReader** is a desktop AI assistant designed for deep reading. It supports PDF, EPUB, Markdown, and TXT formats. Core workflow: **select text → translate/explain → save as notes**. AI inference runs entirely on your local machine — your documents never leave your computer.

### Key Features

| Feature | Description |
|:---|:---|
| 📖 Multi-Format Reader | PDF / EPUB / Markdown / TXT with auto-saved progress |
| 🤖 Local AI Inference | Built-in llama.cpp, zero-config, auto hardware adaptation |
| 🌐 Select to Translate | Literal / free / plain-language translation, complex sentence breakdown |
| 📝 Grammar Explain | Break down sentence structure and vocabulary usage |
| 💬 Contextual Chat | Free-form chat about document content |
| 📒 Smart Notes | AI-generated draft notes, human-confirmed persistent storage |
| 🧠 Deep Thinking | True thinking mode with Qwen3 |
| 📕 Offline Dictionary | Built-in ECDICT, double-click to look up words |
| 🌐 Multiple Backends | Also supports Ollama, OpenAI-compatible APIs |

### Interface Layout

<table>
<tr>
<td colspan="3" align="center"><b>☰ &nbsp; Document Title &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 🌓 &nbsp; AI &nbsp; ⚙</b></td>
</tr>
<tr>
<td width="120" valign="top">
<b>Sidebar</b><br/>
🅰 AiReader<br/><br/>
📂 Import<br/><br/>
📄 Paper.pdf<br/>
📘 Novel.epub<br/>
📝 Notes.md<br/><br/>
<sub>Library · Settings · Help</sub>
</td>
<td width="320" align="center" valign="middle">
<br/><br/>
📖<br/>
<b>Reading Area</b><br/>
<sub>PDF / EPUB / Markdown / TXT</sub><br/><br/><br/>
<sub>◀ ▶ &nbsp; ➖ 100% ➕ &nbsp; 1/42 &nbsp; 🌓</sub><br/>
<sub>↑ Floating Toolbar</sub><br/>
</td>
<td width="160" valign="top">
<b>AI Assistant</b> <sub>Built-in</sub><br/><br/>
<code>Trans</code> · Expl · Chat · Note<br/><br/>
<em>Select text to<br/>auto-translate</em><br/><br/>
<sub>Translation results</sub><br/><br/>
<sub>💬 Input... ➤</sub>
</td>
</tr>
<tr>
<td colspan="3" align="center"><sub>All panel dividers are draggable to resize</sub></td>
</tr>
</table>

### Welcome Page

Shown on startup. Contains:

1. **Language Switch** — Toggle Chinese/English in the top-right corner
2. **Feature Cards** — Select to translate, grammar explain, chat, notes
3. **Quick Actions** — Import documents / Import folder
4. **Recent Documents** — Click to open directly
5. **Bottom Shortcuts** — Settings, Document Library, Help

### Importing Documents

| Method | Description |
|:---|:---|
| 📂 Import Documents | Select one or more files |
| 📁 Import Folder | Select a folder, auto-scans all supported files |

Import options:

- **Import Copy** (recommended) — Copies file to app data folder; moving/deleting the original won't affect reading
- **Open Directly** — Reads from original path; file becomes inaccessible if moved or deleted

Supported formats: `.pdf` `.epub` `.md` `.txt`

### Document Library

Click the **Library** icon at the bottom of the sidebar. Features:

- Search by document name
- Sort by recent / name / reading progress
- Filter by file type
- Add / remove documents
- Custom storage directory

### Reading Documents

**PDF Reader:** Continuous scroll, zoom controls, page navigation, text selection auto-opens AI panel, internal link navigation, independent document theme.

**EPUB Reader:** Paginated/scroll mode toggle, zoom, independent document theme, TOC chapter highlight tracking.

**Markdown Reader:** Renders Markdown with headings, lists, code blocks, tables, images, etc.

**TXT Reader:** Plain text display with word wrap.

### Table of Contents

PDF and EPUB support a TOC sidebar, opened via:

1. Edge strip `>` on the left side of the reading area
2. List icon button on the far left of the floating toolbar

Supports hierarchical nesting, click to navigate, active highlight, resizable width.

### Floating Toolbar

Translucent pill-shaped toolbar at the bottom center:

| Button | Function |
|:---|:---|
| 📋 | Toggle contents (shown when TOC available) |
| ◀ ▶ | Page navigation (EPUB paginated mode) |
| Page | Current/total page, click to input and jump |
| ➖ ➕ | Zoom in/out |
| Percent | Current zoom %, click to input |
| 🔄 | Reset zoom |
| 📖/📜 | Toggle paginated/scroll (EPUB only) |
| 🌓 | Toggle document light/dark theme |

### AI Assistant

**Opening:** Click the AI button in the header, or select text to auto-open.

**Four Tabs:**

1. **Translate** — Free (natural) / Literal (word-by-word) / Plain (simplest language), auto-detects Chinese↔English direction
2. **Grammar** — Breaks down grammar structure and vocabulary usage
3. **Chat** — ChatGPT-style interface, Enter to send, Shift+Enter for new line, persistent chat history per document, select messages to save as notes
4. **Notes** — One-click save from translation/explanation, linked to documents, export as Markdown

**Deep Thinking:** The 🧠 button above the chat input. Built-in Qwen3 models support **truly disabling** thinking (skips internal reasoning, faster and lighter). This differs from Ollama's soft disable.

**Model Selection:** Click the model name at the top of the AI panel to switch between Built-in / Ollama / OpenAI Compatible.

### Dictionary Popup

**Double-click** a word in the document to show a dictionary popup. Supports English-Chinese / Chinese-English, each toggleable in Settings.

### Notes System

| Source | Method |
|:---|:---|
| Translation | Click 💾 save button |
| Grammar | Click 💾 save button |
| Chat messages | Select messages → Save as note |

Note types: 🟡 AI Generated → 🟢 Confirmed → 🔵 User Note. Supports confirm, delete, export as Markdown.

### Settings

Click the ⚙ button in the header. Three tabs:

**General:** UI language, offline dictionary toggles, customizable AI prompt templates (individually resettable).

**AI:** Three providers:

| Provider | Description |
|:---|:---|
| 🖥 Built-in Local | Uses built-in Qwen3 models, works offline |
| 🦙 Ollama | Connects to local Ollama service |
| 🌐 OpenAI Compatible | Connects to any OpenAI-compatible API |

Built-in AI provides **Simple Mode** (one-click setup) and **Advanced Mode** (manual model selection, GPU configuration, model management).

Available models:

| Model | Size | Description |
|:---|:---|:---|
| Qwen3-0.6B Q4 | ~400MB | Smallest, fastest |
| Qwen3-1.7B Q4 | ~1GB | Lightweight |
| Qwen3-4B Q4 | ~2.5GB | Balanced |
| Qwen3-8B Q4 | ~5GB | High quality |
| Qwen3-8B Q5 | ~6GB | Highest quality |

**Storage:** Document cache management, app data directory, reset app.

### Theme

- **App Theme** — 🌓 button in the header toggles overall light/dark
- **Document Theme** — 🌓 button in the floating toolbar **independently** toggles document area light/dark

### Keyboard Shortcuts

| Shortcut | Function |
|:---|:---|
| Double-click word | Dictionary popup |
| Select text | Auto-open AI panel |
| Enter (chat) | Send message |
| Shift + Enter (chat) | New line |

### FAQ

**Q: Model download is slow?**
Models are downloaded from ModelScope. In advanced mode, click **Link** to copy the download URL, use another download tool, then click **Import** to import the file.

**Q: How to switch AI providers?**
Settings → AI tab → Provider selection buttons at top.

**Q: What's the difference between Import Copy and Open Directly?**
Import Copy copies the file to the app data folder (safe). Open Directly only records the path (original must not be moved).

**Q: What does the Deep Thinking toggle do?**
Built-in models truly disable/enable thinking. Ollama uses soft disable (still thinks internally but hides output).

**Q: Which GPUs are supported?**
NVIDIA (CUDA 12.4/13.1), AMD/Intel (Vulkan), CPU mode (works on all computers).

---

*AiReader — Read. Select. Translate. Save.*
