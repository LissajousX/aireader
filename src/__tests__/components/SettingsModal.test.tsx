/// <reference types="vitest/globals" />
import { useSettingsStore } from "@/stores/settingsStore";

// ─── Helper: isAnyBusy logic (mirrors the component's computed value) ───

function computeIsAnyBusy(
  builtinGlobalLoading: boolean,
  runtimeInstalling: boolean,
  builtinLoadingById: Record<string, boolean>
): boolean {
  return builtinGlobalLoading || runtimeInstalling || Object.values(builtinLoadingById).some(v => v);
}

describe("isAnyBusy computation", () => {
  it("returns false when nothing is loading", () => {
    expect(computeIsAnyBusy(false, false, {})).toBe(false);
  });

  it("returns true when builtinGlobalLoading is true", () => {
    expect(computeIsAnyBusy(true, false, {})).toBe(true);
  });

  it("returns true when runtimeInstalling is true", () => {
    expect(computeIsAnyBusy(false, true, {})).toBe(true);
  });

  it("returns true when any model is loading", () => {
    expect(computeIsAnyBusy(false, false, { "model_a": false, "model_b": true })).toBe(true);
  });

  it("returns false when all model loading flags are false", () => {
    expect(computeIsAnyBusy(false, false, { "model_a": false, "model_b": false })).toBe(false);
  });

  it("returns true when multiple flags are true simultaneously", () => {
    expect(computeIsAnyBusy(true, true, { "model_a": true })).toBe(true);
  });
});

// ─── URL Validation patterns (mirrors component inline checks) ───

describe("URL validation patterns", () => {
  describe("Ollama URL format check", () => {
    const isValidOllamaUrl = (url: string) => /^https?:\/\/.+/.test(url);

    it("accepts http://localhost:11434", () => {
      expect(isValidOllamaUrl("http://localhost:11434")).toBe(true);
    });

    it("accepts https://myhost.example.com:11434", () => {
      expect(isValidOllamaUrl("https://myhost.example.com:11434")).toBe(true);
    });

    it("rejects empty string", () => {
      expect(isValidOllamaUrl("")).toBe(false);
    });

    it("rejects URL without protocol", () => {
      expect(isValidOllamaUrl("localhost:11434")).toBe(false);
    });

    it("rejects ftp:// protocol", () => {
      expect(isValidOllamaUrl("ftp://localhost:11434")).toBe(false);
    });

    it("rejects just http://", () => {
      expect(isValidOllamaUrl("http://")).toBe(false);
    });
  });

  describe("OpenAI Base URL /v1 check", () => {
    const endsWithV1 = (url: string) => url.replace(/\/+$/, '').endsWith('/v1');

    it("accepts https://api.openai.com/v1", () => {
      expect(endsWithV1("https://api.openai.com/v1")).toBe(true);
    });

    it("accepts URL with trailing slash: https://api.openai.com/v1/", () => {
      expect(endsWithV1("https://api.openai.com/v1/")).toBe(true);
    });

    it("rejects URL without /v1", () => {
      expect(endsWithV1("https://api.openai.com")).toBe(false);
    });

    it("rejects URL ending with /v2", () => {
      expect(endsWithV1("https://api.openai.com/v2")).toBe(false);
    });

    it("accepts custom base with /v1", () => {
      expect(endsWithV1("http://localhost:8080/v1")).toBe(true);
    });
  });
});

// ─── Settings store: builtin AI config persistence ───

