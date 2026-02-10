import { useState, useEffect } from "react";
import { X, ChevronDown, ChevronUp, RotateCcw, RefreshCw, CheckCircle, XCircle, Loader2, Trash2, Download, Copy, Upload, Settings, Globe, Sparkles, HardDrive, FolderOpen, Zap, Languages, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useSettingsStore, DEFAULT_PROMPTS, type PromptSettings } from "@/stores/settingsStore";
import { fetchOllamaModels, testOllamaConnection, formatModelSize, type OllamaModel } from "@/services/ollamaApi";
import { useDocumentCacheStore } from "@/stores/documentCacheStore";
import { useDocumentStore } from "@/stores/documentStore";
import { useI18n } from "@/i18n";
import { invoke, Channel } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getErrorMessage } from "@/lib/utils";
import { getRuntimeDownloads, BUILTIN_MODELS as BUILTIN_MODELS_CONFIG } from "@/config/downloads";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'general' | 'ai' | 'storage';
}

const PROMPT_LABELS_ZH: Record<keyof PromptSettings, string> = {
  translateLiteral: "直译 Prompt",
  translateFree: "意译 Prompt",
  translatePlain: "白话翻译 Prompt",
  translateLiteralZhToEn: "中译英 - 直译 Prompt",
  translateFreeZhToEn: "中译英 - 意译 Prompt",
  translatePlainZhToEn: "中译英 - 白话/解释 Prompt",
  explain: "文法解释 Prompt",
  explainZhToEn: "中文文法解释(英文输出) Prompt",
  chatContext: "对话上下文 Prompt",
};

const PROMPT_LABELS_EN: Record<keyof PromptSettings, string> = {
  translateLiteral: "Literal Translation Prompt",
  translateFree: "Free Translation Prompt",
  translatePlain: "Plain Translation Prompt",
  translateLiteralZhToEn: "ZH→EN Literal Prompt",
  translateFreeZhToEn: "ZH→EN Free Prompt",
  translatePlainZhToEn: "ZH→EN Plain/Explain Prompt",
  explain: "Grammar Explain Prompt",
  explainZhToEn: "ZH Grammar (EN output) Prompt",
  chatContext: "Chat Context Prompt",
};

