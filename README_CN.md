<div align="center">

# Aireader

### 你的文档，你的算力，你的知识

**完全本地运行的 AI 阅读助手**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tauri 2.0](https://img.shields.io/badge/Tauri-2.0-orange)](https://tauri.app)
[![llama.cpp](https://img.shields.io/badge/llama.cpp-b7966-green)](https://github.com/ggerganov/llama.cpp)

[English](README_EN.md) · [用户指南](USER_GUIDE_CN.md)

</div>

---

## 为什么选择 Aireader？

> 你的文档不会上传到任何云端。AI 推理完全在本地运行。

大多数 AI 阅读工具需要把你的文档发送到云端，Aireader 不同：

- **🔒 完全离线** — 内置 llama.cpp 推理引擎，AI 在你的电脑上运行，数据永远不出本机
- **⚡ 智能硬件适配** — 自动检测 GPU，多引擎基准测试（CUDA / Vulkan / Metal / CPU），自动选最快后端，展示模型列表由你自选
- **📖 专注阅读** — 不是又一个聊天工具，而是真正为深度阅读设计的 AI 助手：选中 → 翻译 → 解释 → 保存

## 截图预览

<div align="center">

![主界面](screenshots/main-interface.png)

</div>

<details>
<summary>更多截图</summary>

![选中即译](screenshots/select-translate.png)
![AI 对话](screenshots/ai-chat.png)
![一键配置](screenshots/quick-setup.png)
![暗色主题](screenshots/dark-theme.png)
![词典弹窗](screenshots/dictionary-popup.png)

</details>

## 核心功能

| 功能 | 描述 |
|:---|:---|
| 📄 **多格式支持** | PDF · EPUB · Markdown · TXT，阅读进度自动保存 |
| 🤖 **本地 AI 推理** | 内置 llama.cpp，零配置开箱即用，多引擎基准测试精准匹配硬件 |
| 🌐 **多种 AI 后端** | 内置 Qwen3（0.6B–32B）· Ollama · OpenAI 兼容 API |
| 🔤 **选中即翻译** | 直译 / 意译 / 白话解释，复杂长句自动拆解 |
| 📚 **离线词典** | 内置 ECDICT + CC-CEDICT，双击即查，中英双向互译 |
| 📝 **智能笔记** | AI 生成候选笔记，人工确认后持久化存储 (SQLite) |
| 💬 **上下文对话** | 围绕阅读内容多轮对话，支持深度思考 |
| 📁 **文档库管理** | 副本导入 / 链接导入，自定义存储目录 |
| 🌓 **暗色 / 亮色主题** | 跟随系统或手动切换，文档区域可独立控制 |
| 🌍 **中英双语界面** | 自动检测系统语言 |

## 智能硬件适配

Aireader 采用 **三层自适应策略** 自动为你的硬件匹配最流畅的模型：

1. **硬件探测** — 检测 GPU 类型与显存，枚举所有可用计算后端（CUDA / Vulkan / Metal / CPU）
2. **多引擎测试** — 逐个后端运行 llama-bench 实测推理速度 (tok/s)，自动选择最快后端
3. **模型选择** — 根据测试结果推荐模型等级，展示完整列表由你自行选择

| 基准测试结果 | 推荐模型 | 大小 |
|:---|:---|:---|
| ≥ 200 tok/s | Qwen3-32B | ~19 GB |
| 150–199 tok/s | Qwen3-14B | ~9 GB |
| ≥ 100 tok/s | Qwen3-8B | ~5 GB |
| 50–99 tok/s | Qwen3-4B | ~2.7 GB |
| 20–49 tok/s | Qwen3-1.7B | ~1.2 GB |
| < 20 tok/s | Qwen3-0.6B | ~0.5 GB |

所有模型均为 Q4_K_M 量化。集成显卡（Intel UHD/HD/Iris，显存 < 2GB）自动回退 CPU 模式。

## 下载镜像

模型和运行时下载会自动探测两个镜像源并选择最快的：

- **ModelScope** — 国内高速
- **HuggingFace / GitHub** — 海外高速

无需手动配置。系统自动向两个源发送 HEAD 请求竞速，选择响应最快的下载。

## 支持平台

| 平台 | GPU 加速 |
|:---|:---|
| **Windows x64** | CUDA 12.4/13.1 · Vulkan · CPU |
| **macOS arm64** | Metal（CPU+GPU 同一二进制） |
| **macOS x64** | CPU |
| **Ubuntu x64** | Vulkan · CPU |

## 快速开始

```bash
npm install          # 安装依赖
npm run tauri dev    # 开发模式
npm run tauri build  # 构建发布版
```

### 使用方式

1. 首次启动 → 引导向导（语言 → 存储路径 → **多引擎测试 → 选择模型 → 启动**）
2. 打开文档，选中文本
3. AI 面板自动弹出 → 翻译 / 解释 / 对话
4. 有价值的内容 → 保存为笔记

📖 详细使用指南：[USER_GUIDE_CN.md](USER_GUIDE_CN.md)

## 开发环境

- Node.js 18+
- Rust 1.70+
- 可选：Ollama（用于 Ollama 模式）

## 许可证

[MIT](LICENSE) © xujiayu