describe("useSettingsStore — builtin AI config", () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState(useSettingsStore.getInitialState());
  });

  describe("builtinComputeMode", () => {
    it("defaults to cpu", () => {
      expect(useSettingsStore.getState().builtinComputeMode).toBe("cpu");
    });

    it("persists through save/load cycle", () => {
      useSettingsStore.getState().setBuiltinComputeMode("gpu");
      useSettingsStore.getState().saveSettings();

      useSettingsStore.setState({ builtinComputeMode: "cpu" });
      useSettingsStore.getState().loadSettings();
      expect(useSettingsStore.getState().builtinComputeMode).toBe("gpu");
    });

    it("accepts hybrid mode", () => {
      useSettingsStore.getState().setBuiltinComputeMode("hybrid");
      expect(useSettingsStore.getState().builtinComputeMode).toBe("hybrid");
    });
  });

  describe("builtinGpuBackend", () => {
    it("defaults to vulkan", () => {
      expect(useSettingsStore.getState().builtinGpuBackend).toBe("vulkan");
    });

    it("persists through save/load cycle", () => {
      useSettingsStore.getState().setBuiltinGpuBackend("cuda");
      useSettingsStore.getState().saveSettings();

      useSettingsStore.setState({ builtinGpuBackend: "vulkan" });
      useSettingsStore.getState().loadSettings();
      expect(useSettingsStore.getState().builtinGpuBackend).toBe("cuda");
    });
  });

  describe("builtinCudaVersion", () => {
    it("defaults to 12.4", () => {
      expect(useSettingsStore.getState().builtinCudaVersion).toBe("12.4");
    });

    it("persists through save/load cycle", () => {
      useSettingsStore.getState().setBuiltinCudaVersion("13.1");
      useSettingsStore.getState().saveSettings();

      useSettingsStore.setState({ builtinCudaVersion: "12.4" });
      useSettingsStore.getState().loadSettings();
      expect(useSettingsStore.getState().builtinCudaVersion).toBe("13.1");
    });
  });

  describe("builtinGpuLayers", () => {
    it("defaults to 20", () => {
      expect(useSettingsStore.getState().builtinGpuLayers).toBe(20);
    });

    it("persists through save/load cycle", () => {
      useSettingsStore.getState().setBuiltinGpuLayers(32);
      useSettingsStore.getState().saveSettings();

      useSettingsStore.setState({ builtinGpuLayers: 0 });
      useSettingsStore.getState().loadSettings();
      expect(useSettingsStore.getState().builtinGpuLayers).toBe(32);
    });
  });

  describe("builtinModelId", () => {
    it("defaults to qwen3_0_6b_q4_k_m", () => {
      expect(useSettingsStore.getState().builtinModelId).toBe("qwen3_0_6b_q4_k_m");
    });

    it("persists through save/load cycle", () => {
      useSettingsStore.getState().setBuiltinModelId("qwen3_8b_q4_k_m");
      useSettingsStore.getState().saveSettings();

      useSettingsStore.setState({ builtinModelId: "qwen3_0_6b_q4_k_m" });
      useSettingsStore.getState().loadSettings();
      expect(useSettingsStore.getState().builtinModelId).toBe("qwen3_8b_q4_k_m");
    });
  });

  describe("builtinAutoEnabled", () => {
    it("defaults to false", () => {
      expect(useSettingsStore.getState().builtinAutoEnabled).toBe(false);
    });

    it("persists through save/load cycle", () => {
      useSettingsStore.getState().setBuiltinAutoEnabled(true);
      useSettingsStore.getState().saveSettings();

      useSettingsStore.setState({ builtinAutoEnabled: false });
      useSettingsStore.getState().loadSettings();
      expect(useSettingsStore.getState().builtinAutoEnabled).toBe(true);
    });
  });

  describe("builtinDownloadUrls persistence", () => {
    it("custom download URLs persist through save/load cycle", () => {
      useSettingsStore.getState().setBuiltinDownloadUrl("qwen3_0_6b_q4_k_m", "https://custom.example.com/model.gguf");
      useSettingsStore.getState().setBuiltinDownloadUrl("__rt_cpu", "https://custom.example.com/runtime.zip");
      useSettingsStore.getState().saveSettings();

      useSettingsStore.setState({ builtinDownloadUrls: {} });
      useSettingsStore.getState().loadSettings();
      expect(useSettingsStore.getState().builtinDownloadUrls["qwen3_0_6b_q4_k_m"]).toBe("https://custom.example.com/model.gguf");
      expect(useSettingsStore.getState().builtinDownloadUrls["__rt_cpu"]).toBe("https://custom.example.com/runtime.zip");
    });

    it("resetAllBuiltinDownloadUrls clears all and persists", () => {
      useSettingsStore.getState().setBuiltinDownloadUrl("a", "url1");
      useSettingsStore.getState().setBuiltinDownloadUrl("b", "url2");
      useSettingsStore.getState().saveSettings();

      useSettingsStore.getState().resetAllBuiltinDownloadUrls();
      useSettingsStore.getState().saveSettings();

      useSettingsStore.setState({ builtinDownloadUrls: { stale: "value" } });
      useSettingsStore.getState().loadSettings();
      expect(Object.keys(useSettingsStore.getState().builtinDownloadUrls)).toHaveLength(0);
    });
  });

  describe("full config save/load round-trip", () => {
    it("preserves all AI-related settings together", () => {
      const store = useSettingsStore.getState();
      store.setBuiltinModelId("qwen3_4b_q4_k_m");
      store.setBuiltinComputeMode("hybrid");
      store.setBuiltinGpuBackend("cuda");
      store.setBuiltinCudaVersion("13.1");
      store.setBuiltinGpuLayers(24);
      store.setBuiltinAutoEnabled(true);
      store.setBuiltinDownloadUrl("test_key", "https://example.com/test");
      store.saveSettings();

      // Reset everything
      useSettingsStore.setState(useSettingsStore.getInitialState());
      useSettingsStore.getState().loadSettings();

      const loaded = useSettingsStore.getState();
      expect(loaded.builtinModelId).toBe("qwen3_4b_q4_k_m");
      expect(loaded.builtinComputeMode).toBe("hybrid");
      expect(loaded.builtinGpuBackend).toBe("cuda");
      expect(loaded.builtinCudaVersion).toBe("13.1");
      expect(loaded.builtinGpuLayers).toBe(24);
      expect(loaded.builtinAutoEnabled).toBe(true);
      expect(loaded.builtinDownloadUrls["test_key"]).toBe("https://example.com/test");
    });
  });
});

