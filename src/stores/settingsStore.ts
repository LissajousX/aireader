import { create } from 'zustand';

export interface PromptSettings {
  translateLiteral: string;
  translateFree: string;
  translatePlain: string;
  translateLiteralZhToEn: string;
  translateFreeZhToEn: string;
  translatePlainZhToEn: string;
  explain: string;
  explainZhToEn: string;
  chatContext: string;
}

export type LLMProvider = 'builtin_local' | 'ollama' | 'openai_compatible';

export const DEFAULT_PROMPTS: PromptSettings = {
  translateLiteral: `请将以下英文文本直译为中文，保持原文的句式结构，尽量逐字逐句翻译：\n\n{text}\n\n直译结果：`,
  translateFree: `请将以下英文文本意译为中文，保持原文的核心含义，用自然流畅的中文表达：\n\n{text}\n\n意译结果：`,
  translatePlain: `请用简单易懂的白话解释以下英文文本的含义，就像给一个不懂专业术语的人解释一样：\n\n{text}\n\n白话解释：`,
  translateLiteralZhToEn: `请将以下中文文本直译为英文，保持原文的句式结构，尽量逐字逐句翻译：\n\n{text}\n\nLiteral translation:`,
  translateFreeZhToEn: `请将以下中文文本意译为英文，保持原文的核心含义，用自然流畅的英文表达：\n\n{text}\n\nFree translation:`,
  translatePlainZhToEn: `Please explain the meaning of the following Chinese text in simple English:\n\n{text}\n\nExplanation:`,
  explain: `请详细解释以下英文文本的语法结构：\n\n{text}\n\n请提供：\n1. 句子成分分析（主语、谓语、宾语、定语、状语等）\n2. 关键语法点解释\n3. 重要词汇用法\n4. 整体含义解读\n\n文法解释：`,
  explainZhToEn: `Please explain the grammar of the following Chinese text in English.\n\nText:\n{text}\n\nProvide:\n1. Sentence structure analysis\n2. Key grammar points\n3. Important vocabulary usage\n4. Overall meaning\n\nGrammar explanation (in English):`,
  chatContext: `The user has selected the following text from the document:\n\n"{text}"\n\nPlease answer questions based on this context. Respond in the same language as the user's question.`,
};

interface SettingsState {
  uiLanguage: 'zh' | 'en';
  dictEnableEnToZh: boolean;
  dictEnableZhToEn: boolean;
  documentsDir: string | null;
  llmProvider: LLMProvider;
  ollamaUrl: string;
  ollamaModel: string;
  builtinModelId: string;
  builtinAutoEnabled: boolean;
  builtinPreferredTier: 'auto' | 0 | 1 | 2 | 3;
  builtinPreferredCompute: 'auto' | 'cpu' | 'gpu' | 'hybrid';
  builtinComputeMode: 'cpu' | 'gpu' | 'hybrid';
  builtinGpuBackend: 'vulkan' | 'cuda' | 'metal';
  builtinGpuLayers: number;
  builtinCudaVersion: '12.4' | '13.1';
  openAICompatibleBaseUrl: string;
  openAICompatibleApiKey: string;
  openAICompatibleModel: string;
  enableThinking: boolean;
  markdownScale: number;
  prompts: PromptSettings;
  builtinDownloadUrls: Record<string, string>;
  
  getActiveModel: () => string;
  setUiLanguage: (lang: 'zh' | 'en') => void;
  setDictEnableEnToZh: (enabled: boolean) => void;
  setDictEnableZhToEn: (enabled: boolean) => void;
  setDocumentsDir: (dir: string | null) => void;
  setLlmProvider: (provider: LLMProvider) => void;
  setOllamaUrl: (url: string) => void;
  setOllamaModel: (model: string) => void;
  setBuiltinModelId: (id: string) => void;
  setBuiltinAutoEnabled: (enabled: boolean) => void;
  setBuiltinPreferredTier: (tier: 'auto' | 0 | 1 | 2 | 3) => void;
  setBuiltinPreferredCompute: (mode: 'auto' | 'cpu' | 'gpu' | 'hybrid') => void;
  setBuiltinComputeMode: (mode: 'cpu' | 'gpu' | 'hybrid') => void;
  setBuiltinGpuBackend: (backend: 'vulkan' | 'cuda' | 'metal') => void;
  setBuiltinGpuLayers: (layers: number) => void;
  setBuiltinCudaVersion: (v: '12.4' | '13.1') => void;
  setOpenAICompatibleBaseUrl: (url: string) => void;
  setOpenAICompatibleApiKey: (key: string) => void;
  setOpenAICompatibleModel: (model: string) => void;
  setActiveModel: (model: string) => void;
  setEnableThinking: (enabled: boolean) => void;
  setMarkdownScale: (scale: number) => void;
  setPrompt: (key: keyof PromptSettings, value: string) => void;
  resetPrompt: (key: keyof PromptSettings) => void;
  resetAllPrompts: () => void;
  setBuiltinDownloadUrl: (modelId: string, url: string) => void;
  resetBuiltinDownloadUrl: (modelId: string) => void;
  resetAllBuiltinDownloadUrls: () => void;
  loadSettings: () => void;
  saveSettings: () => void;
}

