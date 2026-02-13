# AiReader User Guide

**Version 1.1.0** · PDF · EPUB · Markdown · TXT

---

## Overview

**AiReader** is a desktop AI assistant designed for deep reading. Supports PDF, EPUB, Markdown, and TXT formats. Core workflow: **select text → translate/explain → save as notes**. AI inference runs entirely on your local machine — your documents never leave your computer.

## Download & Install

### Download

Go to [GitHub Releases](https://github.com/LissajousX/aireader/releases) and download the installer for your platform:

| File | Platform |
|:---|:---|
| `Aireader_x.x.x_x64-setup.exe` | Windows x64 |
| `Aireader_x.x.x_aarch64.dmg` | macOS Apple Silicon |
| `Aireader_x.x.x_x64.dmg` | macOS Intel |
| `Aireader_x.x.x_amd64.AppImage` | Linux x64 (Ubuntu 22.04+) |
| `Aireader_x.x.x_amd64.deb` | Linux x64 (Debian / Ubuntu 22.04+) |
| `Aireader_x.x.x_amd64-focal.AppImage` | Linux x64 (**Ubuntu 20.04**) |

### Windows

Double-click the `.exe` installer and follow the wizard. If Windows SmartScreen shows "Windows protected your PC", click **More info → Run anyway**.

### macOS

Open the `.dmg` file and drag Aireader into the Applications folder. If macOS warns "cannot verify the developer", go to **System Settings → Privacy & Security → Open Anyway**.

### Linux (.deb)

> **Important**: Use `apt` to install, **not** `dpkg -i`. `apt` automatically resolves dependencies (e.g. `libwebkit2gtk-4.1-0`), while `dpkg` does not.

```bash
sudo apt install ./Aireader_x.x.x_amd64.deb
```

If you already used `dpkg -i` and got dependency errors, fix it with:

```bash
sudo apt --fix-broken install
```

### Linux (.AppImage)

```bash
chmod +x Aireader_x.x.x_amd64.AppImage
./Aireader_x.x.x_amd64.AppImage
```

Ubuntu 20.04 users should download the AppImage with `focal` in the filename.

### Upgrade

Download and run the new installer — it automatically overwrites the old version. Documents, notes, models and settings are preserved.

---

## Key Features

| Feature | Description |
|:---|:---|
| 📖 Multi-Format Reader | PDF / EPUB / Markdown / TXT with auto-saved progress |
| 🤖 Local AI Inference | Built-in llama.cpp, zero-config, auto hardware adaptation |
| 🌐 Select to Translate | Literal / free / plain-language translation, complex sentence breakdown |
| 📝 Grammar Explain | Break down sentence structure and vocabulary usage |
| 💬 Contextual Chat | Free-form chat about document content |
| 📒 Smart Notes | AI-generated draft notes, human-confirmed persistent storage |
| 🧠 Deep Thinking | True thinking mode with Qwen3 |
| 📚 Offline Dictionary | Built-in ECDICT + CC-CEDICT, bidirectional Chinese-English lookup |
| 🌐 Multiple Backends | Also supports Ollama, OpenAI-compatible APIs |

---

## Interface Layout

```
┌──────────────────────────────────────────────────────────────┐
│  ☰  Document Title                             🌓  🤖        │
├──────────┬──────────────────────────────┬────────────────────┤
│          │                              │ 🤖 [Built-in]      │
│ SIDEBAR  │                              ├─────┬────┬────┬────┤
│          │                              │Trans│Expl│Chat│Note│
│ + Import │       Reading Area           ├─────┴────┴────┴────┤
│          │                              │                    │
│ 📄 Paper │   PDF / EPUB / MD / TXT      │  Select text       │
│ 📘 Novel │                              │  → Auto translate  │
│ 📝 Notes │                              │                    │
│          │   ◀ ▶  100%  1/42            │  Translation area  │
│ ──────── │   ↑ Floating Toolbar         │                    │
│ Library  │                              ├────────────────────┤
│ Settings │                              │ 💬 Input...     ➤  │
├──────────┴──────────────────────────────┴────────────────────┤
│  ↔ All panel dividers are draggable to resize                │
└──────────────────────────────────────────────────────────────┘
```

### Panel Description

- **Header** — Sidebar toggle (☰), document title, theme toggle (🌓), AI panel toggle (🤖)
- **Sidebar** — Import button, document list, bottom: Library / Settings
- **Reading Area** — Document content, TOC sidebar, text selection
- **AI Panel** — Translate / Explain / Chat / Notes tabs, model switching, deep thinking
- **Floating Toolbar** — TOC, page nav, zoom, page number, reading mode, document theme

---

## First-Launch Setup Wizard

On first launch, a setup wizard guides you through three steps:

1. **Language** — Choose Chinese or English
2. **Storage Paths** — Set document library directory and AI model directory (defaults are fine)
3. **AI Setup** — One-click built-in AI setup:
   - Hardware detection → enumerate backends (CUDA / Vulkan / Metal / CPU)
   - Multi-engine benchmark → auto-select fastest backend
   - Model selection list → you choose → download → start
   - Or configure Ollama / OpenAI-compatible API

The wizard only appears once. All settings can be changed later.

---

## Importing Documents

| Method | Description |
|:---|:---|
| 📂 Import Documents | Select one or more files |
| 📁 Import Folder | Select a folder, auto-scans all supported files |

Import options:

- **Import Copy** (recommended) — Copies file to app data folder; moving/deleting original won't affect reading
- **Open Directly** — Reads from original path; file becomes inaccessible if moved or deleted

Supported formats: `.pdf` `.epub` `.md` `.txt`

---

## Reading Documents

**PDF Reader** — Continuous scroll, zoom controls, page navigation, text selection auto-opens AI panel, internal link navigation, independent document theme.

**EPUB Reader** — Paginated/scroll mode toggle, zoom, independent document theme, TOC chapter highlight tracking.

**Markdown Reader** — Renders Markdown with headings, lists, code blocks, tables, images, etc.

**TXT Reader** — Plain text display with word wrap.

---

## Table of Contents

PDF and EPUB support a TOC sidebar, opened via:

1. Edge strip `>` on the left side of the reading area
2. TOC button on the far left of the floating toolbar

Supports hierarchical nesting, click to navigate, active highlight, resizable width.

---

## AI Assistant

**Opening:** Click the AI button in the header, or select text to auto-open.

### Translate

| Mode | Description |
|:---|:---|
| Free | Natural, fluent translation |
| Literal | Word-by-word translation |
| Plain | Explained in simplest language |

Auto-detects Chinese↔English direction.

### Grammar Explain

Breaks down grammar structure and vocabulary usage for deeper understanding.

### Chat

- **Context-aware** — Select text, AI locks it as context for follow-up questions
- **Enter** to send, **Shift+Enter** for new line
- Persistent chat history per document
- Select messages to save as notes

### Notes

- One-click save from translation/explanation
- Notes linked to documents, export as Markdown

### Deep Thinking

- **On** (amber) — AI thinks before answering, higher quality
- **Off** — AI answers directly, faster

Built-in Qwen3 supports **truly disabling** thinking (skips internal reasoning). This differs from Ollama's soft disable.

---

## Dictionary Popup

**Double-click** a word to show a dictionary popup.

- **ECDICT** — English → Chinese (phonetics, parts of speech, meaning)
- **CC-CEDICT** — Chinese → English (pinyin, parts of speech, meaning)
- Each direction toggleable in Settings

---

## Settings

All settings take effect immediately.

### General

| Setting | Description |
|:---|:---|
| UI Language | Chinese / English |
| Offline Dictionary | ECDICT (EN→CN) and CC-CEDICT (CN→EN) toggles |
| Document Library | Custom storage path for imported copies |
| Model Directory | AI model files (GGUF) location; migration offered when changed |

### AI

| Provider | Description |
|:---|:---|
| 🖥 Built-in Local | Uses built-in Qwen3 models, works offline |
| 🦙 Ollama | Connects to local Ollama service |
| 🌐 OpenAI Compatible | Connects to any OpenAI-compatible API |

**Simple Mode** (one-click setup) and **Advanced Mode** (manual model selection, GPU config).

**Smart Tier Strategy** — 3-layer adaptive:

1. **Hardware Detection** — Enumerate backends (CUDA / Vulkan / Metal / CPU)
2. **Multi-Engine Benchmark** — llama-bench on each, pick fastest
3. **Model Selection** — Recommend tier, user chooses from full list

| Benchmark | Model | Size |
|:---|:---|:---|
| ≥ 420 tok/s | Qwen3-32B | ~19 GB |
| 185–419 tok/s | Qwen3-14B | ~9 GB |
| 100–184 tok/s | Qwen3-8B | ~5 GB |
| 50–99 tok/s | Qwen3-4B | ~2.7 GB |
| 20–49 tok/s | Qwen3-1.7B | ~1.2 GB |
| < 20 tok/s | Qwen3-0.6B | ~0.5 GB |

All models Q4_K_M quantization. Integrated GPUs auto fall back to CPU.

### Storage

- Document cache management (LRU)
- Reset app (clears all data)

---

## Keyboard Shortcuts

| Shortcut | Function |
|:---|:---|
| Double-click word | Dictionary popup |
| Select text | Auto-open AI panel |
| Enter (chat) | Send message |
| Shift + Enter (chat) | New line |

---

## FAQ

**Q: Model download is slow?**
The system auto-probes the fastest mirror (ModelScope in China / HuggingFace overseas). If still slow, click **Link** in advanced mode → download with another tool → click **Import**.

**Q: Which platforms and GPUs are supported?**
Windows x64, macOS (arm64/x64), Ubuntu 22.04+ x64, Ubuntu 20.04 x64 (dedicated focal build). GPU: NVIDIA (CUDA 12.4/13.1), AMD/Intel (Vulkan), Apple Silicon (Metal), CPU mode (all computers).

**Q: Why doesn't my integrated GPU use GPU acceleration?**
Integrated GPUs typically have < 2GB VRAM. GPU mode is slower than CPU. The system auto-detects and falls back.

**Q: Model too slow?**
Use "Downgrade to smaller model" in Simple Mode, or select manually in Advanced Mode.

**Q: How to update?**
Download and run the new installer. Automatic overwrite, data preserved.

**Q: White screen on Linux in a virtual machine?**
This is caused by WebKitGTK GPU compositing failing in VMs. Since v1.1.0, the app auto-detects VM environments and disables GPU compositing. If you still get a white screen, launch with: `WEBKIT_DISABLE_COMPOSITING_MODE=1 aireader`

**Q: Is there a dedicated version for Ubuntu 20.04?**
Yes. Starting from v1.1.0, a dedicated focal AppImage is available with self-compiled llama.cpp runtime that doesn't require newer glibc. Download the AppImage with `focal` in the filename.

**Q: Is built-in AI configuration required?**
No. Built-in AI is provided for convenience so new users can get started immediately. If you already have an Ollama service or OpenAI-compatible API, you can skip the built-in AI setup in the wizard or settings page and use your external AI service directly.

---

*AiReader — Read. Select. Translate. Save.*