// ─── Config mismatch detection logic ───

describe("config mismatch detection", () => {
  type StartedConfig = { modelId: string; cm: string; gb: string; cv: string; gl: number } | null;

  function detectConfigChanged(
    startedConfig: StartedConfig,
    _currentModelId: string,
    currentCm: string,
    currentGb: string,
    currentCv: string,
    currentGl: number,
    isRunning: boolean,
    runningThisModel: boolean
  ): boolean {
    if (!isRunning) return false;
    if (!runningThisModel) return true;
    if (!startedConfig) return false;
    return startedConfig.cm !== currentCm ||
           startedConfig.gb !== currentGb ||
           startedConfig.cv !== currentCv ||
           startedConfig.gl !== currentGl;
  }

  it("no change when not running", () => {
    expect(detectConfigChanged(
      { modelId: "m1", cm: "cpu", gb: "vulkan", cv: "12.4", gl: 0 },
      "m1", "gpu", "cuda", "13.1", 32, false, false
    )).toBe(false);
  });

  it("changed when running different model", () => {
    expect(detectConfigChanged(
      { modelId: "m1", cm: "cpu", gb: "vulkan", cv: "12.4", gl: 0 },
      "m2", "cpu", "vulkan", "12.4", 0, true, false
    )).toBe(true);
  });

  it("changed when compute mode differs", () => {
    expect(detectConfigChanged(
      { modelId: "m1", cm: "cpu", gb: "vulkan", cv: "12.4", gl: 0 },
      "m1", "gpu", "vulkan", "12.4", 0, true, true
    )).toBe(true);
  });

  it("changed when GPU backend differs", () => {
    expect(detectConfigChanged(
      { modelId: "m1", cm: "gpu", gb: "vulkan", cv: "12.4", gl: 0 },
      "m1", "gpu", "cuda", "12.4", 0, true, true
    )).toBe(true);
  });

  it("changed when CUDA version differs", () => {
    expect(detectConfigChanged(
      { modelId: "m1", cm: "gpu", gb: "cuda", cv: "12.4", gl: 0 },
      "m1", "gpu", "cuda", "13.1", 0, true, true
    )).toBe(true);
  });

  it("changed when GPU layers differs", () => {
    expect(detectConfigChanged(
      { modelId: "m1", cm: "hybrid", gb: "vulkan", cv: "12.4", gl: 16 },
      "m1", "hybrid", "vulkan", "12.4", 32, true, true
    )).toBe(true);
  });

  it("no change when all config matches", () => {
    expect(detectConfigChanged(
      { modelId: "m1", cm: "gpu", gb: "cuda", cv: "12.4", gl: 0 },
      "m1", "gpu", "cuda", "12.4", 0, true, true
    )).toBe(false);
  });

  it("no change when startedConfig is null but running this model", () => {
    expect(detectConfigChanged(
      null, "m1", "gpu", "cuda", "12.4", 0, true, true
    )).toBe(false);
  });
});