const STORAGE_KEY = 'aireader_settings';

const normalizeLegacyBuiltinModelId = (raw: string | null | undefined): string => {
  const v = (raw || '').trim();
  if (!v) return 'qwen3_0_6b_q4_k_m';
  if (v === 'q4_k_m') return 'qwen3_0_6b_q4_k_m';
  if (v === 'q8_0') return 'qwen3_0_6b_q4_k_m';
  return v;
};

const loadFromStorage = (): Partial<SettingsState> => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('[Settings] 加载设置失败:', e);
  }
  return {};
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  uiLanguage: (() => {
    const saved = localStorage.getItem('ui_language');
    if (saved === 'en') return 'en';
    return 'zh';
  })(),
  dictEnableEnToZh: (() => {
    const raw = localStorage.getItem('dict_enable_en_to_zh');
    if (raw === '0' || raw === 'false') return false;
    return true;
  })(),
  dictEnableZhToEn: (() => {
    const raw = localStorage.getItem('dict_enable_zh_to_en');
    if (raw === '0' || raw === 'false') return false;
    return true;
  })(),
  documentsDir: (() => {
    const raw = localStorage.getItem('documents_dir');
    const v = (raw || '').trim();
    return v ? v : null;
  })(),
  llmProvider: (() => {
    const saved = localStorage.getItem("llm_provider") as LLMProvider | null;
    if (saved === 'openai_compatible' || saved === 'ollama' || saved === 'builtin_local') return saved;
    return 'builtin_local';
  })(),
  ollamaUrl: localStorage.getItem("ollama_url") || "http://localhost:11434",
  ollamaModel: localStorage.getItem("ollama_model") || "qwen3:8b",
  builtinModelId: normalizeLegacyBuiltinModelId(localStorage.getItem('builtin_model_id')),
  builtinAutoEnabled: (() => {
    const raw = localStorage.getItem('builtin_auto_enabled');
    if (raw === '0' || raw === 'false') return false;
    if (raw === '1' || raw === 'true') return true;
    return false;
  })(),
  builtinPreferredTier: (() => {
    const raw = localStorage.getItem('builtin_preferred_tier');
    if (raw === '0') return 0;
    if (raw === '1') return 1;
    if (raw === '2') return 2;
    if (raw === '3') return 3;
    return 'auto';
  })(),
  builtinPreferredCompute: (() => {
    const raw = localStorage.getItem('builtin_preferred_compute');
    if (raw === 'cpu' || raw === 'gpu' || raw === 'hybrid') return raw;
    return 'auto';
  })(),
  builtinComputeMode: (() => {
    const raw = localStorage.getItem('builtin_compute_mode');
    if (raw === 'gpu' || raw === 'hybrid') return raw;
    return 'cpu';
  })(),
  builtinGpuBackend: (() => {
    const raw = localStorage.getItem('builtin_gpu_backend');
    if (raw === 'cuda') return 'cuda';
    if (raw === 'metal') return 'metal';
    if (raw === 'vulkan') return 'vulkan';
    // Auto-detect: use Metal on macOS, Vulkan on others
    const isMac = navigator.userAgent.includes('Macintosh') || navigator.platform?.startsWith('Mac');
    return isMac ? 'metal' : 'vulkan';
  })(),
  builtinGpuLayers: (() => {
    const raw = localStorage.getItem('builtin_gpu_layers');
    const v = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(v) ? Math.max(0, Math.min(200, v)) : 20;
  })(),
  builtinCudaVersion: (() => {
    const raw = localStorage.getItem('builtin_cuda_version');
    if (raw === '13.1') return '13.1';
    return '12.4';
  })(),
  openAICompatibleBaseUrl: localStorage.getItem("openai_compatible_base_url") || "https://api.openai.com/v1",
  openAICompatibleApiKey: localStorage.getItem("openai_compatible_api_key") || "",
  openAICompatibleModel: localStorage.getItem("openai_compatible_model") || "gpt-4o-mini",
  enableThinking: true,
  markdownScale: (() => {
    const raw = localStorage.getItem('markdown_scale');
    const v = raw ? Number.parseFloat(raw) : NaN;
    return Number.isFinite(v) ? v : 1.0;
  })(),
  prompts: { ...DEFAULT_PROMPTS },
  builtinDownloadUrls: {},

  getActiveModel: () => {
    const state = get();
    if (state.llmProvider === 'openai_compatible') return state.openAICompatibleModel;
    if (state.llmProvider === 'ollama') return state.ollamaModel;
    if (state.builtinModelId === 'qwen3_0_6b_q4_k_m') return 'Qwen3-0.6B (Q4_K_M)';
    if (state.builtinModelId === 'qwen3_1_7b_q4_k_m') return 'Qwen3-1.7B (Q4_K_M)';
    if (state.builtinModelId === 'qwen3_4b_q4_k_m') return 'Qwen3-4B (Q4_K_M)';
    if (state.builtinModelId === 'qwen3_4b_q5_k_m') return 'Qwen3-4B (Q5_K_M)';
    if (state.builtinModelId === 'qwen3_8b_q4_k_m') return 'Qwen3-8B (Q4_K_M)';
    if (state.builtinModelId === 'qwen3_8b_q5_k_m') return 'Qwen3-8B (Q5_K_M)';
    return state.builtinModelId;
  },
  setUiLanguage: (lang) => set({ uiLanguage: lang }),
  setDictEnableEnToZh: (enabled) => set({ dictEnableEnToZh: !!enabled }),
  setDictEnableZhToEn: (enabled) => set({ dictEnableZhToEn: !!enabled }),
  setDocumentsDir: (dir) => set({ documentsDir: dir ? String(dir) : null }),
  setLlmProvider: (provider) => set({ llmProvider: provider }),
  setOllamaUrl: (url) => set({ ollamaUrl: url }),
  setOllamaModel: (model) => set({ ollamaModel: model }),
  setBuiltinModelId: (id) => set({ builtinModelId: id }),
  setBuiltinAutoEnabled: (enabled) => set({ builtinAutoEnabled: enabled }),
  setBuiltinPreferredTier: (tier) => set({ builtinPreferredTier: tier }),
  setBuiltinPreferredCompute: (mode) => set({ builtinPreferredCompute: mode }),
  setBuiltinComputeMode: (mode) => set({ builtinComputeMode: mode }),
  setBuiltinGpuBackend: (backend) => set({ builtinGpuBackend: backend }),
  setBuiltinGpuLayers: (layers) => set({ builtinGpuLayers: Math.max(0, Math.min(200, Math.floor(layers))) }),
  setBuiltinCudaVersion: (v) => set({ builtinCudaVersion: v }),
  setOpenAICompatibleBaseUrl: (url) => set({ openAICompatibleBaseUrl: url }),
  setOpenAICompatibleApiKey: (key) => set({ openAICompatibleApiKey: key }),
  setOpenAICompatibleModel: (model) => set({ openAICompatibleModel: model }),
  setActiveModel: (model) =>
    set((state) =>
      state.llmProvider === 'openai_compatible'
        ? { openAICompatibleModel: model }
        : state.llmProvider === 'ollama'
          ? { ollamaModel: model }
          : {}
    ),
  setEnableThinking: (enabled) => set({ enableThinking: enabled }),
  setMarkdownScale: (scale) => set({ markdownScale: Math.max(0.8, Math.min(1.2, scale)) }),
  
  setPrompt: (key, value) => set((state) => ({
    prompts: { ...state.prompts, [key]: value }
  })),
  
  resetPrompt: (key) => set((state) => ({
    prompts: { ...state.prompts, [key]: DEFAULT_PROMPTS[key] }
  })),
  
  resetAllPrompts: () => set({ prompts: { ...DEFAULT_PROMPTS } }),
  
  setBuiltinDownloadUrl: (modelId, url) => set((state) => ({
    builtinDownloadUrls: { ...state.builtinDownloadUrls, [modelId]: url }
  })),
  resetBuiltinDownloadUrl: (modelId) => set((state) => {
    const { [modelId]: _, ...rest } = state.builtinDownloadUrls;
    return { builtinDownloadUrls: rest };
  }),
  resetAllBuiltinDownloadUrls: () => set({ builtinDownloadUrls: {} }),
  
  loadSettings: () => {
    const saved = loadFromStorage();
    if ((saved as any).uiLanguage === 'en' || (saved as any).uiLanguage === 'zh') {
      set({ uiLanguage: (saved as any).uiLanguage });
    }
    if ((saved as any).dictEnableEnToZh !== undefined) {
      set({ dictEnableEnToZh: !!(saved as any).dictEnableEnToZh });
    }
    if ((saved as any).dictEnableZhToEn !== undefined) {
      set({ dictEnableZhToEn: !!(saved as any).dictEnableZhToEn });
    }
    if ((saved as any).documentsDir !== undefined) {
      const v = String((saved as any).documentsDir || '').trim();
      set({ documentsDir: v ? v : null });
    }
    if (saved.llmProvider) set({ llmProvider: saved.llmProvider });
    if (saved.ollamaUrl) set({ ollamaUrl: saved.ollamaUrl });
    if (saved.ollamaModel) set({ ollamaModel: saved.ollamaModel });
    if ((saved as any).builtinModelId && typeof (saved as any).builtinModelId === 'string') {
      set({ builtinModelId: normalizeLegacyBuiltinModelId((saved as any).builtinModelId) });
    }
    if ((saved as any).builtinAutoEnabled !== undefined) {
      set({ builtinAutoEnabled: !!(saved as any).builtinAutoEnabled });
    }
    if ((saved as any).builtinPreferredTier !== undefined) {
      const t = (saved as any).builtinPreferredTier;
      if (t === 0 || t === 1 || t === 2 || t === 3 || t === 'auto') {
        set({ builtinPreferredTier: t });
      }
    }
    if ((saved as any).builtinPreferredCompute !== undefined) {
      const m = (saved as any).builtinPreferredCompute;
      if (m === 'auto' || m === 'cpu' || m === 'gpu' || m === 'hybrid') {
        set({ builtinPreferredCompute: m });
      }
    }
    if ((saved as any).builtinComputeMode === 'gpu' || (saved as any).builtinComputeMode === 'hybrid' || (saved as any).builtinComputeMode === 'cpu') {
      set({ builtinComputeMode: (saved as any).builtinComputeMode });
    }
    if ((saved as any).builtinGpuBackend === 'cuda' || (saved as any).builtinGpuBackend === 'vulkan' || (saved as any).builtinGpuBackend === 'metal') {
      set({ builtinGpuBackend: (saved as any).builtinGpuBackend });
    }
    if ((saved as any).builtinGpuLayers !== undefined) {
      const v = Number.parseInt(String((saved as any).builtinGpuLayers), 10);
      if (Number.isFinite(v)) set({ builtinGpuLayers: Math.max(0, Math.min(200, v)) });
    }
    if ((saved as any).builtinCudaVersion === '12.4' || (saved as any).builtinCudaVersion === '13.1') {
      set({ builtinCudaVersion: (saved as any).builtinCudaVersion });
    }
    if (saved.openAICompatibleBaseUrl) set({ openAICompatibleBaseUrl: saved.openAICompatibleBaseUrl });
    if (saved.openAICompatibleApiKey !== undefined) set({ openAICompatibleApiKey: saved.openAICompatibleApiKey });
    if (saved.openAICompatibleModel) set({ openAICompatibleModel: saved.openAICompatibleModel });
    if (saved.enableThinking !== undefined) set({ enableThinking: saved.enableThinking });
    if ((saved as any).markdownScale !== undefined) set({ markdownScale: (saved as any).markdownScale });
    if (saved.prompts) set({ prompts: { ...DEFAULT_PROMPTS, ...saved.prompts } });
    if ((saved as any).builtinDownloadUrls && typeof (saved as any).builtinDownloadUrls === 'object') {
      set({ builtinDownloadUrls: (saved as any).builtinDownloadUrls });
    }
  },
  
  saveSettings: () => {
    const state = get();
    const toSave = {
      uiLanguage: state.uiLanguage,
      dictEnableEnToZh: state.dictEnableEnToZh,
      dictEnableZhToEn: state.dictEnableZhToEn,
      documentsDir: state.documentsDir,
      llmProvider: state.llmProvider,
      ollamaUrl: state.ollamaUrl,
      ollamaModel: state.ollamaModel,
      builtinModelId: state.builtinModelId,
      builtinAutoEnabled: state.builtinAutoEnabled,
      builtinPreferredTier: state.builtinPreferredTier,
      builtinPreferredCompute: state.builtinPreferredCompute,
      builtinComputeMode: state.builtinComputeMode,
      builtinGpuBackend: state.builtinGpuBackend,
      builtinGpuLayers: state.builtinGpuLayers,
      builtinCudaVersion: state.builtinCudaVersion,
      openAICompatibleBaseUrl: state.openAICompatibleBaseUrl,
      openAICompatibleApiKey: state.openAICompatibleApiKey,
      openAICompatibleModel: state.openAICompatibleModel,
      enableThinking: state.enableThinking,
      markdownScale: state.markdownScale,
      prompts: state.prompts,
      builtinDownloadUrls: state.builtinDownloadUrls,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  },
}));