export function SettingsModal({ isOpen, onClose, initialTab }: SettingsModalProps) {
  const { 
    uiLanguage,
    dictEnableEnToZh,
    dictEnableZhToEn,
    documentsDir,
    llmProvider,
    ollamaUrl, ollamaModel,
    builtinModelId,
    builtinComputeMode,
    builtinGpuBackend,
    builtinGpuLayers,
    builtinCudaVersion,
    openAICompatibleBaseUrl, openAICompatibleApiKey, openAICompatibleModel,
    prompts,
    setUiLanguage,
    setDictEnableEnToZh,
    setDictEnableZhToEn,
    setDocumentsDir,
    setOllamaUrl, setOllamaModel,
    setBuiltinModelId,
    setBuiltinComputeMode,
    setBuiltinGpuBackend,
    setBuiltinGpuLayers,
    setBuiltinCudaVersion,
    setOpenAICompatibleBaseUrl, setOpenAICompatibleApiKey, setOpenAICompatibleModel,
    setPrompt, saveSettings, loadSettings,
    builtinDownloadUrls, setBuiltinDownloadUrl, resetBuiltinDownloadUrl, resetAllBuiltinDownloadUrls
  } = useSettingsStore();
  
  const { getCacheStats, clearCache, setMaxCacheSize } = useDocumentCacheStore();
  const { b } = useI18n();
  
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showDownloadUrls, setShowDownloadUrls] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [cacheStats, setCacheStats] = useState({ count: 0, size: 0, maxSize: 200 * 1024 * 1024 });
  const [settingsTab, setSettingsTab] = useState<'general' | 'ai' | 'storage'>(initialTab || 'general');
  
  // Ollama 模型相关状态
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'connected' | 'error'>('unknown');

  type BuiltinStatus = { runtimeInstalled: boolean; modelInstalled: boolean; modelId?: string; running: boolean; baseUrl?: string | null; runningModelId?: string | null; runningThisModel?: boolean };
  type BuiltinProbe = { cpuCores: number; cpuBrand?: string; totalMemoryBytes: number; vramBytes?: number | null; gpuName?: string | null; hasCuda: boolean; hasVulkan: boolean; hasMetal: boolean; isAppleSilicon: boolean };
  type BuiltinRecommendResult = { recommendedModelId: string; recommendedComputeMode: string; recommendedGpuBackend: string; recommendedCudaVersion: string; probe: BuiltinProbe };
  type BenchmarkResult = { tokensPerSecond: number; completionTokens: number; elapsedMs: number; recommendedTier: number; recommendedModelId: string };
  type RuntimeStatus = { installed: boolean; runtimeDir: string; computeMode: string; gpuBackend: string; cudaVersion: string };
  const [builtinStatusById, setBuiltinStatusById] = useState<Record<string, BuiltinStatus | null>>({});
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);
  const [builtinLoadingById, setBuiltinLoadingById] = useState<Record<string, boolean>>({});
  const [builtinGlobalLoading, setBuiltinGlobalLoading] = useState(false);
  const [builtinError, setBuiltinError] = useState<string | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [lastFailedModelId, setLastFailedModelId] = useState<string | null>(null);
  const [appDataDir, setAppDataDir] = useState<string | null>(null);
  const [defaultDocumentsDir, setDefaultDocumentsDir] = useState<string | null>(null);
  const [modelsDir, setModelsDir] = useState<string | null>(null);
  const [builtinModels, setBuiltinModels] = useState<Array<{ modelId: string; fileName: string; size: number }>>([]);
  const [builtinRecommendLoading, setBuiltinRecommendLoading] = useState(false);
  const [builtinRecommend, setBuiltinRecommend] = useState<BuiltinRecommendResult | null>(null);
  const [builtinAdvancedMode, setBuiltinAdvancedMode] = useState(false);
  const [quickSetupStep, setQuickSetupStep] = useState<string | null>(null);
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ written: number; total: number | null; label: string; speed?: number | null } | null>(null);
  const [startedConfig, setStartedConfig] = useState<{ modelId: string; cm: string; gb: string; cv: string; gl: number } | null>(null);


  const RUNTIME_DOWNLOADS = getRuntimeDownloads();

  const getRuntimeUrlKeys = (computeMode: string, gpuBackend: string, cudaVersion: string) => {
    if (computeMode === 'cpu') return { rtKey: '__rt_cpu', cudartKey: null };
    if (gpuBackend === 'cuda') return { rtKey: `__rt_cuda_${cudaVersion}`, cudartKey: `__cudart_${cudaVersion}` };
    if (gpuBackend === 'metal') return { rtKey: '__rt_metal', cudartKey: null };
    return { rtKey: '__rt_vulkan', cudartKey: null };
  };

  const BUILTIN_MODELS: Array<{ id: string; title: string; subtitle: string; tier: number; ramHint: string; url: string }> =
    BUILTIN_MODELS_CONFIG.map(m => ({
      id: m.id,
      title: m.title,
      subtitle: b(m.subtitleZh, m.subtitleEn),
      tier: m.tier,
      ramHint: b(m.ramHintZh, m.ramHintEn),
      url: m.urls[0], // ModelScope as primary display URL
    }));

  const refreshBuiltinStatus = async () => {
    if (!isOpen) return;
    // Read fresh values from store to avoid stale closure issues
    const { builtinComputeMode: cm, builtinGpuBackend: gb, builtinCudaVersion: cv, builtinModelId: mid } = useSettingsStore.getState();
    try {
      const builtinIds = BUILTIN_MODELS.map(m => m.id);
      const idsToQuery = [...builtinIds];
      // Also query status for the current default model if it's a custom model
      if (mid && !builtinIds.includes(mid)) {
        idsToQuery.push(mid);
      }
      const entries = await Promise.all(
        idsToQuery.map(async (id) => {
          try {
            const s = await invoke<BuiltinStatus>("builtin_llm_status", { options: { modelId: id, computeMode: cm, gpuBackend: gb, cudaVersion: cv } });
            return [id, s] as const;
          } catch {
            return [id, null] as const;
          }
        })
      );
      setBuiltinStatusById(Object.fromEntries(entries) as Record<string, BuiltinStatus | null>);

      try {
        const list = await invoke<Array<{ modelId: string; fileName: string; size: number }>>("builtin_llm_list_models");
        setBuiltinModels(list || []);
      } catch {
        setBuiltinModels([]);
      }

      try {
        const rs = await invoke<RuntimeStatus>("builtin_llm_runtime_status", { options: { computeMode: cm, gpuBackend: gb, cudaVersion: cv } });
        setRuntimeStatus(rs);
      } catch {
        setRuntimeStatus(null);
      }
    } catch {
      setBuiltinStatusById({});
    }
  };

  const handleCopyModelLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      alert(b("复制失败，请手动复制链接", "Copy failed, please copy the link manually"));
    }
  };

  const handleBuiltinImportModel = async (modelId: string) => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "GGUF", extensions: ["gguf"] }],
      });
      if (!selected || typeof selected !== "string") return;
      setBuiltinError(null);
      setBuiltinLoadingById((prev) => ({ ...prev, [modelId]: true }));
      await invoke<any>("builtin_llm_import_model", { path: selected, options: { modelId } });
      await refreshBuiltinStatus();
    } catch (error) {
      console.error("builtin_llm_import_model failed:", error);
      const msg = getErrorMessage(error);
      setBuiltinError(msg);
      alert(b("模型导入失败：", "Model import failed: ") + msg);
    } finally {
      setBuiltinLoadingById((prev) => ({ ...prev, [modelId]: false }));
    }
  };

  const handleBuiltinImportCustomModel = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "GGUF", extensions: ["gguf"] }],
      });
      if (!selected || typeof selected !== "string") return;
      setBuiltinError(null);
      setBuiltinGlobalLoading(true);
      await invoke<any>("builtin_llm_import_model", { path: selected, options: { modelId: "" } });
      await refreshBuiltinStatus();
    } catch (error) {
      console.error("builtin_llm_import_model(custom) failed:", error);
      const msg = getErrorMessage(error);
      setBuiltinError(msg);
      alert(b("模型导入失败：", "Model import failed: ") + msg);
    } finally {
      setBuiltinGlobalLoading(false);
    }
  };

  // 更新缓存统计
  useEffect(() => {
    if (isOpen) {
      setCacheStats(getCacheStats());
    }
  }, [isOpen, getCacheStats]);
  
  const handleClearCache = async () => {
    const { confirm } = await import("@tauri-apps/plugin-dialog");
    const ok = await confirm(b("确定要清空所有文档缓存吗？", "Clear all document cache?"), {
      title: b("清空缓存", "Clear Cache"),
      kind: "warning",
      okLabel: b("清空", "Clear"),
      cancelLabel: b("取消", "Cancel"),
    });
    if (!ok) return;
    clearCache();
    setCacheStats(getCacheStats());
  };

  const handleResetAllData = async () => {
    const { confirm } = await import("@tauri-apps/plugin-dialog");
    const ok1 = await confirm(
      b(
        "确定要清空所有数据并重置应用吗？\n\n这将删除：\n- 已导入的文档副本\n- 词典数据\n- 内置模型文件\n- 所有笔记/文档进度\n- 本地设置与缓存\n\n应用将自动刷新。",
        "Reset all data?\n\nThis will delete:\n- Imported document copies\n- Dictionary data\n- Built-in model files\n- All notes/reading progress\n- Local settings and cache\n\nThe app will auto-refresh."
      ),
      {
        title: b("重置应用", "Reset App"),
        kind: "warning",
        okLabel: b("清空并重置", "Clear & Reset"),
        cancelLabel: b("取消", "Cancel"),
      }
    );
    if (!ok1) return;

    const ok2 = await confirm(
      b(
        "⚠️ 最后确认：此操作不可撤销！\n\n所有文档、模型、笔记和设置将被永久删除。确定继续？",
        "⚠️ Final confirmation: This action is irreversible!\n\nAll documents, models, notes and settings will be permanently deleted. Continue?"
      ),
      {
        title: b("不可撤销的操作", "Irreversible Action"),
        kind: "warning",
        okLabel: b("确认清空", "Confirm Reset"),
        cancelLabel: b("取消", "Cancel"),
      }
    );
    if (!ok2) return;

    try {
      setBuiltinError(null);
      setBuiltinGlobalLoading(true);

      await invoke("reset_app_data");

      try {
        clearCache();
      } catch {
        // ignore
      }

      try {
        const keysToRemove = [
          'aireader_settings',
          'llm_provider',
          'ollama_url',
          'ollama_model',
          'documents_dir',
          'builtin_model_id',
          'builtin_auto_enabled',
          'builtin_preferred_tier',
          'builtin_preferred_compute',
          'builtin_compute_mode',
          'builtin_gpu_backend',
          'builtin_gpu_layers',
          'builtin_cuda_version',
          'openai_compatible_base_url',
          'openai_compatible_api_key',
          'openai_compatible_model',
          'markdown_scale',
          'aireader-documents',
        ];
        for (const k of keysToRemove) {
          localStorage.removeItem(k);
        }
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.startsWith('epub_locations:')) {
            localStorage.removeItem(k);
          }
        }
      } catch {
        // ignore
      }

      window.location.reload();
    } catch (error) {
      console.error("reset_app_data failed:", error);
      const msg = getErrorMessage(error);
      setBuiltinError(msg);
      alert(b("重置失败：", "Reset failed: ") + msg);
    } finally {
      setBuiltinGlobalLoading(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  };

  // 仅在打开时加载一次设置
  useEffect(() => {
    if (isOpen && !initialized) {
      loadSettings();
      setInitialized(true);
      if (initialTab) setSettingsTab(initialTab);
    }
    if (!isOpen) {
      setInitialized(false);
      setConnectionStatus('unknown');
    }
  }, [isOpen, loadSettings, initialized, initialTab]);

  useEffect(() => {
    refreshBuiltinStatus();
  }, [isOpen, llmProvider, builtinModelId, builtinComputeMode, builtinGpuBackend, builtinCudaVersion]);

  const handleBuiltinRecommend = async () => {
    try {
      setBuiltinError(null);
      setBuiltinRecommendLoading(true);
      setBenchmarkResult(null);
      const r = await invoke<BuiltinRecommendResult>("builtin_llm_recommend", {
        options: {
          preferredTier: 'auto',
          preferredCompute: 'auto',
          cudaVersion: builtinCudaVersion,
        },
      });
      setBuiltinRecommend(r);

      // Try running llama-bench if runtime + 0.6B model are installed
      try {
        const bench = await invoke<BenchmarkResult>("builtin_llm_benchmark", {
          options: {
            computeMode: r.recommendedComputeMode,
            gpuBackend: r.recommendedGpuBackend,
            cudaVersion: r.recommendedCudaVersion,
            gpuLayers: builtinGpuLayers,
          },
        });
        setBenchmarkResult(bench);
      } catch (benchErr) {
        console.warn("Benchmark skipped (runtime/model not installed):", benchErr);
      }
    } catch (error) {
      console.error("builtin_llm_recommend failed:", error);
      const msg = getErrorMessage(error);
      setBuiltinError(msg);
      alert(b("自动适配失败：", "Auto-detect failed: ") + msg);
    } finally {
      setBuiltinRecommendLoading(false);
    }
  };

  const handleHardwareChange = async (applyChange: () => void) => {
    applyChange();
    saveSettings();
    setRuntimeError(null);
    setBuiltinError(null);
    // useEffect on [builtinComputeMode, builtinGpuBackend, builtinCudaVersion] will refresh status
  };

  const handleBuiltinApplyRecommend = async () => {
    if (!builtinRecommend) return;
    const anyRunning = Object.values(builtinStatusById).some(s => s?.running);
    if (anyRunning) {
      try { await invoke<any>("builtin_llm_stop", {}); } catch { /* ignore */ }
    }
    // Prefer benchmark-based model if available, otherwise use hardware-only recommendation
    const modelId = benchmarkResult ? benchmarkResult.recommendedModelId : builtinRecommend.recommendedModelId;
    setBuiltinModelId(modelId);
    setBuiltinComputeMode(builtinRecommend.recommendedComputeMode as any);
    setBuiltinGpuBackend(builtinRecommend.recommendedGpuBackend as any);
    setBuiltinCudaVersion(builtinRecommend.recommendedCudaVersion as any);
    saveSettings();
    await refreshBuiltinStatus();
  };

  const handleQuickSetup = async () => {
    try {
      setBuiltinError(null);
      setBuiltinGlobalLoading(true);
      setBenchmarkResult(null);

      // Step 1: Detect hardware → determine compute mode
      setQuickSetupStep(b('正在探测硬件...', 'Detecting hardware...'));
      const r = await invoke<BuiltinRecommendResult>("builtin_llm_recommend", {
        options: {
          preferredTier: 'auto',
          preferredCompute: 'auto',
          cudaVersion: builtinCudaVersion,
        },
      });
      setBuiltinRecommend(r);

      // Apply compute mode settings (model will be determined by benchmark)
      setBuiltinComputeMode(r.recommendedComputeMode as any);
      setBuiltinGpuBackend(r.recommendedGpuBackend as any);
      setBuiltinCudaVersion(r.recommendedCudaVersion as any);

      const benchModelId = 'qwen3_0_6b_q4_k_m';

      // Step 2: Install runtime + 0.6B benchmark model
      setQuickSetupStep(b('正在安装基准测试模型...', 'Installing benchmark model...'));
      await invoke<any>("builtin_llm_install", {
        options: {
          modelId: benchModelId,
          mode: "auto",
          computeMode: r.recommendedComputeMode,
          gpuBackend: r.recommendedGpuBackend,
          cudaVersion: r.recommendedCudaVersion,
          modelUrl: builtinDownloadUrls[benchModelId] || undefined,
          runtimeUrl: builtinDownloadUrls[getRuntimeUrlKeys(r.recommendedComputeMode, r.recommendedGpuBackend, r.recommendedCudaVersion).rtKey] || undefined,
          cudartUrl: builtinDownloadUrls[getRuntimeUrlKeys(r.recommendedComputeMode, r.recommendedGpuBackend, r.recommendedCudaVersion).cudartKey ?? ''] || undefined,
        },
        onProgress: createProgressChannel(),
      });

      // Step 3: Run llama-bench directly (no server needed)
      setQuickSetupStep(b('正在测试推理性能 (llama-bench)...', 'Benchmarking inference speed (llama-bench)...'));
      const bench = await invoke<BenchmarkResult>("builtin_llm_benchmark", {
        options: {
          computeMode: r.recommendedComputeMode,
          gpuBackend: r.recommendedGpuBackend,
          cudaVersion: r.recommendedCudaVersion,
          gpuLayers: builtinGpuLayers,
        },
      });
      setBenchmarkResult(bench);

      const finalModelId = bench.recommendedModelId;

      // Step 4: If benchmark recommends a larger model, install it
      if (finalModelId !== benchModelId) {
        setQuickSetupStep(b(`性能测试完成 (${bench.tokensPerSecond.toFixed(1)} tok/s)，正在安装推荐模型...`, `Benchmark done (${bench.tokensPerSecond.toFixed(1)} tok/s), installing recommended model...`));
        await invoke<any>("builtin_llm_install", {
          options: {
            modelId: finalModelId,
            mode: "auto",
            computeMode: r.recommendedComputeMode,
            gpuBackend: r.recommendedGpuBackend,
            cudaVersion: r.recommendedCudaVersion,
            modelUrl: builtinDownloadUrls[finalModelId] || undefined,
            runtimeUrl: builtinDownloadUrls[getRuntimeUrlKeys(r.recommendedComputeMode, r.recommendedGpuBackend, r.recommendedCudaVersion).rtKey] || undefined,
            cudartUrl: builtinDownloadUrls[getRuntimeUrlKeys(r.recommendedComputeMode, r.recommendedGpuBackend, r.recommendedCudaVersion).cudartKey ?? ''] || undefined,
          },
          onProgress: createProgressChannel(),
        });
      }

      // Step 5: Start service with final model
      setQuickSetupStep(b('正在启动 AI 服务...', 'Starting AI service...'));
      await invoke<any>("builtin_llm_ensure_running", {
        options: {
          modelId: finalModelId,
          mode: "auto",
          computeMode: r.recommendedComputeMode,
          gpuBackend: r.recommendedGpuBackend,
          gpuLayers: builtinGpuLayers,
          cudaVersion: r.recommendedCudaVersion,
          runtimeUrl: builtinDownloadUrls[getRuntimeUrlKeys(r.recommendedComputeMode, r.recommendedGpuBackend, r.recommendedCudaVersion).rtKey] || undefined,
          cudartUrl: builtinDownloadUrls[getRuntimeUrlKeys(r.recommendedComputeMode, r.recommendedGpuBackend, r.recommendedCudaVersion).cudartKey ?? ''] || undefined,
        },
        onProgress: createProgressChannel(),
      });

      // Apply final model selection & mark AI as configured for auto-start
      setBuiltinModelId(finalModelId);
      useSettingsStore.getState().setBuiltinAutoEnabled(true);
      saveSettings();
      await refreshBuiltinStatus();
      setQuickSetupStep(null);
    } catch (error) {
      console.error("Quick setup failed:", error);
      const msg = getErrorMessage(error);
      if (!/cancelled/i.test(msg)) setBuiltinError(msg);
      setQuickSetupStep(null);
    } finally {
      setBuiltinGlobalLoading(false);
    }
  };

  const handleModelDowngrade = async () => {
    const TIER_ORDER = ['qwen3_32b_q4_k_m', 'qwen3_14b_q4_k_m', 'qwen3_8b_q4_k_m', 'qwen3_4b_q4_k_m', 'qwen3_1_7b_q4_k_m', 'qwen3_0_6b_q4_k_m'];
    const currentIdx = TIER_ORDER.indexOf(builtinModelId);
    const nextIdx = currentIdx >= 0 ? currentIdx + 1 : TIER_ORDER.length - 1;
    if (nextIdx >= TIER_ORDER.length) return; // already smallest
    const nextModelId = TIER_ORDER[nextIdx];
    try {
      setBuiltinError(null);
      setBuiltinGlobalLoading(true);
      setQuickSetupStep(b('正在降级模型...', 'Downgrading model...'));
      // Stop current
      try { await invoke<any>("builtin_llm_stop"); } catch { /* ignore */ }
      // Install smaller model
      await invoke<any>("builtin_llm_install", {
        options: {
          modelId: nextModelId,
          mode: "auto",
          computeMode: builtinComputeMode,
          gpuBackend: builtinGpuBackend,
          cudaVersion: builtinCudaVersion,
          modelUrl: builtinDownloadUrls[nextModelId] || undefined,
          runtimeUrl: builtinDownloadUrls[getRuntimeUrlKeys(builtinComputeMode, builtinGpuBackend, builtinCudaVersion).rtKey] || undefined,
          cudartUrl: builtinDownloadUrls[getRuntimeUrlKeys(builtinComputeMode, builtinGpuBackend, builtinCudaVersion).cudartKey ?? ''] || undefined,
        },
        onProgress: createProgressChannel(),
      });
      // Start smaller model
      setQuickSetupStep(b('正在启动 AI 服务...', 'Starting AI service...'));
      await invoke<any>("builtin_llm_ensure_running", {
        options: {
          modelId: nextModelId,
          mode: "auto",
          computeMode: builtinComputeMode,
          gpuBackend: builtinGpuBackend,
          gpuLayers: builtinGpuLayers,
          cudaVersion: builtinCudaVersion,
          runtimeUrl: builtinDownloadUrls[getRuntimeUrlKeys(builtinComputeMode, builtinGpuBackend, builtinCudaVersion).rtKey] || undefined,
          cudartUrl: builtinDownloadUrls[getRuntimeUrlKeys(builtinComputeMode, builtinGpuBackend, builtinCudaVersion).cudartKey ?? ''] || undefined,
        },
        onProgress: createProgressChannel(),
      });
      setBuiltinModelId(nextModelId);
      saveSettings();
      await refreshBuiltinStatus();
    } catch (error) {
      const msg = getErrorMessage(error);
      if (!/cancelled/i.test(msg)) setBuiltinError(msg);
    } finally {
      setQuickSetupStep(null);
      setBuiltinGlobalLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        const dir = await invoke<string>('get_app_data_dir');
        setAppDataDir(dir);
      } catch {
        setAppDataDir(null);
      }

      try {
        const dir = await invoke<string>('get_documents_dir');
        setDefaultDocumentsDir(dir);
      } catch {
        setDefaultDocumentsDir(null);
      }

      try {
        const cfg = await invoke<{ modelsDir: string }>('get_app_config');
        setModelsDir(cfg.modelsDir);
      } catch {
        setModelsDir(null);
      }
    })();
  }, [isOpen]);

  // Primary: listen for app.emit events
  useEffect(() => {
    if (!isOpen) return;
    let unlisten: (() => void) | null = null;
    listen<{ written: number; total: number | null; label: string; speed?: number | null }>(
      'builtin-llm-download-progress',
      (event) => { setDownloadProgress(event.payload); }
    ).then((fn) => { unlisten = fn; });
    return () => {
      if (unlisten) unlisten();
      setDownloadProgress(null);
    };
  }, [isOpen]);

  // Secondary: Channel callback (passed to invoke)
  const createProgressChannel = () => {
    const ch = new Channel<{ written: number; total: number | null; label: string; speed?: number | null }>();
    ch.onmessage = (msg) => { setDownloadProgress(msg); };
    return ch;
  };

  const handleChooseDocumentsDir = async () => {
    const { open, ask, message } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, multiple: false } as any);
    const dir = typeof selected === "string" ? selected : null;
    if (!dir) return;

    const oldDir = documentsDir || defaultDocumentsDir;

    // Same directory — nothing to do
    if (oldDir && dir.replace(/[\\/]+$/, '') === oldDir.replace(/[\\/]+$/, '')) return;

    // T6: Offer to migrate existing documents to new location
    if (oldDir) {
      const shouldMigrate = await ask(
        b(
          '是否将旧文档库中的文件迁移到新位置？\n（原文件不会被删除）',
          'Migrate existing documents to the new location?\n(Original files will not be deleted)'
        ),
        {
          title: b('迁移文档', 'Migrate Documents'),
          kind: 'info',
          okLabel: b('迁移', 'Migrate'),
          cancelLabel: b('跳过', 'Skip'),
        }
      );
      if (shouldMigrate) {
        try {
          const count = await invoke<number>("migrate_documents", { fromDir: oldDir, toDir: dir });

          // P1: Update doc paths for copy documents
          const normalize = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');
          const oldNorm = normalize(oldDir);
          const newNorm = normalize(dir);
          const { documents, setDocuments } = useDocumentStore.getState();
          const updated = documents.map(doc => {
            if (doc.isCopy === true && normalize(doc.path).startsWith(oldNorm)) {
              return { ...doc, path: newNorm + normalize(doc.path).slice(oldNorm.length) };
            }
            return doc;
          });
          setDocuments(updated);

          await message(
            b(`已迁移 ${count} 个文件到新位置，文档路径已更新。`, `Migrated ${count} file(s). Document paths updated.`),
            { title: b('迁移完成', 'Migration Complete'), kind: 'info' }
          );
        } catch (e) {
          console.error('[Settings] Migration failed:', e);
          await message(
            b('迁移失败：', 'Migration failed: ') + String(e),
            { title: b('迁移失败', 'Migration Failed'), kind: 'error' }
          );
        }
      }
    }

    // Update documents dir setting
    setDocumentsDir(dir);
    saveSettings();
  };

  const handleChooseModelsDir = async () => {
    const { open, ask, message } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, multiple: false } as any);
    const dir = typeof selected === "string" ? selected : null;
    if (!dir) return;

    const oldDir = modelsDir;
    if (oldDir && dir.replace(/[\\/]+$/, '') === oldDir.replace(/[\\/]+$/, '')) return;

    let migrateModels = false;
    if (oldDir) {
      migrateModels = await ask(
        b(
          '是否将旧目录中的模型文件迁移到新位置？\n（原文件将被移动）',
          'Migrate model files to the new location?\n(Original files will be moved)'
        ),
        {
          title: b('迁移模型', 'Migrate Models'),
          kind: 'info',
          okLabel: b('迁移', 'Migrate'),
          cancelLabel: b('跳过', 'Skip'),
        }
      );
    }

    try {
      await invoke("save_app_config", { config: { modelsDir: dir, migrateModels } });
      setModelsDir(dir);
      await message(
        b(
          '模型目录已更新。' + (builtinStatus?.running ? '\n服务已自动停止，请在 AI 面板中重新启动。' : ''),
          'Model directory updated.' + (builtinStatus?.running ? '\nService was stopped. Please restart from AI panel.' : '')
        ),
        { title: b('模型目录', 'Model Directory'), kind: 'info' }
      );
      await refreshBuiltinStatus();
    } catch (e) {
      await message(
        b('修改模型目录失败：', 'Failed to change model directory: ') + String(e),
        { title: b('错误', 'Error'), kind: 'error' }
      );
    }
  };

  const handleOpenModelsDir = async () => {
    if (!modelsDir) return;
    try {
      await invoke("open_in_file_manager", { path: modelsDir });
    } catch {}
  };

  const handleOpenDocumentsDir = async () => {
    const p = documentsDir || defaultDocumentsDir;
    if (!p) return;
    try {
      await invoke("open_in_file_manager", { path: p });
    } catch {
    }
  };

  const builtinStatus = builtinStatusById[builtinModelId] ?? null;

  const handleBuiltinInstall = async (modelId: string) => {
    try {
      setBuiltinError(null);
      setBuiltinLoadingById((prev) => ({ ...prev, [modelId]: true }));
      const { rtKey, cudartKey } = getRuntimeUrlKeys(builtinComputeMode, builtinGpuBackend, builtinCudaVersion);
      await invoke<any>("builtin_llm_install", { options: { modelId, mode: "auto", computeMode: builtinComputeMode, gpuBackend: builtinGpuBackend, cudaVersion: builtinCudaVersion, modelUrl: builtinDownloadUrls[modelId] || undefined, runtimeUrl: builtinDownloadUrls[rtKey] || undefined, cudartUrl: builtinDownloadUrls[cudartKey ?? ''] || undefined }, onProgress: createProgressChannel() });
      await refreshBuiltinStatus();
    } catch (error) {
      console.error("builtin_llm_install failed:", error);
      const msg = getErrorMessage(error);
      if (!/cancelled/i.test(msg)) {
        setBuiltinError(msg);
        setLastFailedModelId(modelId);
      }
    } finally {
      setBuiltinLoadingById((prev) => ({ ...prev, [modelId]: false }));
    }
  };

  const handleBuiltinDeleteModel = async (modelId: string) => {
    const { confirm } = await import("@tauri-apps/plugin-dialog");
    const confirmed = await confirm(
      b(`确定要删除模型 "${modelId}" 吗？此操作不可撤销。`, `Are you sure you want to delete model "${modelId}"? This cannot be undone.`),
      { title: b('删除模型', 'Delete Model'), kind: 'warning', okLabel: b('删除', 'Delete'), cancelLabel: b('取消', 'Cancel') }
    );
    if (!confirmed) return;
    try {
      setBuiltinError(null);
      setBuiltinLoadingById((prev) => ({ ...prev, [modelId]: true }));
      await invoke<void>("builtin_llm_delete_model", { options: { modelId } });
      await refreshBuiltinStatus();
    } catch (error) {
      console.error("builtin_llm_delete_model failed:", error);
      const msg = getErrorMessage(error);
      setBuiltinError(msg);
      alert(b("删除失败：", "Delete failed: ") + msg);
    } finally {
      setBuiltinLoadingById((prev) => ({ ...prev, [modelId]: false }));
    }
  };

  const [runtimeInstalling, setRuntimeInstalling] = useState(false);
  const handleBuiltinInstallRuntime = async () => {
    try {
      setRuntimeError(null);
      setRuntimeInstalling(true);
      setDownloadProgress(null);
      const { rtKey: irKey, cudartKey: icKey } = getRuntimeUrlKeys(builtinComputeMode, builtinGpuBackend, builtinCudaVersion);
      await invoke<void>("builtin_llm_install_runtime", { options: { computeMode: builtinComputeMode, gpuBackend: builtinGpuBackend, cudaVersion: builtinCudaVersion, runtimeUrl: builtinDownloadUrls[irKey] || undefined, cudartUrl: builtinDownloadUrls[icKey ?? ''] || undefined }, onProgress: createProgressChannel() });
      await refreshBuiltinStatus();
    } catch (error) {
      console.error("builtin_llm_install_runtime failed:", error);
      const msg = getErrorMessage(error);
      if (!/cancelled/i.test(msg)) setRuntimeError(msg);
    } finally {
      setRuntimeInstalling(false);
    }
  };

  const handleBuiltinDeleteRuntime = async () => {
    const { confirm } = await import("@tauri-apps/plugin-dialog");
    const confirmed = await confirm(
      b(`确定要删除当前运行时 (${builtinComputeMode}/${builtinGpuBackend}) 吗？`, `Delete runtime (${builtinComputeMode}/${builtinGpuBackend})?`),
      { title: b('删除运行时', 'Delete Runtime'), kind: 'warning', okLabel: b('删除', 'Delete'), cancelLabel: b('取消', 'Cancel') }
    );
    if (!confirmed) return;
    try {
      setRuntimeError(null);
      setRuntimeInstalling(true);
      await invoke<void>("builtin_llm_delete_runtime", { options: { computeMode: builtinComputeMode, gpuBackend: builtinGpuBackend, cudaVersion: builtinCudaVersion } });
      await refreshBuiltinStatus();
    } catch (error) {
      console.error("builtin_llm_delete_runtime failed:", error);
      const msg = getErrorMessage(error);
      setRuntimeError(msg);
    } finally {
      setRuntimeInstalling(false);
    }
  };

  const handleBuiltinImportRuntime = async (dialogTitle?: string) => {
    try {
      const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
      const selected = await openDialog({
        title: dialogTitle || b('选择运行时 zip 文件', 'Select runtime zip file'),
        filters: [{ name: 'ZIP', extensions: ['zip'] }],
        multiple: false,
      });
      if (!selected) return;

      const p = typeof selected === 'string' ? selected : (selected as any).path;
      if (!p) return;

      setRuntimeError(null);
      setRuntimeInstalling(true);
      await invoke<void>("builtin_llm_import_runtime", { paths: [p], options: { computeMode: builtinComputeMode, gpuBackend: builtinGpuBackend, cudaVersion: builtinCudaVersion } });
      await refreshBuiltinStatus();
    } catch (error) {
      console.error("import runtime failed:", error);
      const msg = getErrorMessage(error);
      setRuntimeError(msg);
    } finally {
      setRuntimeInstalling(false);
    }
  };

  const handleSetDefaultModel = (modelId: string) => {
    setBuiltinModelId(modelId);
    saveSettings();
    // useEffect will refresh status; user can manually restart via ③ Service Control
  };

  const handleBuiltinRun = async () => {
    // C6: Config mismatch warning
    const model = BUILTIN_MODELS.find(m => m.id === builtinModelId);
    if (model && model.tier >= 2 && builtinComputeMode === 'cpu') {
      const { confirm } = await import("@tauri-apps/plugin-dialog");
      const ok = await confirm(
        b(
          `当前选择了 ${model.title} (T${model.tier})，但算力模式为 CPU。大模型在纯 CPU 模式下推理会非常缓慢，建议使用 GPU 或混合模式。是否仍要继续启动？`,
          `You selected ${model.title} (T${model.tier}) with CPU-only mode. Large models will be very slow on CPU. Consider GPU or hybrid mode. Continue anyway?`
        ),
        { title: b('性能警告', 'Performance Warning'), kind: 'warning', okLabel: b('继续启动', 'Start Anyway'), cancelLabel: b('取消', 'Cancel') }
      );
      if (!ok) return;
    }
    try {
      setBuiltinError(null);
      setBuiltinGlobalLoading(true);
      const { rtKey: erKey, cudartKey: ecKey } = getRuntimeUrlKeys(builtinComputeMode, builtinGpuBackend, builtinCudaVersion);
      await invoke<any>("builtin_llm_ensure_running", { options: { modelId: builtinModelId, mode: "auto", computeMode: builtinComputeMode, gpuBackend: builtinGpuBackend, gpuLayers: builtinGpuLayers, cudaVersion: builtinCudaVersion, runtimeUrl: builtinDownloadUrls[erKey] || undefined, cudartUrl: builtinDownloadUrls[ecKey ?? ''] || undefined }, onProgress: createProgressChannel() });
      setStartedConfig({ modelId: builtinModelId, cm: builtinComputeMode, gb: builtinGpuBackend, cv: builtinCudaVersion, gl: builtinGpuLayers });
      // Enable auto-start on next launch
      useSettingsStore.getState().setBuiltinAutoEnabled(true);
      saveSettings();
      await refreshBuiltinStatus();
    } catch (error) {
      console.error("builtin_llm_ensure_running failed:", error);
      const msg = getErrorMessage(error);
      if (!/cancelled/i.test(msg)) setBuiltinError(msg);
    } finally {
      setBuiltinGlobalLoading(false);
    }
  };

  const handleBuiltinStop = async () => {
    try {
      setBuiltinError(null);
      setBuiltinGlobalLoading(true);
      await invoke<any>("builtin_llm_stop", { options: { modelId: builtinModelId } });
      setStartedConfig(null);
      await refreshBuiltinStatus();
    } catch (error) {
      console.error("builtin_llm_stop failed:", error);
      const msg = getErrorMessage(error);
      setBuiltinError(msg);
    } finally {
      setBuiltinGlobalLoading(false);
    }
  };



  // 获取模型列表
  const handleRefreshModels = async () => {
    setLoadingModels(true);
    setConnectionStatus('unknown');
    
    const connected = await testOllamaConnection(ollamaUrl);
    if (connected) {
      setConnectionStatus('connected');
      const modelList = await fetchOllamaModels(ollamaUrl);
      setModels(modelList);
    } else {
      setConnectionStatus('error');
      setModels([]);
    }
    
    setLoadingModels(false);
  };

  // 打开设置时自动获取模型列表
  useEffect(() => {
    if (isOpen && initialized && connectionStatus === 'unknown') {
      handleRefreshModels();
    }
  }, [isOpen, initialized, ollamaUrl]);

  const handleResetPrompt = (key: keyof PromptSettings) => {
    setPrompt(key, DEFAULT_PROMPTS[key]);
    saveSettings();
  };

  const handleResetAllPrompts = async () => {
    const { confirm } = await import("@tauri-apps/plugin-dialog");
    const ok = await confirm(b("确定要重置所有 Prompt 到默认值吗？", "Reset all prompts to defaults?"), {
      title: b("重置 Prompts", "Reset Prompts"),
      kind: "warning",
      okLabel: b("重置", "Reset"),
      cancelLabel: b("取消", "Cancel"),
    });
    if (!ok) return;
    Object.keys(DEFAULT_PROMPTS).forEach(k => setPrompt(k as keyof PromptSettings, DEFAULT_PROMPTS[k as keyof PromptSettings]));
    saveSettings();
  };

  if (!isOpen) return null;

  const settingsTabs = [
    { id: 'general' as const, label: b('通用', 'General'), icon: Globe },
    { id: 'ai' as const, label: b('AI', 'AI'), icon: Sparkles },
    { id: 'storage' as const, label: b('存储', 'Storage'), icon: HardDrive },
  ];

  const ToggleSwitch = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-all duration-200 cursor-pointer ${checked ? 'bg-primary shadow-[0_0_8px_rgba(var(--primary-rgb,59,130,246),0.3)]' : 'bg-muted-foreground/25 hover:bg-muted-foreground/35'}`}
    >
      <span className={`inline-block h-4.5 w-4.5 rounded-full bg-white shadow-md transition-all duration-200 ${checked ? 'translate-x-[22px] scale-100' : 'translate-x-[3px] scale-95'}`} style={{ width: 18, height: 18 }} />
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-card rounded-2xl shadow-2xl w-[640px] max-w-[90vw] max-h-[90vh] flex flex-col border border-border/50">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center">
              <Settings className="w-3.5 h-3.5 text-primary" />
            </div>
            <h2 className="font-semibold text-sm">{b('设置', 'Settings')}</h2>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Tab navigation */}
        <div className="flex px-4 pt-1 border-b border-border/60">
          {settingsTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSettingsTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm transition-all relative ${
                settingsTab === tab.id
                  ? 'text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {settingsTab === tab.id && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-5 py-4 space-y-5">

          {/* ===== General Tab ===== */}
          {settingsTab === 'general' && (
            <>
              {/* Language */}
              <div className="rounded-xl border border-border/60 p-4">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <Globe className="w-3.5 h-3.5 text-blue-500" />
                  </div>
                  <label className="text-sm font-medium">{b('界面语言', 'UI Language')}</label>
                </div>
                <div className="flex rounded-lg border border-border p-0.5 bg-muted/30 w-fit">
                  <button
                    type="button"
                    onClick={() => { setUiLanguage('zh'); saveSettings(); }}
                    className={`px-5 py-1.5 text-sm rounded-md transition-all ${uiLanguage === 'zh' ? 'bg-background shadow-sm font-medium text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    中文
                  </button>
                  <button
                    type="button"
                    onClick={() => { setUiLanguage('en'); saveSettings(); }}
                    className={`px-5 py-1.5 text-sm rounded-md transition-all ${uiLanguage === 'en' ? 'bg-background shadow-sm font-medium text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    English
                  </button>
                </div>
              </div>

              {/* Dictionary */}
              <div className="rounded-xl border border-border/60 overflow-hidden">
                <div className="flex items-center gap-2.5 px-4 pt-4 pb-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <Languages className="w-3.5 h-3.5 text-emerald-500" />
                  </div>
                  <label className="text-sm font-medium">{b('词典功能', 'Dictionary')}</label>
                </div>
                <div className="divide-y divide-border/40">
                  <div className="flex items-center justify-between px-4 py-3.5 hover:bg-muted/20 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-1.5 h-8 rounded-full transition-colors ${dictEnableEnToZh ? 'bg-emerald-500' : 'bg-muted-foreground/20'}`} />
                      <div>
                        <div className="text-sm font-medium">{b('英 → 中', 'EN → ZH')}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{b('双击英文单词弹出词典', 'Double-click English word for dictionary')}</div>
                      </div>
                    </div>
                    <ToggleSwitch checked={dictEnableEnToZh} onChange={(v) => { setDictEnableEnToZh(v); saveSettings(); }} />
                  </div>
                  <div className="flex items-center justify-between px-4 py-3.5 hover:bg-muted/20 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-1.5 h-8 rounded-full transition-colors ${dictEnableZhToEn ? 'bg-emerald-500' : 'bg-muted-foreground/20'}`} />
                      <div>
                        <div className="text-sm font-medium">{b('中 → 英', 'ZH → EN')}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{b('双击中文词语弹出词典', 'Double-click Chinese word for dictionary')}</div>
                      </div>
                    </div>
                    <ToggleSwitch checked={dictEnableZhToEn} onChange={(v) => { setDictEnableZhToEn(v); saveSettings(); }} />
                  </div>
                </div>
              </div>

              {/* Library Folder */}
              <div className="rounded-xl border border-border/60 p-4 space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <FolderOpen className="w-3.5 h-3.5 text-amber-500" />
                  </div>
                  <label className="text-sm font-medium">{b('文档库位置', 'Library Folder')}</label>
                </div>
                <div className="rounded-lg bg-muted/30 px-3 py-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono break-all">{documentsDir || defaultDocumentsDir || b('默认位置', 'Default')}</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{b('导入副本将保存到这个文件夹', 'Imported copies will be saved here')}</p>
                {defaultDocumentsDir && documentsDir && documentsDir !== defaultDocumentsDir && (
                  <p className="text-[10px] text-muted-foreground/60">{b('默认路径', 'Default')}: <span className="font-mono">{defaultDocumentsDir}</span></p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="rounded-lg text-xs h-7" onClick={handleChooseDocumentsDir}>
                    {b('选择文件夹', 'Choose Folder')}
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-lg text-xs h-7" onClick={handleOpenDocumentsDir}>
                    {b('打开文件夹', 'Open Folder')}
                  </Button>
                </div>
              </div>

              {/* Model Storage Directory */}
              <div className="rounded-xl border border-border/60 p-4 space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                  </div>
                  <label className="text-sm font-medium">{b('模型存储目录', 'Model Storage')}</label>
                </div>
                <div className="rounded-lg bg-muted/30 px-3 py-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono break-all">{modelsDir || b('默认位置', 'Default')}</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{b('AI 模型文件（GGUF）存放位置，修改后服务将自动停止', 'AI model files (GGUF) location. Service stops on change.')}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="rounded-lg text-xs h-7" onClick={handleChooseModelsDir}>
                    {b('选择文件夹', 'Choose Folder')}
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-lg text-xs h-7" onClick={handleOpenModelsDir}>
                    {b('打开文件夹', 'Open Folder')}
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* ===== AI Tab ===== */}
          {settingsTab === 'ai' && (
            <>
              <p className="text-xs text-muted-foreground">
                {b('在 AI 助手面板的模型列表中切换使用的模型和服务。下方可分别配置各服务。',
                   'Switch models via the AI panel dropdown. Configure each provider below.')}
              </p>

              {/* Built-in Local — Simple / Advanced mode */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{b('内置本地 AI', 'Built-in Local AI')}</span>
                  {llmProvider === 'builtin_local' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-600 font-medium">{b('使用中', 'Active')}</span>}
                </div>
                  {/* Status card — always visible */}
                  <div className="rounded-xl border border-border/60 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-2.5 h-2.5 rounded-full ${builtinStatus?.running && builtinStatus?.runningThisModel ? 'bg-green-500' : builtinStatus?.modelInstalled ? 'bg-yellow-500' : 'bg-muted-foreground/40'}`} />
                        <div>
                          <div className="text-sm font-medium">
                            {builtinStatus?.running && builtinStatus?.runningThisModel
                              ? b('AI 已就绪', 'AI Ready')
                              : builtinStatus?.modelInstalled
                                ? b('模型已安装，未运行', 'Model installed, not running')
                                : b('未配置', 'Not set up')}
                          </div>
                          {builtinStatus?.runningModelId && (
                            <div className="text-[11px] text-muted-foreground">{builtinStatus.runningModelId}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {(() => {
                          const isRunning = builtinStatus?.running;
                          const statusConfigChanged = isRunning && (
                            !builtinStatus?.runningThisModel ||
                            (startedConfig && (startedConfig.cm !== builtinComputeMode || startedConfig.gb !== builtinGpuBackend || startedConfig.cv !== builtinCudaVersion || startedConfig.gl !== builtinGpuLayers))
                          );
                          if (statusConfigChanged) return (
                            <>
                              <Button size="sm" className="rounded-lg text-xs h-7 bg-amber-600 hover:bg-amber-700" onClick={handleBuiltinRun} disabled={builtinGlobalLoading}>
                                {builtinGlobalLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                                {b('应用并重启', 'Apply & Restart')}
                              </Button>
                              <Button size="sm" variant="outline" className="rounded-lg text-xs h-7" onClick={handleBuiltinStop} disabled={builtinGlobalLoading}>
                                {b('停止', 'Stop')}
                              </Button>
                            </>
                          );
                          if (isRunning && builtinStatus?.runningThisModel) return (
                            <Button size="sm" variant="outline" className="rounded-lg text-xs h-7" onClick={handleBuiltinStop} disabled={builtinGlobalLoading}>
                              {b('停止', 'Stop')}
                            </Button>
                          );
                          if (builtinStatus?.modelInstalled) return (
                            <Button size="sm" className="rounded-lg text-xs h-7" onClick={handleBuiltinRun} disabled={builtinGlobalLoading || !builtinStatus?.runtimeInstalled}>
                              {builtinGlobalLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                              {b('启动', 'Start')}
                            </Button>
                          );
                          return null;
                        })()}
                      </div>
                    </div>

                    {builtinError && (
                      <div className="text-xs text-destructive bg-destructive/10 rounded-lg p-2 flex items-center justify-between gap-2">
                        <span className="break-all">{builtinError}</span>
                        {lastFailedModelId && !builtinGlobalLoading && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-lg text-xs h-6 px-2 flex-shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10"
                            onClick={() => { setBuiltinError(null); setLastFailedModelId(null); handleBuiltinInstall(lastFailedModelId); }}
                          >
                            <RotateCcw className="w-3 h-3 mr-1" />{b('重试', 'Retry')}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Simple mode: one-click setup */}
                  {!builtinAdvancedMode && (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Zap className="w-4 h-4 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium">{b('一键配置', 'Quick Setup')}</div>
                            <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                              {b(
                                '自动探测硬件、下载最适合的模型、启动 AI 服务。全程自动，无需手动操作。',
                                'Automatically detect hardware, download the best model for your system, and start the AI service.'
                              )}
                            </div>
                          </div>
                        </div>
                        <Button
                          className="w-full rounded-lg h-9"
                          onClick={handleQuickSetup}
                          disabled={builtinGlobalLoading || (builtinStatus?.running && builtinStatus?.runningThisModel)}
                        >
                          {builtinGlobalLoading ? (
                            <span className="flex items-center gap-2">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              {quickSetupStep || b('配置中...', 'Setting up...')}
                            </span>
                          ) : builtinStatus?.running && builtinStatus?.runningThisModel ? (
                            <span className="flex items-center gap-2">
                              <CheckCircle className="w-4 h-4" />
                              {b('已就绪', 'Ready')}
                            </span>
                          ) : (
                            <span className="flex items-center gap-2">
                              <Zap className="w-4 h-4" />
                              {b('一键配置并启动', 'One-Click Setup')}
                            </span>
                          )}
                        </Button>
                        {builtinGlobalLoading && (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                              <span>{downloadProgress ? downloadProgress.label : b('准备中...', 'Preparing...')}</span>
                              <div className="flex items-center gap-2">
                                {downloadProgress && (
                                  <span>
                                    {(downloadProgress.written / 1024 / 1024).toFixed(1)} MB
                                    {downloadProgress.total ? ` / ${(downloadProgress.total / 1024 / 1024).toFixed(1)} MB` : ''}
                                    {downloadProgress.speed ? ` · ${downloadProgress.speed >= 1048576 ? (downloadProgress.speed / 1048576).toFixed(1) + ' MB/s' : (downloadProgress.speed / 1024).toFixed(0) + ' KB/s'}` : ''}
                                  </span>
                                )}
                                <button className="text-[10px] text-destructive hover:underline" onClick={async () => { try { await invoke('builtin_llm_cancel_download'); } catch {} }}>{b('取消', 'Cancel')}</button>
                              </div>
                            </div>
                            <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                              {downloadProgress
                                ? <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: downloadProgress.total ? `${Math.min(100, (downloadProgress.written / downloadProgress.total) * 100)}%` : '30%' }} />
                                : <div className="h-full bg-primary/60 rounded-full animate-pulse" style={{ width: '30%' }} />}
                            </div>
                            {downloadProgress?.total && (
                              <div className="text-[10px] text-muted-foreground text-right">
                                {Math.round((downloadProgress.written / downloadProgress.total) * 100)}%
                              </div>
                            )}
                          </div>
                        )}
                        {builtinRecommend && !builtinGlobalLoading && (
                          <div className="text-[11px] text-muted-foreground bg-muted/40 rounded-lg p-2.5 space-y-1">
                            <div className="font-medium text-foreground/80 mb-1">{b('检测结果', 'Detection Result')}</div>
                            <div>
                              {builtinRecommend.probe.cpuBrand || `CPU ${builtinRecommend.probe.cpuCores} ${b('核', 'cores')}`}
                              {builtinRecommend.probe.cpuBrand ? ` (${builtinRecommend.probe.cpuCores} ${b('核', 'cores')})` : ''}
                              {' · '}{b('内存', 'RAM')} {(builtinRecommend.probe.totalMemoryBytes / 1024 / 1024 / 1024).toFixed(1)} GB
                            </div>
                            {(builtinRecommend.probe.gpuName || typeof builtinRecommend.probe.vramBytes === 'number') && (
                              <div>
                                {b('显卡', 'GPU')}: {builtinRecommend.probe.gpuName || b('未知', 'Unknown')}
                                {typeof builtinRecommend.probe.vramBytes === 'number' ? ` · ${b('显存', 'VRAM')} ${(builtinRecommend.probe.vramBytes / 1024 / 1024 / 1024).toFixed(1)} GB` : ''}
                              </div>
                            )}
                            <div>
                              {b('加速支持', 'Acceleration')}: {[builtinRecommend.probe.hasMetal ? 'Metal ✓' : null, builtinRecommend.probe.hasCuda ? 'CUDA ✓' : null, builtinRecommend.probe.hasVulkan ? 'Vulkan ✓' : null].filter(Boolean).join(' · ') || b('无', 'None')}
                            </div>
                            {benchmarkResult && (
                              <div className="pt-0.5 border-t border-border/30 mt-1">
                                {b('基准测试', 'Benchmark')}: {benchmarkResult.tokensPerSecond.toFixed(1)} tok/s ({benchmarkResult.completionTokens} tokens / {(benchmarkResult.elapsedMs / 1000).toFixed(1)}s)
                              </div>
                            )}
                            <div className="pt-0.5 border-t border-border/30 mt-1">
                              {b('选择配置', 'Config')}: {builtinModelId} · {builtinRecommend.recommendedComputeMode}/{builtinRecommend.recommendedGpuBackend}
                            </div>
                          </div>
                        )}
                        {/* Downgrade button: show when model is running and not already the smallest */}
                        {builtinStatus?.running && !builtinGlobalLoading && builtinModelId !== 'qwen3_0_6b_q4_k_m' && (
                          <button
                            type="button"
                            onClick={handleModelDowngrade}
                            className="w-full flex items-center justify-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 border border-amber-300/60 dark:border-amber-600/40 rounded-lg py-2 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                            {b('觉得太慢？降级到更小模型', 'Too slow? Downgrade to a smaller model')}
                          </button>
                        )}
                      </div>

                      {/* Tier explanation — compact */}
                      <div className="rounded-xl border border-border/60 p-3 space-y-1.5">
                        <div className="text-xs font-medium flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-primary" />
                          {b('智能分级', 'Smart Tier')}
                        </div>
                        <div className="text-[11px] text-muted-foreground leading-relaxed">
                          {b('探测硬件 → 多引擎基准测试（CUDA/Vulkan/Metal/CPU）→ 选最快后端 → 自动推荐最佳模型。',
                             'Detect hardware → multi-engine benchmark (CUDA/Vulkan/Metal/CPU) → pick fastest backend → auto-recommend best model.')}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground/70">
                          <span>≥200 → 32B</span>
                          <span>150–199 → 14B</span>
                          <span>≥100 → 8B</span>
                          <span>50–99 → 4B</span>
                          <span>20–49 → 1.7B</span>
                          <span>&lt;20 → 0.6B</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setBuiltinAdvancedMode(true)}
                        className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border/60 rounded-lg py-2 hover:bg-muted/50 transition-colors"
                      >
                        <Settings className="w-3.5 h-3.5" />
                        {b('高级配置', 'Advanced Settings')}
                      </button>
                    </div>
                  )}

                  {/* Advanced mode: full controls */}
                  {builtinAdvancedMode && (
                    <div className="space-y-4">
                      <button
                        type="button"
                        onClick={() => setBuiltinAdvancedMode(false)}
                        className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 border border-primary/30 rounded-lg px-3 py-1.5 hover:bg-primary/5 transition-colors"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        {b('返回简易模式', 'Back to Simple Mode')}
                      </button>

                      {/* ① Hardware & Runtime */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[11px] font-bold flex items-center justify-center flex-shrink-0">①</span>
                          <span className="text-sm font-medium">{b('硬件与运行时', 'Hardware & Runtime')}</span>
                        </div>

                        {/* Auto-detect */}
                        <div className="rounded-lg border border-border/50 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-xs font-medium">{b('硬件探测', 'Hardware Detection')}</div>
                              <div className="text-[11px] text-muted-foreground">{b('探测硬件并推荐最佳配置', 'Detect hardware and recommend optimal config')}</div>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <Button size="sm" variant="outline" className="rounded-lg text-xs h-7" onClick={handleBuiltinRecommend} disabled={builtinGlobalLoading || builtinRecommendLoading}>
                                {builtinRecommendLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : b('探测', 'Detect')}
                              </Button>
                              <Button size="sm" className="rounded-lg text-xs h-7" onClick={() => void handleBuiltinApplyRecommend()} disabled={!builtinRecommend || builtinGlobalLoading || builtinRecommendLoading}>
                                {b('应用推荐', 'Apply')}
                              </Button>
                            </div>
                          </div>
                          {builtinRecommend && (
                            <div className="text-[11px] text-muted-foreground bg-muted/40 rounded-lg p-2 mt-2 space-y-0.5">
                              <div>
                                {builtinRecommend.probe.cpuBrand || `CPU ${builtinRecommend.probe.cpuCores} ${b('核', 'cores')}`}
                                {builtinRecommend.probe.cpuBrand ? ` (${builtinRecommend.probe.cpuCores}${b('核', 'C')})` : ''}
                                {' · '}{b('内存', 'RAM')} {(builtinRecommend.probe.totalMemoryBytes / 1024 / 1024 / 1024).toFixed(1)} GB
                                {builtinRecommend.probe.gpuName ? ` · ${builtinRecommend.probe.gpuName}` : ''}
                                {typeof builtinRecommend.probe.vramBytes === 'number' ? ` ${(builtinRecommend.probe.vramBytes / 1024 / 1024 / 1024).toFixed(1)} GB` : ''}
                              </div>
                              {benchmarkResult ? (
                                <div className="pt-0.5 border-t border-border/30 mt-0.5">
                                  {b('基准测试', 'Benchmark')}: {benchmarkResult.tokensPerSecond.toFixed(1)} tok/s · {b('推荐', 'Rec')}: {benchmarkResult.recommendedModelId} · {builtinRecommend.recommendedComputeMode}/{builtinRecommend.recommendedGpuBackend}
                                </div>
                              ) : (
                                <div className="pt-0.5 border-t border-border/30 mt-0.5">
                                  {b('推荐', 'Rec')}: {builtinRecommend.recommendedModelId} · {builtinRecommend.recommendedComputeMode}/{builtinRecommend.recommendedGpuBackend}
                                  <span className="text-muted-foreground/50"> ({b('未benchmark，需先安装运行时和0.6B模型', 'No benchmark — install runtime & 0.6B first')})</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Hardware config warning */}
                        {Object.values(builtinStatusById).some(s => s?.running) && (
                          <div className="text-[11px] text-amber-600 bg-amber-500/10 rounded-lg px-3 py-1.5 flex items-center gap-1.5">
                            <Zap className="w-3 h-3 flex-shrink-0" />
                            {b('服务运行中，修改配置后请在③服务控制中点击「应用并重启」', 'Service running — click "Apply & Restart" in ③ after changes')}
                          </div>
                        )}

                        {/* Hardware config */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div>
                            <div className="text-[11px] text-muted-foreground mb-1">{b('算力模式', 'Compute')}</div>
                            <select value={builtinComputeMode} onChange={(e) => handleHardwareChange(() => setBuiltinComputeMode(e.target.value as any))} className="w-full px-2 py-1 border border-border rounded-lg bg-background text-foreground text-xs">
                              <option value="cpu">CPU</option>
                              <option value="gpu">GPU</option>
                              <option value="hybrid">CPU + GPU</option>
                            </select>
                          </div>
                          <div>
                            <div className="text-[11px] text-muted-foreground mb-1">{b('GPU 后端', 'GPU Backend')}</div>
                            <select value={builtinGpuBackend} onChange={(e) => handleHardwareChange(() => setBuiltinGpuBackend(e.target.value as any))} disabled={builtinComputeMode === 'cpu'} className="w-full px-2 py-1 border border-border rounded-lg bg-background text-foreground text-xs disabled:opacity-50">
                              <option value="vulkan">Vulkan</option>
                              <option value="cuda">CUDA</option>
                              <option value="metal">Metal (macOS)</option>
                            </select>
                          </div>
                          <div>
                            <div className="text-[11px] text-muted-foreground mb-1">{b('CUDA 版本', 'CUDA Ver')}</div>
                            <select value={builtinCudaVersion} onChange={(e) => handleHardwareChange(() => setBuiltinCudaVersion(e.target.value as any))} disabled={builtinComputeMode === 'cpu' || builtinGpuBackend !== 'cuda'} className="w-full px-2 py-1 border border-border rounded-lg bg-background text-foreground text-xs disabled:opacity-50">
                              <option value="12.4">12.4</option>
                              <option value="13.1">13.1</option>
                            </select>
                          </div>
                          <div>
                            <div className="text-[11px] text-muted-foreground mb-1">{b('GPU Layers', 'GPU Layers')}</div>
                            <input type="number" min={0} max={200} value={builtinGpuLayers} onChange={(e) => { setBuiltinGpuLayers(Number.parseInt(e.target.value || '0', 10)); saveSettings(); }} disabled={builtinComputeMode !== 'hybrid'} className="w-full px-2 py-1 border border-border rounded-lg bg-background text-foreground text-xs disabled:opacity-50" />
                          </div>
                        </div>

                        {/* Runtime management */}
                        <div className="rounded-lg border border-border/50 p-3 space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-xs font-medium">llama.cpp {b('推理引擎', 'Runtime')}</div>
                              <div className="text-[11px] text-muted-foreground">
                                {runtimeStatus?.installed
                                  ? <span className="text-green-600">{b('已安装', 'Installed')} ✓</span>
                                  : <span className="text-orange-500">{b('未安装', 'Not installed')}</span>
                                }
                                <span className="ml-1.5 text-muted-foreground/60">{builtinComputeMode === 'cpu' ? 'cpu' : `${builtinComputeMode}/${builtinGpuBackend}${builtinGpuBackend === 'cuda' ? `/${builtinCudaVersion}` : ''}`}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Button size="sm" className="rounded-lg text-xs h-7" onClick={handleBuiltinInstallRuntime} disabled={builtinGlobalLoading || runtimeInstalling || !!runtimeStatus?.installed}>
                              {runtimeInstalling ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Download className="w-3 h-3 mr-1" />}
                              {runtimeInstalling ? b('下载中', 'Downloading') : runtimeStatus?.installed ? b('已下载', 'Downloaded') : b('下载', 'Download')}
                            </Button>
                            {(builtinComputeMode !== 'cpu' && builtinGpuBackend === 'cuda') ? (
                              <>
                                <Button size="sm" variant="outline" className="rounded-lg text-xs h-7" onClick={() => handleBuiltinImportRuntime(b('选择 llama.cpp 运行时 zip', 'Select llama.cpp runtime zip'))} disabled={builtinGlobalLoading || runtimeInstalling}>
                                  <Upload className="w-3 h-3 mr-1" />{b('导入运行时', 'Import Runtime')}
                                </Button>
                                <Button size="sm" variant="outline" className="rounded-lg text-xs h-7" onClick={() => handleBuiltinImportRuntime(b('选择 cudart zip', 'Select cudart zip'))} disabled={builtinGlobalLoading || runtimeInstalling}>
                                  <Upload className="w-3 h-3 mr-1" />{b('导入 cudart', 'Import cudart')}
                                </Button>
                              </>
                            ) : (
                              <Button size="sm" variant="outline" className="rounded-lg text-xs h-7" onClick={() => handleBuiltinImportRuntime()} disabled={builtinGlobalLoading || runtimeInstalling}>
                                <Upload className="w-3 h-3 mr-1" />{b('导入 zip', 'Import zip')}
                              </Button>
                            )}
                            {runtimeStatus?.installed && (
                              <Button size="sm" variant="ghost" className="rounded-lg text-xs h-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleBuiltinDeleteRuntime} disabled={builtinGlobalLoading || runtimeInstalling}>
                                <Trash2 className="w-3 h-3 mr-1" />{b('删除', 'Delete')}
                              </Button>
                            )}
                          </div>
                          {runtimeInstalling && (
                            <div className="space-y-1.5 bg-primary/5 rounded-lg p-2.5">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-medium text-foreground">
                                  {downloadProgress
                                    ? <>{b('正在下载', 'Downloading')}: {downloadProgress.label}</>
                                    : b('正在准备下载...', 'Preparing download...')}
                                </span>
                                <div className="flex items-center gap-2">
                                  {downloadProgress?.total && (
                                    <span className="text-primary font-medium tabular-nums">
                                      {Math.round((downloadProgress.written / downloadProgress.total) * 100)}%
                                    </span>
                                  )}
                                  <button className="text-[10px] text-destructive hover:underline" onClick={async () => { try { await invoke('builtin_llm_cancel_download'); } catch {} }}>{b('取消', 'Cancel')}</button>
                                </div>
                              </div>
                              <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
                                {downloadProgress
                                  ? <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: downloadProgress.total ? `${Math.min(100, (downloadProgress.written / downloadProgress.total) * 100)}%` : '30%' }} />
                                  : <div className="h-full bg-primary/60 rounded-full animate-pulse" style={{ width: '40%' }} />}
                              </div>
                              {downloadProgress && (
                                <div className="text-[10px] text-muted-foreground tabular-nums text-right">
                                  {(downloadProgress.written / 1024 / 1024).toFixed(1)} MB{downloadProgress.total ? ` / ${(downloadProgress.total / 1024 / 1024).toFixed(1)} MB` : ''}
                                  {downloadProgress.speed ? ` · ${downloadProgress.speed >= 1048576 ? (downloadProgress.speed / 1048576).toFixed(1) + ' MB/s' : (downloadProgress.speed / 1024).toFixed(0) + ' KB/s'}` : ''}
                                </div>
                              )}
                            </div>
                          )}
                          {(builtinComputeMode !== 'cpu' && builtinGpuBackend === 'cuda') && !runtimeStatus?.installed && (
                            <div className="text-[11px] text-blue-600 bg-blue-500/10 rounded-lg px-3 py-1.5">
                              {b('CUDA 模式需要导入两个文件：① llama.cpp 推理引擎 zip ② cudart zip，顺序不限', 'CUDA mode requires two files: ① llama.cpp runtime zip ② cudart zip, in any order')}
                            </div>
                          )}
                          {runtimeError && (
                            <div className="text-xs text-destructive bg-destructive/10 rounded-lg p-2 flex items-start justify-between gap-2">
                              <span className="break-all">{runtimeError}</span>
                              <button className="text-destructive/60 hover:text-destructive flex-shrink-0 text-sm leading-none" onClick={() => setRuntimeError(null)}>×</button>
                            </div>
                          )}
                          {runtimeStatus?.runtimeDir && (
                            <div className="text-[10px] text-muted-foreground/50 truncate" title={runtimeStatus.runtimeDir}>{runtimeStatus.runtimeDir}</div>
                          )}
                        </div>
                      </div>

                      {/* ② Model Management */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[11px] font-bold flex items-center justify-center flex-shrink-0">②</span>
                          <span className="text-sm font-medium">{b('模型管理', 'Model Management')}</span>
                        </div>
                        <div className="space-y-2">
                          {BUILTIN_MODELS.map((m) => {
                            const s = builtinStatusById[m.id];
                            const isDefault = builtinModelId === m.id;
                            const isBusy = !!builtinLoadingById[m.id];
                            return (
                              <div key={m.id} className={`rounded-xl border p-3 transition-colors ${isDefault ? 'border-primary/40 bg-primary/5' : 'border-border/60 hover:border-border'}`}>
                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="w-4 h-4 rounded bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0">T{m.tier}</span>
                                      <span className="text-sm font-medium">{m.title}</span>
                                      {isDefault && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-medium">{b('默认', 'Default')}</span>}
                                    </div>
                                    <div className="text-[11px] text-muted-foreground mt-0.5">{m.subtitle} · {m.ramHint}</div>
                                  </div>
                                  {!isDefault && (
                                    <Button size="sm" variant="ghost" className="rounded-lg text-xs h-6 px-2" onClick={() => handleSetDefaultModel(m.id)} disabled={builtinGlobalLoading || isBusy}>
                                      {b('设为默认', 'Set Default')}
                                    </Button>
                                  )}
                                </div>
                                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                                  <Button size="sm" className="rounded-lg text-xs h-7" onClick={() => handleBuiltinInstall(m.id)} disabled={builtinGlobalLoading || isBusy || !!s?.modelInstalled}>
                                    {isBusy ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Download className="w-3 h-3 mr-1" />}
                                    {isBusy ? b('下载中', 'Downloading') : s?.modelInstalled ? b('已下载', 'Downloaded') : b('下载', 'Download')}
                                  </Button>
                                  <Button size="sm" variant="outline" className="rounded-lg text-xs h-7" onClick={() => handleBuiltinImportModel(m.id)} disabled={builtinGlobalLoading || isBusy}>
                                    <Upload className="w-3 h-3 mr-1" />{b('导入', 'Import')}
                                  </Button>
                                  <Button size="sm" variant="ghost" className="rounded-lg text-xs h-7" onClick={() => handleCopyModelLink(m.url)} disabled={builtinGlobalLoading || isBusy}>
                                    <Copy className="w-3 h-3 mr-1" />{b('链接', 'Link')}
                                  </Button>
                                  {s?.modelInstalled && !s?.runningThisModel && (
                                    <Button size="sm" variant="ghost" className="rounded-lg text-xs h-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleBuiltinDeleteModel(m.id)} disabled={builtinGlobalLoading || isBusy}>
                                      <Trash2 className="w-3 h-3 mr-1" />{b('删除', 'Delete')}
                                    </Button>
                                  )}
                                  {s && (
                                    <div className="flex items-center gap-2 ml-auto text-[10px] text-muted-foreground">
                                      <span className={`flex items-center gap-0.5 ${s.modelInstalled ? 'text-green-600' : ''}`}>
                                        {s.modelInstalled ? <CheckCircle className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
                                        {b('模型', 'Model')}
                                      </span>
                                      <span className={`flex items-center gap-0.5 ${s.runningThisModel ? 'text-green-600' : ''}`}>
                                        {s.runningThisModel ? <CheckCircle className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
                                        {b('运行', 'Run')}
                                      </span>
                                    </div>
                                  )}
                                </div>
                                {/* Inline download progress for this model */}
                                {isBusy && (
                                  <div className="mt-1.5 space-y-1">
                                    <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                                      {downloadProgress
                                        ? <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: downloadProgress.total ? `${Math.min(100, (downloadProgress.written / downloadProgress.total) * 100)}%` : '30%' }} />
                                        : <div className="h-full bg-primary/60 rounded-full animate-pulse" style={{ width: '30%' }} />}
                                    </div>
                                    <div className="flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
                                      <span>{downloadProgress ? (downloadProgress.total ? `${downloadProgress.label} ${Math.round((downloadProgress.written / downloadProgress.total) * 100)}%` : `${downloadProgress.label}...`) : b('准备中...', 'Preparing...')}</span>
                                      <div className="flex items-center gap-2">
                                        {downloadProgress && (
                                          <span>{(downloadProgress.written / 1024 / 1024).toFixed(1)} MB{downloadProgress.total ? ` / ${(downloadProgress.total / 1024 / 1024).toFixed(1)} MB` : ''}{downloadProgress.speed ? ` · ${downloadProgress.speed >= 1048576 ? (downloadProgress.speed / 1048576).toFixed(1) + ' MB/s' : (downloadProgress.speed / 1024).toFixed(0) + ' KB/s'}` : ''}</span>
                                        )}
                                        <button className="text-destructive hover:underline" onClick={async () => { try { await invoke('builtin_llm_cancel_download'); } catch {} }}>{b('取消', 'Cancel')}</button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>


                        {/* Custom model */}
                        <div className="rounded-xl border border-dashed border-border/60 p-3 space-y-2.5">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium">{b('自定义模型', 'Custom Models')}</div>
                              <div className="text-[11px] text-muted-foreground">{b('导入的 GGUF 文件（不含上方内置模型）', 'Imported GGUF files (excludes built-in models above)')}</div>
                            </div>
                            <Button size="sm" variant="outline" className="rounded-lg text-xs h-7" onClick={handleBuiltinImportCustomModel} disabled={builtinGlobalLoading}>
                              <Upload className="w-3 h-3 mr-1" />{b('导入', 'Import')}
                            </Button>
                          </div>
                          {(() => {
                            const builtinIds = new Set(BUILTIN_MODELS.map((m) => m.id));
                            const customModels = builtinModels.filter((m) => !builtinIds.has(m.modelId));
                            if (customModels.length === 0) {
                              return (
                                <div className="text-[11px] text-muted-foreground text-center py-3 bg-muted/30 rounded-lg">
                                  {b('暂无自定义模型，点击「导入」添加 GGUF 文件', 'No custom models yet. Click "Import" to add a GGUF file.')}
                                </div>
                              );
                            }
                            return (
                              <div className="space-y-1.5">
                                {customModels.map((m) => {
                                  const isDefault = builtinModelId === m.modelId;
                                  const isBusy = !!builtinLoadingById[m.modelId];
                                  return (
                                    <div key={m.fileName} className={`flex items-center justify-between gap-2 rounded-lg border p-2 transition-colors ${isDefault ? 'border-primary/40 bg-primary/5' : 'border-border/40'}`}>
                                      <div className="min-w-0 flex-1">
                                        <div className="font-mono truncate text-[11px]">{m.modelId}</div>
                                        <div className="text-[10px] text-muted-foreground">{formatModelSize(m.size)}</div>
                                      </div>
                                      <div className="flex items-center gap-1 flex-shrink-0">
                                        {isDefault ? (
                                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">{b('默认', 'Default')}</span>
                                        ) : (
                                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => handleSetDefaultModel(m.modelId)} disabled={builtinGlobalLoading || isBusy}>
                                            {b('设为默认', 'Set Default')}
                                          </Button>
                                        )}
                                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleBuiltinDeleteModel(m.modelId)} disabled={builtinGlobalLoading || isBusy || (isDefault && builtinStatus?.running)}>
                                          <Trash2 className="w-3 h-3" />
                                        </Button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      {/* ③ Service Control */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[11px] font-bold flex items-center justify-center flex-shrink-0">③</span>
                          <span className="text-sm font-medium">{b('服务控制', 'Service Control')}</span>
                        </div>

                        {(() => {
                          const isRunning = builtinStatus?.running;
                          const configChanged = isRunning && (
                            !builtinStatus?.runningThisModel ||
                            (startedConfig && (startedConfig.cm !== builtinComputeMode || startedConfig.gb !== builtinGpuBackend || startedConfig.cv !== builtinCudaVersion || startedConfig.gl !== builtinGpuLayers))
                          );
                          return (
                        <div className="rounded-lg border border-border/50 p-3 space-y-3">
                          {/* Readiness checklist */}
                          <div className="flex items-center gap-4 text-xs flex-wrap">
                            <span className={`flex items-center gap-1.5 ${runtimeStatus?.installed ? 'text-green-600' : 'text-muted-foreground'}`}>
                              {runtimeStatus?.installed ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                              {b('推理引擎', 'Runtime')}
                            </span>
                            <span className={`flex items-center gap-1.5 ${builtinStatus?.modelInstalled ? 'text-green-600' : 'text-muted-foreground'}`}>
                              {builtinStatus?.modelInstalled ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                              {b('模型', 'Model')} ({builtinModelId})
                            </span>
                            {isRunning && (
                              <span className={`flex items-center gap-1.5 ml-auto ${configChanged ? 'text-amber-600' : 'text-green-600'}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${configChanged ? 'bg-amber-500' : 'bg-green-500 animate-pulse'}`} />
                                {configChanged ? b('配置已变更', 'Config Changed') : b('运行中', 'Running')}
                              </span>
                            )}
                          </div>

                          {/* Action buttons */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {!isRunning ? (
                              <Button size="sm" className="rounded-lg text-xs h-7" onClick={handleBuiltinRun} disabled={builtinGlobalLoading || !runtimeStatus?.installed || !builtinStatus?.modelInstalled}>
                                {builtinGlobalLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Zap className="w-3 h-3 mr-1" />}
                                {b('启动服务', 'Start Service')}
                              </Button>
                            ) : configChanged ? (
                              <>
                                <Button size="sm" className="rounded-lg text-xs h-7 bg-amber-600 hover:bg-amber-700" onClick={handleBuiltinRun} disabled={builtinGlobalLoading || !runtimeStatus?.installed || !builtinStatus?.modelInstalled}>
                                  {builtinGlobalLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                                  {b('应用并重启', 'Apply & Restart')}
                                </Button>
                                <Button size="sm" variant="outline" className="rounded-lg text-xs h-7" onClick={handleBuiltinStop} disabled={builtinGlobalLoading}>
                                  {b('停止', 'Stop')}
                                </Button>
                                <span className="text-[10px] text-amber-600">{b('模型或硬件配置已变更，需要重启生效', 'Model or hardware config changed, restart to apply')}</span>
                              </>
                            ) : (
                              <>
                                <Button size="sm" variant="outline" className="rounded-lg text-xs h-7 text-green-600 border-green-500/30" disabled>
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  {b('运行中', 'Running')}
                                </Button>
                                <Button size="sm" variant="outline" className="rounded-lg text-xs h-7" onClick={handleBuiltinStop} disabled={builtinGlobalLoading}>
                                  {b('停止', 'Stop')}
                                </Button>
                              </>
                            )}
                          </div>

                          {/* Running status */}
                          {builtinStatus && (builtinStatus.runningModelId || builtinStatus.baseUrl) && (
                            <div className="text-[10px] text-muted-foreground bg-muted/30 rounded px-2 py-1.5 space-y-0.5">
                              {builtinStatus.runningModelId && <div>{b('运行模型', 'Running')}: {builtinStatus.runningModelId}</div>}
                              {builtinStatus.baseUrl && <div>{b('服务地址', 'URL')}: {builtinStatus.baseUrl}</div>}
                            </div>
                          )}

                          {builtinError && (
                            <div className="text-xs text-destructive bg-destructive/10 rounded-lg p-2 flex items-start justify-between gap-2">
                              <span className="break-all">{builtinError}</span>
                              <button className="text-destructive/60 hover:text-destructive flex-shrink-0 text-sm leading-none" onClick={() => setBuiltinError(null)}>×</button>
                            </div>
                          )}
                        </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </div>

              {/* Ollama */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">Ollama</span>
                  {llmProvider === 'ollama' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-600 font-medium">{b('使用中', 'Active')}</span>}
                </div>
                  <div className="rounded-xl border border-border/60 p-4 space-y-3">
                    <div>
                      <label className="text-xs font-medium">{b('服务地址', 'Server URL')}</label>
                      <div className="flex gap-2 mt-1">
                        <input type="text" value={ollamaUrl} onChange={(e) => setOllamaUrl(e.target.value)} className="flex-1 px-3 py-1.5 border border-border rounded-lg bg-background text-foreground text-sm" placeholder="http://localhost:11434" />
                        <Button variant="outline" size="sm" className="rounded-lg h-8 px-3" onClick={handleRefreshModels} disabled={loadingModels}>
                          {loadingModels ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                      <div className="flex items-center gap-1 mt-1.5 text-xs">
                        {connectionStatus === 'connected' && (<><CheckCircle className="w-3 h-3 text-green-500" /><span className="text-green-600">{b('已连接', 'Connected')}</span></>)}
                        {connectionStatus === 'error' && (<><XCircle className="w-3 h-3 text-red-500" /><span className="text-red-600">{b('连接失败', 'Failed')}</span></>)}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium">{b('模型', 'Model')}</label>
                      {models.length > 0 ? (
                        <select value={ollamaModel} onChange={(e) => setOllamaModel(e.target.value)} className="w-full mt-1 px-3 py-1.5 border border-border rounded-lg bg-background text-foreground text-sm">
                          {models.map((model) => (<option key={model.name} value={model.name}>{model.name} ({formatModelSize(model.size)})</option>))}
                        </select>
                      ) : (
                        <input type="text" value={ollamaModel} onChange={(e) => setOllamaModel(e.target.value)} className="w-full mt-1 px-3 py-1.5 border border-border rounded-lg bg-background text-foreground text-sm" placeholder="qwen3:8b" />
                      )}
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {models.length > 0 ? b(`${models.length} 个模型`, `${models.length} model(s)`) : b('输入模型名或刷新', 'Type model name or refresh')}
                      </p>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {b('未安装？访问 ', 'Not installed? Visit ')}
                      <span className="font-mono text-primary">https://ollama.com</span>
                      {b(' 下载 Ollama', ' to download Ollama')}
                    </div>
                  </div>
                </div>

              {/* OpenAI Compatible */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">OpenAI Compatible</span>
                  {llmProvider === 'openai_compatible' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-600 font-medium">{b('使用中', 'Active')}</span>}
                </div>
              <div className="rounded-xl border border-border/60 p-4 space-y-3">
                  <div>
                    <label className="text-xs font-medium">Base URL</label>
                    <input type="text" value={openAICompatibleBaseUrl} onChange={(e) => setOpenAICompatibleBaseUrl(e.target.value)} className="w-full mt-1 px-3 py-1.5 border border-border rounded-lg bg-background text-foreground text-sm" placeholder="https://api.openai.com/v1" />
                    <p className="text-[11px] text-muted-foreground mt-1">{b('需要包含', 'Must include')} <code className="bg-muted px-1 rounded text-[10px]">/v1</code></p>
                  </div>
                  <div>
                    <label className="text-xs font-medium">API Key</label>
                    <input type="password" value={openAICompatibleApiKey} onChange={(e) => setOpenAICompatibleApiKey(e.target.value)} className="w-full mt-1 px-3 py-1.5 border border-border rounded-lg bg-background text-foreground text-sm" placeholder="sk-..." />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Model</label>
                    <input type="text" value={openAICompatibleModel} onChange={(e) => setOpenAICompatibleModel(e.target.value)} className="w-full mt-1 px-3 py-1.5 border border-border rounded-lg bg-background text-foreground text-sm" placeholder="gpt-4o-mini" />
                  </div>
                </div>
              </div>

              {/* Custom Prompts (in AI tab) */}
              <div className="rounded-xl border border-border/60 overflow-hidden">
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                >
                  <span>{b('自定义 Prompts', 'Custom Prompts')}</span>
                  {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {showAdvanced && (
                  <div className="px-4 pb-4 space-y-3 border-t border-border/40">
                    <div className="flex items-center justify-between pt-3">
                      <div className="text-[11px] text-muted-foreground">
                        {b('使用', 'Use')} <code className="bg-muted px-1 rounded">{"{text}"}</code> {b('作为占位符', 'as placeholder')}
                      </div>
                      <Button variant="outline" size="sm" className="rounded-lg text-xs h-6 px-2" onClick={handleResetAllPrompts}>
                        <RotateCcw className="w-3 h-3 mr-1" />{b('全部重置', 'Reset All')}
                      </Button>
                    </div>
                    {(Object.keys(PROMPT_LABELS_ZH) as Array<keyof PromptSettings>).map((key) => (
                      <div key={key} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium">{uiLanguage === 'en' ? PROMPT_LABELS_EN[key] : PROMPT_LABELS_ZH[key]}</label>
                          <Button variant="ghost" size="sm" onClick={() => handleResetPrompt(key)} className="h-5 px-1.5 text-[11px]">
                            <RotateCcw className="w-2.5 h-2.5 mr-0.5" />{b('重置', 'Reset')}
                          </Button>
                        </div>
                        <textarea
                          value={prompts[key]}
                          onChange={(e) => { setPrompt(key, e.target.value); saveSettings(); }}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-xs min-h-[60px] resize-y"
                          rows={2}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Download URLs config */}
              <div className="rounded-xl border border-border/60 overflow-hidden">
                <button
                  onClick={() => setShowDownloadUrls(!showDownloadUrls)}
                  className="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                >
                  <span>{b('下载链接配置', 'Download URLs')}</span>
                  {showDownloadUrls ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {showDownloadUrls && (
                  <div className="px-4 pb-4 space-y-3 border-t border-border/40">
                    <div className="flex items-center justify-between pt-3">
                      <div className="text-[11px] text-muted-foreground">
                        {b('留空则使用默认链接（魔塔社区）', 'Leave empty to use default URLs (ModelScope)')}
                      </div>
                      <Button variant="outline" size="sm" className="rounded-lg text-xs h-6 px-2" onClick={() => { resetAllBuiltinDownloadUrls(); saveSettings(); }}>
                        <RotateCcw className="w-3 h-3 mr-1" />{b('全部重置', 'Reset All')}
                      </Button>
                    </div>
                    <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider pt-1">{b('运行时工具', 'Runtime Tools')}</div>
                    {RUNTIME_DOWNLOADS.map((rd) => (
                      <div key={rd.key} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium">{rd.label}</label>
                          {builtinDownloadUrls[rd.key] && (
                            <Button variant="ghost" size="sm" onClick={() => { resetBuiltinDownloadUrl(rd.key); saveSettings(); }} className="h-5 px-1.5 text-[11px]">
                              <RotateCcw className="w-2.5 h-2.5 mr-0.5" />{b('重置', 'Reset')}
                            </Button>
                          )}
                        </div>
                        <input
                          type="text"
                          value={builtinDownloadUrls[rd.key] || ''}
                          onChange={(e) => { setBuiltinDownloadUrl(rd.key, e.target.value); saveSettings(); }}
                          placeholder={rd.defaultUrl}
                          className="w-full px-3 py-1.5 border border-border rounded-lg bg-background text-foreground text-[11px] font-mono placeholder:text-muted-foreground/40"
                        />
                      </div>
                    ))}
                    <div className="border-t border-border/30 my-1" />
                    <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{b('模型', 'Models')}</div>
                    {BUILTIN_MODELS.map((m) => (
                      <div key={m.id} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium">{m.title} <span className="text-muted-foreground font-normal">{m.subtitle.split('·')[0].trim()}</span></label>
                          {builtinDownloadUrls[m.id] && (
                            <Button variant="ghost" size="sm" onClick={() => { resetBuiltinDownloadUrl(m.id); saveSettings(); }} className="h-5 px-1.5 text-[11px]">
                              <RotateCcw className="w-2.5 h-2.5 mr-0.5" />{b('重置', 'Reset')}
                            </Button>
                          )}
                        </div>
                        <input
                          type="text"
                          value={builtinDownloadUrls[m.id] || ''}
                          onChange={(e) => { setBuiltinDownloadUrl(m.id, e.target.value); saveSettings(); }}
                          placeholder={m.url}
                          className="w-full px-3 py-1.5 border border-border rounded-lg bg-background text-foreground text-[11px] font-mono placeholder:text-muted-foreground/40"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ===== Storage Tab ===== */}
          {settingsTab === 'storage' && (
            <>
              {/* Cache */}
              <div className="space-y-2">
                <label className="text-sm font-medium">{b('文档缓存', 'Document Cache')}</label>
                <div className="rounded-xl border border-border/60 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">{b(`${cacheStats.count} 个文档`, `${cacheStats.count} document(s)`)}</div>
                      <div className="text-xs text-muted-foreground">{formatSize(cacheStats.size)} / {formatSize(cacheStats.maxSize)}</div>
                    </div>
                    <Button variant="outline" size="sm" className="rounded-lg text-xs h-7" onClick={handleClearCache} disabled={cacheStats.count === 0}>
                      <Trash2 className="w-3 h-3 mr-1" />{b('清空', 'Clear')}
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground">{b('上限', 'Max')}:</label>
                    <div className="flex rounded-lg border border-border p-0.5 bg-muted/30">
                      {[
                        { value: 50, label: '50MB' },
                        { value: 100, label: '100MB' },
                        { value: 200, label: '200MB' },
                        { value: 500, label: '500MB' },
                        { value: 1024, label: '1GB' },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => { setMaxCacheSize(opt.value); setCacheStats(getCacheStats()); }}
                          className={`px-2 py-0.5 text-[11px] rounded-md transition-all ${
                            Math.round(cacheStats.maxSize / 1024 / 1024) === opt.value ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{b('LRU 策略自动管理', 'Managed automatically via LRU')}</p>
                </div>
              </div>

              {/* Reset App */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-destructive">{b('危险区域', 'Danger Zone')}</label>
                <div className="rounded-xl border border-destructive/25 p-4 space-y-3">
                  <div>
                    <div className="text-sm font-medium">{b('重置应用', 'Reset App')}</div>
                    <div className="text-xs text-muted-foreground mt-1">{b('清空所有数据回到初始状态：文档、词典、模型、笔记、设置', 'Clear all data: documents, dictionaries, models, notes, settings')}</div>
                  </div>
                  {appDataDir && (
                    <div className="text-[11px] text-muted-foreground break-all">
                      <span className="font-mono">{appDataDir}</span>
                    </div>
                  )}
                  <div className="flex justify-end">
                    <Button variant="destructive" size="sm" className="rounded-lg text-xs h-7" onClick={handleResetAllData} disabled={builtinGlobalLoading}>
                      {builtinGlobalLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                      {builtinGlobalLoading ? b('重置中...', 'Resetting...') : b('清空所有数据', 'Clear All Data')}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-5 py-3 border-t border-border/60 bg-muted/20">
          <Button variant="outline" className="rounded-lg text-xs h-8" onClick={onClose}>
            {b('关闭', 'Close')}
          </Button>
        </div>
      </div>
    </div>
  );
}