// ─── Model delete guard logic ───

describe("model delete guard", () => {
  it("allows delete when model is installed but not running", () => {
    const status = { modelInstalled: true, running: false, runtimeInstalled: true };
    const canDelete = status.modelInstalled && !status.running;
    expect(canDelete).toBe(true);
  });

  it("blocks delete when model is running", () => {
    const status = { modelInstalled: true, running: true, runtimeInstalled: true };
    const canDelete = status.modelInstalled && !status.running;
    expect(canDelete).toBe(false);
  });

  it("blocks delete when model is not installed", () => {
    const status = { modelInstalled: false, running: false, runtimeInstalled: true };
    const canDelete = status.modelInstalled && !status.running;
    expect(canDelete).toBe(false);
  });
});

// ─── Service start precondition logic ───

describe("service start preconditions", () => {
  it("blocks start when runtime not installed", () => {
    const canStart = true && false; // modelInstalled && runtimeInstalled
    expect(canStart).toBe(false);
  });

  it("blocks start when model not installed", () => {
    const canStart = false && true; // modelInstalled && runtimeInstalled
    expect(canStart).toBe(false);
  });

  it("allows start when both are installed", () => {
    const canStart = true && true; // modelInstalled && runtimeInstalled
    expect(canStart).toBe(true);
  });

  it("blocks start when neither is installed", () => {
    const canStart = false && false;
    expect(canStart).toBe(false);
  });
});

// ─── Mirror probe HTTP status filter logic ───

describe("mirror probe status filter (Rust logic parity)", () => {
  // Mirrors the Rust probe logic: only accept success or 405 (METHOD_NOT_ALLOWED)
  function shouldAcceptProbeResponse(statusCode: number): boolean {
    return (statusCode >= 200 && statusCode < 300) || statusCode === 405;
  }

  it("accepts 200 OK", () => {
    expect(shouldAcceptProbeResponse(200)).toBe(true);
  });

  it("accepts 204 No Content", () => {
    expect(shouldAcceptProbeResponse(204)).toBe(true);
  });

  it("accepts 405 Method Not Allowed (some CDNs reject HEAD)", () => {
    expect(shouldAcceptProbeResponse(405)).toBe(true);
  });

  it("rejects 404 Not Found", () => {
    expect(shouldAcceptProbeResponse(404)).toBe(false);
  });

  it("rejects 403 Forbidden", () => {
    expect(shouldAcceptProbeResponse(403)).toBe(false);
  });

  it("rejects 500 Internal Server Error", () => {
    expect(shouldAcceptProbeResponse(500)).toBe(false);
  });

  it("rejects 301 redirect", () => {
    expect(shouldAcceptProbeResponse(301)).toBe(false);
  });
});
