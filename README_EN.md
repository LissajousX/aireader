<div align="center">

# Aireader

### Your Documents. Your GPU. Your Knowledge.

**AI-powered reading assistant that runs 100% on your machine**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tauri 2.0](https://img.shields.io/badge/Tauri-2.0-orange)](https://tauri.app)
[![llama.cpp](https://img.shields.io/badge/llama.cpp-b7966-green)](https://github.com/ggerganov/llama.cpp)

[中文版](README_CN.md) · [User Guide](USER_GUIDE_EN.md)

</div>

---

## Why Aireader?

> Your documents never leave your machine. AI inference runs 100% locally.

Most AI reading tools send your documents to the cloud. Aireader is different:

- **🔒 Fully Offline** — Built-in llama.cpp engine. AI runs on your computer. Data never leaves your machine.
- **⚡ Smart Hardware Adaptation** — Auto-detects GPU, benchmarks all backends (CUDA / Vulkan / Metal / CPU), picks the fastest, then you choose the model from a recommended list.
- **📖 Reading-First Design** — Not another chatbot. A true AI assistant built for deep reading: select → translate → explain → save.

## Screenshots

<div align="center">

![Main Interface](screenshots/main-interface.png)

</div>

<details>
<summary>More Screenshots</summary>

![Select to Translate](screenshots/select-translate.png)
![AI Chat](screenshots/ai-chat.png)
![Quick Setup](screenshots/quick-setup.png)
![Dark Theme](screenshots/dark-theme.png)
![Dictionary Popup](screenshots/dictionary-popup.png)

</details>

## Key Features

| Feature | Description |
|:---|:---|
| 📄 **Multi-Format** | PDF · EPUB · Markdown · TXT with auto-saved reading progress |
| 🤖 **Local AI** | Built-in llama.cpp, zero-config, multi-engine benchmark for precise hardware matching |
| 🌐 **Multiple Backends** | Built-in Qwen3 (0.6B–32B) · Ollama · OpenAI-compatible APIs |
| 🔤 **Select to Translate** | Literal / free / plain-language translation, complex sentence breakdown |
| 📚 **Offline Dictionary** | Built-in ECDICT + CC-CEDICT, double-click lookup, bidirectional CN↔EN |
| 📝 **Smart Notes** | AI-generated drafts, human-confirmed, persistent storage (SQLite) |
| 💬 **Contextual Chat** | Multi-turn conversation about reading content, with deep thinking support |
| 📁 **Document Library** | Copy or link import, custom storage, independent model directory |
| 🌓 **Dark / Light Theme** | Follow system or manual toggle, independent document area control |
| 🌍 **Bilingual UI** | Chinese & English, auto-detected |

## Smart Hardware Adaptation

Aireader uses a **3-layer adaptive strategy** to automatically match the best model for your hardware:

1. **Hardware Detection** — Detect GPU type & VRAM, enumerate all available backends (CUDA / Vulkan / Metal / CPU)
2. **Multi-Engine Benchmark** — Install & run llama-bench on each backend, measure actual inference speed (tok/s), auto-select the fastest
3. **Model Selection** — Recommend a model tier based on benchmark, present the full list for you to choose

| Benchmark Result | Recommended Model | Size |
|:---|:---|:---|
| ≥ 200 tok/s | Qwen3-32B | ~19 GB |
| 150–199 tok/s | Qwen3-14B | ~9 GB |
| ≥ 100 tok/s | Qwen3-8B | ~5 GB |
| 50–99 tok/s | Qwen3-4B | ~2.7 GB |
| 20–49 tok/s | Qwen3-1.7B | ~1.2 GB |
| < 20 tok/s | Qwen3-0.6B | ~0.5 GB |

All models use Q4_K_M quantization. Integrated GPUs (Intel UHD/HD/Iris, VRAM < 2GB) automatically fall back to CPU mode.

## Download Mirrors

Model and runtime downloads automatically probe both mirrors and pick the fastest:

- **ModelScope** — Fast in mainland China
- **HuggingFace / GitHub** — Fast overseas

No manual configuration needed. The system races HEAD requests to both and downloads from whichever responds first.

## Supported Platforms

| Platform | GPU Acceleration |
|:---|:---|
| **Windows x64** | CUDA 12.4/13.1 · Vulkan · CPU |
| **macOS arm64** | Metal (CPU+GPU unified binary) |
| **macOS x64** | CPU |
| **Ubuntu x64** | Vulkan · CPU |

## Quick Start

```bash
npm install          # Install dependencies
npm run tauri dev    # Development mode
npm run tauri build  # Build for production
```

### How to Use

1. First launch → Setup wizard (language → storage paths → **multi-engine benchmark → choose model → start**)
2. Open a document, select text
3. AI panel appears → Translate / Explain / Chat
4. Save valuable content as notes

📖 Full user guide: [USER_GUIDE_EN.md](USER_GUIDE_EN.md)

## Development Requirements

- Node.js 18+
- Rust 1.70+
- Optional: Ollama (for Ollama mode)

## License

[MIT](LICENSE) © xujiayu
