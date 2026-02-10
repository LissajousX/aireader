/**
 * Centralized download URL configuration for llama.cpp runtime and GGUF models.
 *
 * Two mirror sets are provided:
 *   - ModelScope (fast in China mainland)
 *   - GitHub / HuggingFace (international)
 *
 * The Rust backend (`builtin_llm.rs`) has its own copy of these URLs and
 * handles the actual downloading with automatic mirror fallback.
 * This frontend config is used for:
 *   1. Displaying download links in Settings UI (so users can copy/override)
 *   2. Passing custom URLs to the Rust backend when the user overrides them
 *
 * Runtime version: llama.cpp b7966
 * Supported platforms: Windows x64, macOS (arm64/x64), Ubuntu x64
 */

// ─── Platform detection ───

export type Platform = 'windows' | 'macos' | 'linux';

export function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (ua.includes('Macintosh') || navigator.platform?.startsWith('Mac')) return 'macos';
  if (ua.includes('Windows')) return 'windows';
  return 'linux';
}

export function isMacArm64(): boolean {
  // Apple Silicon detection heuristic
  return detectPlatform() === 'macos' && !navigator.userAgent.includes('Intel');
}

// ─── Runtime downloads ───

const RUNTIME_VERSION = 'b7966';

interface RuntimeEntry {
  key: string;
  label: string;
  /** URL per mirror: [modelscope, github] */
  urls: Record<Platform, [string, string] | null>;
}

const RT_BASE_MS = `https://www.modelscope.cn/datasets/Lissajous/llamacppforall/resolve/master/${RUNTIME_VERSION}`;
const RT_BASE_GH = `https://github.com/ggml-org/llama.cpp/releases/download/${RUNTIME_VERSION}`;

export const RUNTIME_ENTRIES: RuntimeEntry[] = [
  {
    key: '__rt_cpu',
    label: 'llama.cpp CPU',
    urls: {
      windows: [`${RT_BASE_MS}/llama-${RUNTIME_VERSION}-bin-win-cpu-x64.zip`, `${RT_BASE_GH}/llama-${RUNTIME_VERSION}-bin-win-cpu-x64.zip`],
      macos: isMacArm64()
        ? [`${RT_BASE_MS}/llama-${RUNTIME_VERSION}-bin-macos-arm64.tar.gz`, `${RT_BASE_GH}/llama-${RUNTIME_VERSION}-bin-macos-arm64.tar.gz`]
        : [`${RT_BASE_MS}/llama-${RUNTIME_VERSION}-bin-macos-x64.tar.gz`, `${RT_BASE_GH}/llama-${RUNTIME_VERSION}-bin-macos-x64.tar.gz`],
      linux: [`${RT_BASE_MS}/llama-${RUNTIME_VERSION}-bin-ubuntu-x64.tar.gz`, `${RT_BASE_GH}/llama-${RUNTIME_VERSION}-bin-ubuntu-x64.tar.gz`],
    },
  },
  {
    key: '__rt_vulkan',
    label: 'llama.cpp Vulkan',
    urls: {
      windows: [`${RT_BASE_MS}/llama-${RUNTIME_VERSION}-bin-win-vulkan-x64.zip`, `${RT_BASE_GH}/llama-${RUNTIME_VERSION}-bin-win-vulkan-x64.zip`],
      macos: null, // macOS uses Metal, not Vulkan
      linux: [`${RT_BASE_MS}/llama-${RUNTIME_VERSION}-bin-ubuntu-vulkan-x64.tar.gz`, `${RT_BASE_GH}/llama-${RUNTIME_VERSION}-bin-ubuntu-vulkan-x64.tar.gz`],
    },
  },
  {
    key: '__rt_metal',
    label: 'llama.cpp Metal',
    urls: {
      windows: null,
      macos: isMacArm64()
        ? [`${RT_BASE_MS}/llama-${RUNTIME_VERSION}-bin-macos-arm64.tar.gz`, `${RT_BASE_GH}/llama-${RUNTIME_VERSION}-bin-macos-arm64.tar.gz`]
        : [`${RT_BASE_MS}/llama-${RUNTIME_VERSION}-bin-macos-x64.tar.gz`, `${RT_BASE_GH}/llama-${RUNTIME_VERSION}-bin-macos-x64.tar.gz`],
      linux: null,
    },
  },
  {
    key: '__rt_cuda_12.4',
    label: 'llama.cpp CUDA 12.4',
    urls: {
      windows: [`${RT_BASE_MS}/llama-${RUNTIME_VERSION}-bin-win-cuda-12.4-x64.zip`, `${RT_BASE_GH}/llama-${RUNTIME_VERSION}-bin-win-cuda-12.4-x64.zip`],
      macos: null,
      linux: null, // Official llama.cpp does not provide Linux CUDA binary
    },
  },
  {
    key: '__rt_cuda_13.1',
    label: 'llama.cpp CUDA 13.1',
    urls: {
      windows: [`${RT_BASE_MS}/llama-${RUNTIME_VERSION}-bin-win-cuda-13.1-x64.zip`, `${RT_BASE_GH}/llama-${RUNTIME_VERSION}-bin-win-cuda-13.1-x64.zip`],
      macos: null,
      linux: null,
    },
  },
  {
    key: '__cudart_12.4',
    label: 'CUDA Runtime 12.4',
    urls: {
      windows: [`${RT_BASE_MS}/cudart-llama-bin-win-cuda-12.4-x64.zip`, `${RT_BASE_GH}/cudart-llama-bin-win-cuda-12.4-x64.zip`],
      macos: null,
      linux: null,
    },
  },
  {
    key: '__cudart_13.1',
    label: 'CUDA Runtime 13.1',
    urls: {
      windows: [`${RT_BASE_MS}/cudart-llama-bin-win-cuda-13.1-x64.zip`, `${RT_BASE_GH}/cudart-llama-bin-win-cuda-13.1-x64.zip`],
      macos: null,
      linux: null,
    },
  },
];

