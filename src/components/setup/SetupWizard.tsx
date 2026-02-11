import { useState, useEffect, useRef } from "react";
import { ChevronRight, ChevronLeft, Sparkles, Check, Loader2, Zap, BookOpen, ChevronDown, Globe, Server, CheckCircle, Wifi, Award, AlertTriangle, HardDrive, Cpu } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useSettingsStore } from "@/stores/settingsStore";
import { invoke, Channel } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { cn } from "@/lib/utils";
import { BUILTIN_MODELS, type BuiltinModelDef } from "@/config/downloads";

interface SetupWizardProps {
  onComplete: () => void;
}

type Step = "welcome" | "paths" | "ai" | "done";

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const { uiLanguage, setUiLanguage, saveSettings } = useSettingsStore();
  const b = (zh: string, en: string) => uiLanguage === "zh" ? zh : en;

  const [step, setStep] = useState<Step>("welcome");
  const [documentsDir, setDocumentsDir] = useState<string>("");
  const [modelsDir, setModelsDir] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [aiStep, setAiStep] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ written: number; total: number | null; label: string; speed?: number | null } | null>(null);
  const [showOllama, setShowOllama] = useState(false);
  const [showOpenAI, setShowOpenAI] = useState(false);
  const [localOllamaUrl, setLocalOllamaUrl] = useState("http://localhost:11434");
  const [localOllamaModel, setLocalOllamaModel] = useState("qwen3:8b");
  const [localApiUrl, setLocalApiUrl] = useState("https://api.openai.com/v1");
  const [localApiKey, setLocalApiKey] = useState("");
  const [localApiModel, setLocalApiModel] = useState("gpt-4o-mini");
  // Independent config status for each provider
  const [builtinConfigured, setBuiltinConfigured] = useState(false);
  const [ollamaConfigured, setOllamaConfigured] = useState(false);
  const [apiConfigured, setApiConfigured] = useState(false);
  // Connection test states
  const [ollamaTestStatus, setOllamaTestStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [apiTestStatus, setApiTestStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  // Multi-engine benchmark + model selection
  type BenchEntry = { label: string; computeMode: string; gpuBackend: string; cudaVersion: string; tps: number };
  const [benchPhase, setBenchPhase] = useState<'idle' | 'running' | 'selecting'>('idle');
  const [benchEntries, setBenchEntries] = useState<BenchEntry[]>([]);
  const [bestEngine, setBestEngine] = useState<BenchEntry | null>(null);
  const [recommendedTier, setRecommendedTier] = useState<number>(0);
  const [recommendedModelId, setRecommendedModelId] = useState<string>('qwen3_0_6b_q4_k_m');
  const [selectedModelId, setSelectedModelId] = useState<string>('qwen3_0_6b_q4_k_m');
  const cancelledRef = useRef(false);

  // Load current paths from backend
  useEffect(() => {
    (async () => {
      try {
        const config = await invoke<{ documentsDir: string; modelsDir: string; dictionariesDir: string }>("get_app_config");
        setDocumentsDir(config.documentsDir);
        setModelsDir(config.modelsDir);
      } catch (e) {
        console.warn("[SetupWizard] Failed to load config:", e);
      }
    })();
  }, []);

  // Listen for download progress events
  useEffect(() => {
    const unlisten = listen<{ written: number; total: number | null; label: string; speed?: number | null }>(
      "builtin-llm-download-progress",
      (event) => { setDownloadProgress(event.payload); }
    );
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const pickDir = async (current: string): Promise<string | null> => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false, defaultPath: current || undefined } as any);
      return typeof selected === "string" ? selected : null;
    } catch {
      return null;
    }
  };

  const handleSavePaths = async () => {
    setLoading(true);
    try {
      await invoke("save_app_config", {
        config: {
          documentsDir: documentsDir || undefined,
          modelsDir: modelsDir || undefined,
        },
      });
      saveSettings();
    } catch (e) {
      console.error("[SetupWizard] Failed to save paths:", e);
    } finally {
      setLoading(false);
    }
    setStep("ai");
  };

  // ─── Multi-engine benchmark + model selection ───

  type ProbeResult = {
    cpuCores: number; cpuBrand: string; totalMemoryBytes: number;
    vramBytes: number | null; gpuName: string | null;
    hasCuda: boolean; hasVulkan: boolean; hasMetal: boolean; isAppleSilicon: boolean;
  };
  type RecommendResult = {
    recommendedModelId: string; recommendedComputeMode: string;
    recommendedGpuBackend: string; recommendedCudaVersion: string;
    probe: ProbeResult;
  };
  type BenchResult = { tokensPerSecond: number; recommendedTier: number; recommendedModelId: string };

  const createCh = () => {
    const ch = new Channel<any>();
    ch.onmessage = (msg: any) => setDownloadProgress(msg);
    return ch;
  };

  /** Determine all viable compute backends from probe */
  const getComputeCandidates = (probe: ProbeResult, cudaVersion: string): Array<{ label: string; computeMode: string; gpuBackend: string; cudaVersion: string }> => {
    const candidates: Array<{ label: string; computeMode: string; gpuBackend: string; cudaVersion: string }> = [];
    if (probe.hasMetal) {
      candidates.push({ label: 'Metal GPU', computeMode: 'gpu', gpuBackend: 'metal', cudaVersion });
    }
    if (probe.hasCuda) {
      candidates.push({ label: `CUDA GPU`, computeMode: 'gpu', gpuBackend: 'cuda', cudaVersion });
    }
    if (probe.hasVulkan) {
      candidates.push({ label: 'Vulkan GPU', computeMode: 'hybrid', gpuBackend: 'vulkan', cudaVersion });
    }
    candidates.push({ label: 'CPU', computeMode: 'cpu', gpuBackend: 'none', cudaVersion });
    return candidates;
  };

  const cancelSetup = async () => {
    cancelledRef.current = true;
    setLoading(false);
    setAiStep(null);
    setDownloadProgress(null);
    setBenchPhase('idle');
    try { await invoke('builtin_llm_stop'); } catch {}
  };

  const handleQuickSetup = async () => {
    cancelledRef.current = false;
    setAiError(null);
    setLoading(true);
    setBenchPhase('running');
    setBenchEntries([]);
    setBestEngine(null);
    try {
      const s = useSettingsStore.getState();
      const { builtinCudaVersion, builtinGpuLayers, builtinDownloadUrls } = s;

      // Step 1: Detect hardware
      setAiStep(b("正在探测硬件...", "Detecting hardware..."));
      const r = await invoke<RecommendResult>("builtin_llm_recommend", {
        options: { preferredTier: "auto", preferredCompute: "auto", cudaVersion: builtinCudaVersion },
      });

      if (cancelledRef.current) throw new Error('cancelled');
      const candidates = getComputeCandidates(r.probe, r.recommendedCudaVersion);
      const benchModelId = "qwen3_0_6b_q4_k_m";

      // Step 2: Install benchmark model with the first (best guess) backend
      setAiStep(b(
        `正在准备基准测试模型... (${candidates[0].label})`,
        `Preparing benchmark model... (${candidates[0].label})`
      ));
      await invoke("builtin_llm_install", {
        options: {
          modelId: benchModelId, mode: "auto",
          computeMode: candidates[0].computeMode,
          gpuBackend: candidates[0].gpuBackend,
          cudaVersion: candidates[0].cudaVersion,
          modelUrl: builtinDownloadUrls[benchModelId] || undefined,
        },
        onProgress: createCh(),
      });

      if (cancelledRef.current) throw new Error('cancelled');
      // Step 3: Benchmark each backend
      const results: BenchEntry[] = [];
      let bestTier = -1;
      let bestTps = 0;
      let bestIdx = 0;
      let bestBenchResult: BenchResult | null = null;

      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        setAiStep(b(
          `正在测试 ${c.label}... (${i + 1}/${candidates.length})`,
          `Benchmarking ${c.label}... (${i + 1}/${candidates.length})`
        ));
        setDownloadProgress(null);

        // Install runtime for this backend if not the first one
        if (i > 0) {
          try {
            await invoke("builtin_llm_install_runtime", {
              options: {
                computeMode: c.computeMode,
                gpuBackend: c.gpuBackend,
                cudaVersion: c.cudaVersion,
              },
              onProgress: createCh(),
            });
          } catch {
            // Runtime install failed (e.g. download error), skip this backend
            continue;
          }
        }

        try {
          const bench = await invoke<BenchResult>("builtin_llm_benchmark", {
            options: {
              computeMode: c.computeMode,
              gpuBackend: c.gpuBackend,
              cudaVersion: c.cudaVersion,
              gpuLayers: builtinGpuLayers,
            },
          });
          const entry: BenchEntry = { ...c, tps: bench.tokensPerSecond };
          results.push(entry);
          // Pick engine by highest achievable tier (quality), break ties by tps (speed)
          if (bench.recommendedTier > bestTier || (bench.recommendedTier === bestTier && bench.tokensPerSecond > bestTps)) {
            bestTier = bench.recommendedTier;
            bestTps = bench.tokensPerSecond;
            bestIdx = results.length - 1;
            bestBenchResult = bench;
          }
        } catch {
          // Benchmark failed for this backend, skip
          continue;
        }
      }

      if (results.length === 0 || !bestBenchResult) {
        throw new Error(b("所有引擎基准测试均失败", "All engine benchmarks failed"));
      }

      // Save best engine config
      const best = results[bestIdx];
      setBenchEntries(results);
      setBestEngine(best);
      setRecommendedTier(bestBenchResult.recommendedTier);
      setRecommendedModelId(bestBenchResult.recommendedModelId);
      setSelectedModelId(bestBenchResult.recommendedModelId);

      useSettingsStore.getState().setBuiltinComputeMode(best.computeMode as any);
      useSettingsStore.getState().setBuiltinGpuBackend(best.gpuBackend as any);
      useSettingsStore.getState().setBuiltinCudaVersion(best.cudaVersion as any);

      // Enter model selection phase
      setBenchPhase('selecting');
      setAiStep(null);
      setDownloadProgress(null);
    } catch (e: any) {
      const msg = typeof e === "string" ? e : e?.message || String(e);
      if (!/cancelled/i.test(msg)) setAiError(msg);
      setAiStep(null);
      setBenchPhase('idle');
    } finally {
      setLoading(false);
      setDownloadProgress(null);
    }
  };

  /** Install user-selected model and start service */
  const handleInstallModel = async () => {
    if (!bestEngine) return;
    cancelledRef.current = false;
    setAiError(null);
    setLoading(true);
    setBenchPhase('running');
    try {
      const s = useSettingsStore.getState();
      const { builtinGpuLayers, builtinDownloadUrls } = s;
      const modelId = selectedModelId;

      // Download model
      setAiStep(b("正在下载模型...", "Downloading model..."));
      await invoke("builtin_llm_install", {
        options: {
          modelId,
          mode: "auto",
          computeMode: bestEngine.computeMode,
          gpuBackend: bestEngine.gpuBackend,
          cudaVersion: bestEngine.cudaVersion,
          modelUrl: builtinDownloadUrls[modelId] || undefined,
        },
        onProgress: createCh(),
      });

      if (cancelledRef.current) throw new Error('cancelled');
      // Start service
      setAiStep(b("正在启动 AI 服务...", "Starting AI service..."));
      setDownloadProgress(null);
      await invoke("builtin_llm_ensure_running", {
        options: {
          modelId,
          mode: "auto",
          computeMode: bestEngine.computeMode,
          gpuBackend: bestEngine.gpuBackend,
          gpuLayers: builtinGpuLayers,
          cudaVersion: bestEngine.cudaVersion,
        },
        onProgress: createCh(),
      });

      // Save config
      useSettingsStore.getState().setBuiltinModelId(modelId);
      useSettingsStore.getState().setBuiltinAutoEnabled(true);
      useSettingsStore.getState().saveSettings();

      setBuiltinConfigured(true);
      setBenchPhase('idle');
      setAiStep(null);
    } catch (e: any) {
      const msg = typeof e === "string" ? e : e?.message || String(e);
      if (!/cancelled/i.test(msg)) setAiError(msg);
      setAiStep(null);
      setBenchPhase('selecting'); // go back to selection
    } finally {
      setLoading(false);
      setDownloadProgress(null);
    }
  };

  const handleFinish = () => {
    localStorage.setItem("aireader_setup_completed", "1");
    onComplete();
  };

  const handleSkipAI = () => {
    setStep("done");
  };

  const formatBytes = (b: number) => {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
    if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
    return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      {/* Background decorations */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 right-0 w-[700px] h-[500px] rounded-full bg-primary/[0.06] blur-[120px]" />
        <div className="absolute bottom-0 -left-20 w-[600px] h-[400px] rounded-full bg-primary/[0.04] blur-[100px]" />
      </div>

      <div className="relative w-full max-w-xl mx-auto px-6 max-h-[90vh] overflow-y-auto">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {(["welcome", "paths", "ai", "done"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors",
                step === s ? "bg-primary text-primary-foreground" :
                (["welcome", "paths", "ai", "done"].indexOf(step) > i ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground")
              )}>
                {i + 1}
              </div>
              {i < 3 && <div className={cn("w-8 h-px", ["welcome", "paths", "ai", "done"].indexOf(step) > i ? "bg-primary/40" : "bg-border")} />}
            </div>
          ))}
        </div>

        {/* Step: Welcome */}
        {step === "welcome" && (
          <div className="space-y-6 text-center">
            <div className="flex items-center justify-center gap-3">
              <BookOpen className="w-10 h-10 text-primary" strokeWidth={1.5} />
              <h1 className="text-3xl font-black uppercase tracking-wider">
                <span className="text-primary">Ai</span><span className="text-foreground/85">Reader</span>
              </h1>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed max-w-md mx-auto">
              {b("欢迎使用 AiReader！让我们花一分钟完成初始设置。", "Welcome to AiReader! Let's spend a minute on initial setup.")}
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <div className="flex rounded-lg border border-border overflow-hidden">
                <button type="button" onClick={() => { setUiLanguage("zh"); saveSettings(); }} className={cn("px-4 py-2 text-sm", uiLanguage === "zh" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                  中文
                </button>
                <button type="button" onClick={() => { setUiLanguage("en"); saveSettings(); }} className={cn("px-4 py-2 text-sm", uiLanguage === "en" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                  English
                </button>
              </div>
            </div>
            <Button size="lg" className="mt-4" onClick={() => setStep("paths")}>
              {b("开始设置", "Get Started")} <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}

        {/* Step: Paths */}
        {step === "paths" && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-bold">{b("选择存储路径", "Choose Storage Paths")}</h2>
              <p className="text-sm text-muted-foreground mt-1">{b("设置文档库和 AI 模型的存储位置", "Set where documents and AI models are stored")}</p>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-amber-500" />
                  {b("文档库目录", "Documents Library")}
                </label>
                <p className="text-xs text-muted-foreground">{b("导入的电子书、PDF 等文档副本存放在此处", "Imported ebooks, PDFs and document copies are stored here")}</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={documentsDir}
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-border bg-background/60 text-muted-foreground truncate"
                  />
                  <Button variant="outline" size="sm" onClick={async () => { const d = await pickDir(documentsDir); if (d) setDocumentsDir(d); }}>
                    {b("浏览", "Browse")}
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-purple-500/40 bg-purple-500/5 p-4 space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-500" />
                  {b("AI 模型目录", "AI Model Storage")}
                </label>
                <p className="text-xs text-muted-foreground">{b("AI 模型文件（GGUF）较大（0.5~19GB），请确保磁盘空间充足", "AI model files (GGUF) are large (0.5~19GB), ensure enough disk space")}</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={modelsDir}
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-border bg-background/60 text-muted-foreground truncate"
                  />
                  <Button variant="outline" size="sm" onClick={async () => { const d = await pickDir(modelsDir); if (d) setModelsDir(d); }}>
                    {b("浏览", "Browse")}
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep("welcome")}>
                <ChevronLeft className="w-4 h-4 mr-1" /> {b("上一步", "Back")}
              </Button>
              <Button onClick={handleSavePaths} disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                {b("下一步", "Next")} <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Step: AI Setup */}
        {step === "ai" && (
          <div className="space-y-5">
            <div className="text-center">
              <h2 className="text-xl font-bold">{b("配置 AI 服务", "Configure AI Service")}</h2>
              <p className="text-sm text-muted-foreground mt-1">{b("可同时配置多个 AI 来源，稍后在面板中切换", "Configure multiple AI providers, switch in panel later")}</p>
            </div>

            {/* Progress / error display for builtin setup */}
            {aiStep && (
              <div className="rounded-xl border border-border p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-5 h-5 text-primary animate-spin flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{aiStep}</div>
                    {downloadProgress?.label && (
                      <div className="text-[11px] text-muted-foreground mt-0.5">{downloadProgress.label}</div>
                    )}
                  </div>
                </div>
                {downloadProgress && downloadProgress.total && (
                  <div className="space-y-1">
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(100, (downloadProgress.written / downloadProgress.total) * 100)}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{formatBytes(downloadProgress.written)} / {formatBytes(downloadProgress.total)}</span>
                      {downloadProgress.speed != null && <span>{formatBytes(downloadProgress.speed)}/s</span>}
                    </div>
                  </div>
                )}
              </div>
            )}
            {aiError && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/[0.06] p-4 text-sm text-destructive flex items-start justify-between gap-2">
                <span>{aiError}</span>
                <Button variant="outline" size="sm" className="flex-shrink-0" onClick={() => { setAiError(null); handleQuickSetup(); }}>
                  {b("重试", "Retry")}
                </Button>
              </div>
            )}

            {/* Built-in AI — idle / configured state */}
            {!aiStep && benchPhase !== 'selecting' && (
              <div className={cn("rounded-xl border overflow-hidden", builtinConfigured ? "border-green-500/40 bg-green-500/[0.04]" : "border-primary/30 bg-primary/[0.03]")}>
                <div className="flex items-center gap-3 p-3">
                  {builtinConfigured ? <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" /> : <Zap className="w-5 h-5 text-primary flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{b("本地 AI", "Local AI")}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {builtinConfigured
                        ? b("已配置，后续启动自动运行", "Configured, will auto-start on launch")
                        : b("自动检测硬件、测试引擎性能、选择最优配置", "Auto-detect hardware, benchmark engines, find optimal config")}
                    </div>
                  </div>
                  {!builtinConfigured && (
                    <Button size="sm" onClick={handleQuickSetup} disabled={loading}>
                      <Zap className="w-3.5 h-3.5 mr-1" />{b("一键配置", "Quick Setup")}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Model selection UI — shown after benchmark completes */}
            {benchPhase === 'selecting' && !aiStep && (
              <div className="space-y-4">
                {/* Benchmark results summary */}
                <div className="rounded-xl border border-primary/30 bg-primary/[0.03] p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">{b("引擎性能测试结果", "Engine Benchmark Results")}</span>
                  </div>
                  <div className="grid gap-1.5">
                    {benchEntries.map((entry, i) => (
                      <div key={i} className={cn(
                        "flex items-center justify-between px-3 py-1.5 rounded-lg text-xs",
                        entry === bestEngine ? "bg-primary/10 text-primary font-medium" : "bg-muted/40 text-muted-foreground"
                      )}>
                        <span className="flex items-center gap-1.5">
                          {entry === bestEngine && <Award className="w-3 h-3" />}
                          {entry.label}
                        </span>
                        <span className="font-mono">{entry.tps.toFixed(1)} tok/s</span>
                      </div>
                    ))}
                  </div>
                  {bestEngine && (
                    <div className="text-[11px] text-muted-foreground">
                      {b(`最优引擎: ${bestEngine.label} (${bestEngine.tps.toFixed(1)} tok/s)`, `Best engine: ${bestEngine.label} (${bestEngine.tps.toFixed(1)} tok/s)`)}
                    </div>
                  )}
                </div>

                {/* Model selection list */}
                <div className="rounded-xl border border-border overflow-hidden">
                  <div className="px-4 py-2.5 bg-muted/30 border-b border-border">
                    <span className="text-sm font-medium">{b("选择 AI 模型", "Choose AI Model")}</span>
                    <span className="text-[11px] text-muted-foreground ml-2">{b("模型越大翻译越好，但需要更多资源", "Larger models translate better but need more resources")}</span>
                  </div>
                  <div className="divide-y divide-border">
                    {BUILTIN_MODELS.map((m: BuiltinModelDef) => {
                      const isRecommended = m.id === recommendedModelId;
                      const isSelected = m.id === selectedModelId;
                      const isTooLarge = m.tier > recommendedTier;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setSelectedModelId(m.id)}
                          className={cn(
                            "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
                            isSelected ? "bg-primary/[0.08]" : "hover:bg-muted/30",
                          )}
                        >
                          {/* Radio indicator */}
                          <div className={cn(
                            "w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                            isSelected ? "border-primary" : "border-muted-foreground/30"
                          )}>
                            {isSelected && <div className="w-2 h-2 rounded-full bg-primary" />}
                          </div>

                          {/* Model info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={cn("text-sm font-medium", isSelected && "text-primary")}>{m.title}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Q4_K_M</span>
                              {isRecommended && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-medium flex items-center gap-0.5">
                                  <Award className="w-2.5 h-2.5" />{b("推荐", "Best")}
                                </span>
                              )}
                              {isTooLarge && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 flex items-center gap-0.5">
                                  <AlertTriangle className="w-2.5 h-2.5" />{b("可能较慢", "May be slow")}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              {b(m.ramHintZh, m.ramHintEn)}
                            </div>
                          </div>

                          {/* Tier badge */}
                          <div className={cn(
                            "text-[10px] font-mono px-2 py-1 rounded flex-shrink-0",
                            m.tier <= 1 ? "bg-green-500/10 text-green-600" :
                            m.tier <= 3 ? "bg-blue-500/10 text-blue-600" :
                            "bg-purple-500/10 text-purple-600"
                          )}>
                            T{m.tier + 1}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Install button */}
                <div className="flex justify-between gap-2">
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={async () => { await cancelSetup(); setStep("paths"); }}>
                      <ChevronLeft className="w-4 h-4 mr-1" /> {b("上一步", "Back")}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={async () => { await cancelSetup(); handleSkipAI(); }}>
                      {b("跳过", "Skip")}
                    </Button>
                  </div>
                  <Button size="sm" onClick={handleInstallModel} disabled={loading}>
                    <HardDrive className="w-3.5 h-3.5 mr-1.5" />
                    {b("安装并启动", "Install & Start")}
                  </Button>
                </div>
              </div>
            )}

            {/* Ollama */}
            {!aiStep && benchPhase !== 'selecting' && (
              <div className={cn("rounded-xl border overflow-hidden", ollamaConfigured ? "border-green-500/40 bg-green-500/[0.04]" : "border-border")}>
                <button type="button" onClick={() => setShowOllama(!showOllama)} className="w-full flex items-center gap-3 p-3 hover:bg-muted/20 transition-colors text-left">
                  {ollamaConfigured ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Server className="w-4 h-4 text-muted-foreground" />}
                  <span className="text-sm flex-1">{b("Ollama 服务", "Ollama Service")}</span>
                  {ollamaConfigured && <span className="text-[10px] text-green-600 mr-1">{b("已配置", "Configured")}</span>}
                  <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", showOllama && "rotate-180")} />
                </button>
                {showOllama && (
                  <div className="px-3 pb-3 space-y-2 border-t border-border pt-3">
                    <div>
                      <label className="text-xs text-muted-foreground">{b("Ollama 地址", "Ollama URL")}</label>
                      <input type="text" value={localOllamaUrl} onChange={e => { setLocalOllamaUrl(e.target.value); setOllamaTestStatus('idle'); }} className="w-full mt-1 px-3 py-1.5 text-sm rounded-lg border border-border bg-background" placeholder="http://localhost:11434" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">{b("模型名称", "Model Name")}</label>
                      <input type="text" value={localOllamaModel} onChange={e => setLocalOllamaModel(e.target.value)} className="w-full mt-1 px-3 py-1.5 text-sm rounded-lg border border-border bg-background" placeholder="qwen3:8b" />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1" onClick={async () => {
                        setOllamaTestStatus('testing');
                        try {
                          const ok = await invoke<boolean>('ollama_test_connection', { baseUrl: localOllamaUrl });
                          setOllamaTestStatus(ok ? 'ok' : 'fail');
                        } catch { setOllamaTestStatus('fail'); }
                      }} disabled={ollamaTestStatus === 'testing'}>
                        {ollamaTestStatus === 'testing' ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Wifi className="w-3 h-3 mr-1" />}
                        {ollamaTestStatus === 'ok' ? b('连接成功 ✓', 'Connected ✓') : ollamaTestStatus === 'fail' ? b('连接失败 ✗', 'Failed ✗') : b('测试连接', 'Test')}
                      </Button>
                      <Button size="sm" className="flex-1" onClick={() => {
                        const s = useSettingsStore.getState();
                        s.setOllamaUrl(localOllamaUrl);
                        s.setOllamaModel(localOllamaModel);
                        s.saveSettings();
                        setOllamaConfigured(true);
                      }}>
                        {b("保存配置", "Save")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* OpenAI-compatible API */}
            {!aiStep && benchPhase !== 'selecting' && (
              <div className={cn("rounded-xl border overflow-hidden", apiConfigured ? "border-green-500/40 bg-green-500/[0.04]" : "border-border")}>
                <button type="button" onClick={() => setShowOpenAI(!showOpenAI)} className="w-full flex items-center gap-3 p-3 hover:bg-muted/20 transition-colors text-left">
                  {apiConfigured ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Globe className="w-4 h-4 text-muted-foreground" />}
                  <span className="text-sm flex-1">{b("OpenAI 兼容 API", "OpenAI-compatible API")}</span>
                  {apiConfigured && <span className="text-[10px] text-green-600 mr-1">{b("已配置", "Configured")}</span>}
                  <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", showOpenAI && "rotate-180")} />
                </button>
                {showOpenAI && (
                  <div className="px-3 pb-3 space-y-2 border-t border-border pt-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Base URL</label>
                      <input type="text" value={localApiUrl} onChange={e => { setLocalApiUrl(e.target.value); setApiTestStatus('idle'); }} className="w-full mt-1 px-3 py-1.5 text-sm rounded-lg border border-border bg-background" placeholder="https://api.openai.com/v1" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">API Key</label>
                      <input type="password" value={localApiKey} onChange={e => { setLocalApiKey(e.target.value); setApiTestStatus('idle'); }} className="w-full mt-1 px-3 py-1.5 text-sm rounded-lg border border-border bg-background" placeholder="sk-..." />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">{b("模型", "Model")}</label>
                      <input type="text" value={localApiModel} onChange={e => setLocalApiModel(e.target.value)} className="w-full mt-1 px-3 py-1.5 text-sm rounded-lg border border-border bg-background" placeholder="gpt-4o-mini" />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1" onClick={async () => {
                        setApiTestStatus('testing');
                        try {
                          const resp = await fetch(`${localApiUrl.replace(/\/+$/, '')}/models`, {
                            headers: localApiKey ? { Authorization: `Bearer ${localApiKey}` } : {},
                          });
                          setApiTestStatus(resp.ok ? 'ok' : 'fail');
                        } catch { setApiTestStatus('fail'); }
                      }} disabled={apiTestStatus === 'testing'}>
                        {apiTestStatus === 'testing' ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Wifi className="w-3 h-3 mr-1" />}
                        {apiTestStatus === 'ok' ? b('连接成功 ✓', 'Connected ✓') : apiTestStatus === 'fail' ? b('连接失败 ✗', 'Failed ✗') : b('测试连接', 'Test')}
                      </Button>
                      <Button size="sm" className="flex-1" onClick={() => {
                        const s = useSettingsStore.getState();
                        s.setOpenAICompatibleBaseUrl(localApiUrl);
                        s.setOpenAICompatibleApiKey(localApiKey);
                        s.setOpenAICompatibleModel(localApiModel);
                        s.saveSettings();
                        setApiConfigured(true);
                      }}>
                        {b("保存配置", "Save")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {benchPhase !== 'selecting' && (
              <div className="flex justify-between pt-2">
                <Button variant="ghost" onClick={async () => { await cancelSetup(); setAiStep(null); setDownloadProgress(null); setBenchPhase('idle'); setStep("paths"); }}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> {b("上一步", "Back")}
                </Button>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={async () => { await cancelSetup(); setAiStep(null); setDownloadProgress(null); setBenchPhase('idle'); handleSkipAI(); }}>
                    {b("跳过", "Skip")}
                  </Button>
                  {(builtinConfigured || ollamaConfigured || apiConfigured) && (
                    <Button onClick={() => setStep("done")}>
                      {b("下一步", "Next")} <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && (
          <div className="space-y-6 text-center">
            <Check className="w-16 h-16 text-primary mx-auto" />
            <h2 className="text-xl font-bold">{b("设置完成！", "Setup Complete!")}</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {(builtinConfigured || ollamaConfigured || apiConfigured)
                ? b("一切就绪。打开文档，选中文字即可翻译和解释。", "All set! Open a document, select text to translate and explain.")
                : b("你可以稍后在设置中配置 AI。", "You can configure AI later in Settings.")}
            </p>
            <Button size="lg" onClick={handleFinish}>
              {b("开始使用", "Start Reading")} <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
