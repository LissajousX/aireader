<div align="center">

# ✨ Aireader

**From Documents to Knowledge — Powered by Your Own GPU**

**从文档到知识 —— 用你自己的算力驱动 AI 阅读**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tauri 2.0](https://img.shields.io/badge/Tauri-2.0-orange)](https://tauri.app)
[![llama.cpp](https://img.shields.io/badge/llama.cpp-built--in-green)](https://github.com/ggerganov/llama.cpp)

[English](#english) | [中文](#中文)

</div>

---

<a id="中文"></a>

## 🇨🇳 中文

### 为什么选择 Aireader？

> 你的文档不会上传到任何云端。AI 推理完全在本地运行。

大多数 AI 阅读工具需要把你的文档发送到云端，Aireader 不同：

- **🔒 完全离线** — 内置 llama.cpp 推理引擎，AI 在你的电脑上运行，数据永远不出本机
- **⚡ 智能硬件适配** — 自动检测 GPU，支持 CUDA / Vulkan / CPU；内置 llama-bench 基准测试，实测性能后精准匹配最流畅的模型
- **📖 专注阅读体验** — 不是又一个聊天工具，而是真正为深度阅读设计的 AI 助手

### 截图预览

![主界面](screenshots/main-interface.png)

<details>
<summary>更多截图</summary>

![选中即译](screenshots/select-translate.png)

![AI 对话](screenshots/ai-chat.png)

![一键配置](screenshots/quick-setup.png)

![暗色主题](screenshots/dark-theme.png)

![词典弹窗](screenshots/dictionary-popup.png)

</details>

### 核心功能

| 功能 | 描述 |
|:---|:---|
| 📄 **多格式支持** | PDF · EPUB · Markdown · TXT，阅读进度自动保存 |
| 🤖 **本地 AI 推理** | 内置 llama.cpp，零配置开箱即用，llama-bench 基准测试精准匹配硬件 |
| 🌐 **多种 AI 后端** | 也支持 Ollama、OpenAI 兼容 API，自由选择 |
| 🔤 **选中即翻译** | 直译 / 意译 / 白话解释，复杂长句自动拆解 |
| 📚 **离线词典** | 内置 ECDICT + CC-CEDICT 词典，中英互译，选词即查，无需联网 |
| 📝 **智能笔记** | AI 生成候选笔记，人工确认后持久化存储 (SQLite) |
| 💬 **上下文对话** | 可以就当前阅读内容与 AI 多轮对话，支持深度思考 |
| 📁 **文档库管理** | 副本导入 / 链接导入，自定义存储目录 |
| 🌓 **暗色 / 亮色主题** | 跟随系统或手动切换，文档区域可独立控制 |
| 🌍 **中英双语界面** | 自动检测系统语言 |

### 智能硬件适配

Aireader 采用 **三层自适应策略** 自动为你的硬件匹配最流畅的模型：

1. **硬件探测** — 检测 GPU 类型与显存，选择最佳计算模式（CUDA / Vulkan / CPU）
2. **资源初筛** — 根据 CPU 核心数、内存、显存快速预估模型级别
3. **基准测试** — 用 llama-bench 实测推理速度 (tok/s)，精确选择最流畅的模型

集成显卡（Intel UHD/HD/Iris，显存 < 2GB）自动回退到 CPU 模式以获得更好性能。

### 快速开始

```bash
# 安装依赖
npm install

# 开发模式
npm run tauri dev

# 构建发布版
npm run tauri build
```

### 使用方式

1. 打开应用 → 设置 → **一键配置内置 AI**（自动检测硬件、基准测试、下载模型）
2. 打开文档，选中英文文本
3. AI 面板自动弹出 → 翻译 / 解释 / 对话
4. 有价值的内容 → 保存为笔记

📖 详细使用指南：[USER_GUIDE.md](USER_GUIDE.md)

---

<a id="english"></a>

## 🇬🇧 English

### Why Aireader?

> Your documents never leave your machine. AI inference runs 100% locally.

Most AI reading tools send your documents to the cloud. Aireader is different:

- **🔒 Fully Offline** — Built-in llama.cpp engine, AI runs on your computer, data never leaves your machine
- **⚡ Smart Hardware Adaptation** — Auto-detects GPU, supports CUDA / Vulkan / CPU; uses llama-bench to measure actual performance and precisely match the smoothest model
- **📖 Reading-First Design** — Not another chatbot, but a true AI assistant built for deep reading

### Screenshots

![Main Interface](screenshots/main-interface.png)

<details>
<summary>More Screenshots</summary>

![Select to Translate](screenshots/select-translate.png)

![AI Chat](screenshots/ai-chat.png)

![Quick Setup](screenshots/quick-setup.png)

![Dark Theme](screenshots/dark-theme.png)

![Dictionary Popup](screenshots/dictionary-popup.png)

</details>

### Key Features

| Feature | Description |
|:---|:---|
| 📄 **Multi-Format** | PDF · EPUB · Markdown · TXT with auto-saved reading progress |
| 🤖 **Local AI Inference** | Built-in llama.cpp, zero-config, llama-bench benchmark for precise hardware matching |
| 🌐 **Multiple AI Backends** | Also supports Ollama, OpenAI-compatible APIs |
| 🔤 **Select to Translate** | Literal / free / plain-language translation, complex sentence breakdown |
| 📚 **Offline Dictionary** | Built-in ECDICT + CC-CEDICT dictionaries, bidirectional Chinese-English lookup, no internet needed |
| 📝 **Smart Notes** | AI-generated draft notes, human-confirmed persistent storage (SQLite) |
| 💬 **Contextual Chat** | Multi-turn conversation about reading content, with deep thinking support |
| 📁 **Document Library** | Copy or link import, custom storage directory |
| 🌓 **Dark / Light Theme** | Follow system or manual toggle, independent document area control |
| 🌍 **Bilingual UI** | Chinese & English, auto-detected |

### Smart Hardware Adaptation

Aireader uses a **3-layer adaptive strategy** to automatically match the smoothest model for your hardware:

1. **Hardware Detection** — Detect GPU type & VRAM, select optimal compute mode (CUDA / Vulkan / CPU)
2. **Resource Pre-filter** — Quick estimate based on CPU cores, RAM, and VRAM
3. **Benchmark** — Run llama-bench to measure actual inference speed (tok/s), precisely select the smoothest model

Integrated GPUs (Intel UHD/HD/Iris, VRAM < 2GB) automatically fall back to CPU mode for better performance.

### Quick Start

```bash
# Install dependencies
npm install

# Development mode
npm run tauri dev

# Build for production
npm run tauri build
```

### How to Use

1. Open app → Settings → **One-Click AI Setup** (auto-detects hardware, benchmarks, downloads model)
2. Open a document, select English text
3. AI panel appears → Translate / Explain / Chat
4. Save valuable content as notes

📖 Full user guide: [USER_GUIDE.md](USER_GUIDE.md)

---

## Tech Stack

| Layer | Technology |
|:---|:---|
| Frontend | React 18 · TypeScript · TailwindCSS · Zustand |
| Desktop | Tauri 2.0 (Rust) |
| AI Engine | llama.cpp · llama-bench (built-in) · Ollama · OpenAI-compatible API |
| Rendering | react-pdf / pdf.js · epub.js · react-markdown |
| Storage | SQLite (rusqlite) · localStorage |
| Dictionary | ECDICT (CSV) · CC-CEDICT |

## Project Structure

```
aireader/
├── src/                        # React frontend
│   ├── components/
│   │   ├── ai/                 # AI panel & contextual chat
│   │   ├── help/               # Help modal
│   │   ├── layout/             # Sidebar, welcome, document library
│   │   ├── notes/              # Notes panel
│   │   ├── reader/             # PDF / EPUB / TXT / MD readers
│   │   ├── settings/           # Settings modal
│   │   └── ui/                 # Shared UI & dictionary popup
│   ├── i18n/                   # Internationalization
│   ├── services/               # Ollama API & streaming
│   ├── stores/                 # Zustand state management
│   └── types/                  # TypeScript type definitions
├── src-tauri/                  # Rust backend
│   ├── src/
│   │   ├── lib.rs              # Tauri commands & file management
│   │   ├── builtin_llm.rs      # llama.cpp integration & model management
│   │   ├── database.rs         # SQLite note storage
│   │   ├── dictionary.rs       # ECDICT / CC-CEDICT dictionary
│   │   ├── epub.rs             # EPUB extraction
│   │   └── ollama.rs           # Ollama proxy
│   ├── resources/              # Dictionaries & sample documents
│   └── Cargo.toml
├── screenshots/                # Application screenshots
├── USER_GUIDE.md               # User guide (bilingual)
└── package.json
```

## Development Requirements

- Node.js 18+
- Rust 1.70+
- Optional: Ollama (for Ollama mode)

## License

[MIT](LICENSE) © xujiayu

