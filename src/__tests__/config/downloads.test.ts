/// <reference types="vitest/globals" />
import {
  BUILTIN_MODELS,
  RUNTIME_ENTRIES,
  getRuntimeDownloads,
  getModelDisplayName,
  TIER_ORDER_DESC,
} from "@/config/downloads";

describe("BUILTIN_MODELS", () => {
  it("has 6 models defined", () => {
    expect(BUILTIN_MODELS).toHaveLength(6);
  });

  it("each model has required fields", () => {
    for (const m of BUILTIN_MODELS) {
      expect(m.id).toBeTruthy();
      expect(m.title).toBeTruthy();
      expect(m.urls).toHaveLength(2);
      expect(m.urls[0]).toMatch(/^https:\/\//);
      expect(m.urls[1]).toMatch(/^https:\/\//);
      expect(typeof m.tier).toBe("number");
      expect(m.tier).toBeGreaterThanOrEqual(0);
    }
  });

  it("has unique model IDs", () => {
    const ids = BUILTIN_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique tiers", () => {
    const tiers = BUILTIN_MODELS.map((m) => m.tier);
    expect(new Set(tiers).size).toBe(tiers.length);
  });

  it("models are sorted by tier ascending (0→5)", () => {
    for (let i = 1; i < BUILTIN_MODELS.length; i++) {
      expect(BUILTIN_MODELS[i].tier).toBeGreaterThan(BUILTIN_MODELS[i - 1].tier);
    }
  });

  it("URLs use modelscope first, huggingface second", () => {
    for (const m of BUILTIN_MODELS) {
      expect(m.urls[0]).toContain("modelscope");
      expect(m.urls[1]).toContain("huggingface");
    }
  });

  it("all URLs end with .gguf", () => {
    for (const m of BUILTIN_MODELS) {
      expect(m.urls[0]).toMatch(/\.gguf$/);
      expect(m.urls[1]).toMatch(/\.gguf$/);
    }
  });
});

describe("RUNTIME_ENTRIES", () => {
  it("has at least 5 entries (cpu, vulkan, metal, cuda12.4, cuda13.1)", () => {
    expect(RUNTIME_ENTRIES.length).toBeGreaterThanOrEqual(5);
  });

  it("each entry has a key and label", () => {
    for (const e of RUNTIME_ENTRIES) {
      expect(e.key).toBeTruthy();
      expect(e.label).toBeTruthy();
    }
  });

  it("Windows has CPU, Vulkan, CUDA entries", () => {
    const winKeys = RUNTIME_ENTRIES.filter((e) => e.urls.windows != null).map((e) => e.key);
    expect(winKeys).toContain("__rt_cpu");
    expect(winKeys).toContain("__rt_vulkan");
    expect(winKeys).toContain("__rt_cuda_12.4");
    expect(winKeys).toContain("__rt_cuda_13.1");
  });

  it("Linux has CPU and Vulkan entries, no CUDA/Metal", () => {
    const linuxKeys = RUNTIME_ENTRIES.filter((e) => e.urls.linux != null).map((e) => e.key);
    expect(linuxKeys).toContain("__rt_cpu");
    expect(linuxKeys).toContain("__rt_vulkan");
    expect(linuxKeys).not.toContain("__rt_cuda_12.4");
    expect(linuxKeys).not.toContain("__rt_metal");
  });

  it("macOS has no Vulkan or CUDA entries", () => {
    const macKeys = RUNTIME_ENTRIES.filter((e) => e.urls.macos != null).map((e) => e.key);
    expect(macKeys).not.toContain("__rt_vulkan");
    expect(macKeys).not.toContain("__rt_cuda_12.4");
  });
});

describe("getRuntimeDownloads", () => {
  it("returns only entries relevant for the given platform", () => {
    const win = getRuntimeDownloads("windows");
    expect(win.length).toBeGreaterThan(0);
    for (const entry of win) {
      expect(entry.key).toBeTruthy();
      expect(entry.label).toBeTruthy();
      expect(entry.defaultUrl).toMatch(/^https:\/\//);
    }
  });

  it("linux entries use .tar.gz", () => {
    const linux = getRuntimeDownloads("linux");
    for (const entry of linux) {
      if (entry.key.startsWith("__rt_")) {
        expect(entry.defaultUrl).toMatch(/\.tar\.gz$/);
      }
    }
  });

  it("windows entries use .zip", () => {
    const win = getRuntimeDownloads("windows");
    for (const entry of win) {
      expect(entry.defaultUrl).toMatch(/\.zip$/);
    }
  });
});

describe("getModelDisplayName", () => {
  it("returns display name for valid model ID", () => {
    expect(getModelDisplayName("qwen3_0_6b_q4_k_m")).toBe("Qwen3-0.6B (Q4_K_M)");
    expect(getModelDisplayName("qwen3_8b_q4_k_m")).toBe("Qwen3-8B (Q4_K_M)");
  });

  it("returns null for unknown model ID", () => {
    expect(getModelDisplayName("nonexistent")).toBeNull();
  });
});

describe("TIER_ORDER_DESC", () => {
  it("is sorted from highest tier to lowest", () => {
    const tiers = TIER_ORDER_DESC.map(
      (id) => BUILTIN_MODELS.find((m) => m.id === id)!.tier
    );
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i]).toBeLessThanOrEqual(tiers[i - 1]);
    }
  });

  it("contains all model IDs", () => {
    expect(TIER_ORDER_DESC).toHaveLength(BUILTIN_MODELS.length);
    for (const m of BUILTIN_MODELS) {
      expect(TIER_ORDER_DESC).toContain(m.id);
    }
  });
});