/** Get runtime entries relevant for the current platform */
export function getRuntimeDownloads(platform?: Platform): Array<{ key: string; label: string; defaultUrl: string }> {
  const p = platform ?? detectPlatform();
  return RUNTIME_ENTRIES
    .filter(e => e.urls[p] != null)
    .map(e => ({
      key: e.key,
      label: e.label,
      defaultUrl: e.urls[p]![0], // ModelScope as primary default
    }));
}

// ─── Model downloads ───

export interface BuiltinModelDef {
  id: string;
  title: string;
  subtitleZh: string;
  subtitleEn: string;
  tier: number;
  ramHintZh: string;
  ramHintEn: string;
  /** [modelscope, huggingface] */
  urls: [string, string];
}

const MODEL_MS = 'https://www.modelscope.cn/models/unsloth';
const MODEL_HF = 'https://huggingface.co/unsloth';

function ggufUrls(size: string, quant: string): [string, string] {
  return [
    `${MODEL_MS}/Qwen3-${size}-GGUF/resolve/master/Qwen3-${size}-${quant}.gguf`,
    `${MODEL_HF}/Qwen3-${size}-GGUF/resolve/main/Qwen3-${size}-${quant}.gguf`,
  ];
}

export const BUILTIN_MODELS: BuiltinModelDef[] = [
  {
    id: 'qwen3_0_6b_q4_k_m',
    title: 'Qwen3-0.6B',
    subtitleZh: 'Q4_K_M · 极速轻量',
    subtitleEn: 'Q4_K_M · Ultra-light',
    tier: 0,
    ramHintZh: '≥4GB 内存',
    ramHintEn: '≥4GB RAM',
    urls: ggufUrls('0.6B', 'Q4_K_M'),
  },
  {
    id: 'qwen3_1_7b_q4_k_m',
    title: 'Qwen3-1.7B',
    subtitleZh: 'Q4_K_M · 性价比之选',
    subtitleEn: 'Q4_K_M · Best value',
    tier: 1,
    ramHintZh: '≥8GB 内存',
    ramHintEn: '≥8GB RAM',
    urls: ggufUrls('1.7B', 'Q4_K_M'),
  },
  {
    id: 'qwen3_4b_q4_k_m',
    title: 'Qwen3-4B',
    subtitleZh: 'Q4_K_M · 更强能力',
    subtitleEn: 'Q4_K_M · Stronger',
    tier: 2,
    ramHintZh: '≥12GB 内存',
    ramHintEn: '≥12GB RAM',
    urls: ggufUrls('4B', 'Q4_K_M'),
  },
  {
    id: 'qwen3_8b_q4_k_m',
    title: 'Qwen3-8B',
    subtitleZh: 'Q4_K_M · 高性能',
    subtitleEn: 'Q4_K_M · High perf',
    tier: 3,
    ramHintZh: '≥16GB 内存 / 独显',
    ramHintEn: '≥16GB RAM / dGPU',
    urls: ggufUrls('8B', 'Q4_K_M'),
  },
  {
    id: 'qwen3_14b_q4_k_m',
    title: 'Qwen3-14B',
    subtitleZh: 'Q4_K_M · 高质量翻译',
    subtitleEn: 'Q4_K_M · Quality translation',
    tier: 4,
    ramHintZh: '≥10GB 显存 (RTX 3080)',
    ramHintEn: '≥10GB VRAM (RTX 3080)',
    urls: ggufUrls('14B', 'Q4_K_M'),
  },
  {
    id: 'qwen3_32b_q4_k_m',
    title: 'Qwen3-32B',
    subtitleZh: 'Q4_K_M · 旗舰级翻译',
    subtitleEn: 'Q4_K_M · Flagship translation',
    tier: 5,
    ramHintZh: '≥24GB 显存 (RTX 4090)',
    ramHintEn: '≥24GB VRAM (RTX 4090)',
    urls: ggufUrls('32B', 'Q4_K_M'),
  },
];

/** Get display name for a builtin model ID */
export function getModelDisplayName(modelId: string): string | null {
  const m = BUILTIN_MODELS.find(m => m.id === modelId);
  if (!m) return null;
  return `${m.title} (Q4_K_M)`;
}

/** All model IDs ordered from largest to smallest (for downgrade logic) */
export const TIER_ORDER_DESC = BUILTIN_MODELS
  .slice()
  .sort((a, b) => b.tier - a.tier || b.id.localeCompare(a.id))
  .map(m => m.id);
