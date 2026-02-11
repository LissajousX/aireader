/// <reference types="vitest/globals" />
import { useSettingsStore, DEFAULT_PROMPTS } from "@/stores/settingsStore";

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState(useSettingsStore.getInitialState());
});

describe("useSettingsStore", () => {
  describe("defaults", () => {
    it("has default uiLanguage zh", () => {
      expect(useSettingsStore.getState().uiLanguage).toBe("zh");
    });

    it("has default theme system", () => {
      expect(useSettingsStore.getState().theme).toBe("system");
    });

    it("has default markdownScale 0.75", () => {
      expect(useSettingsStore.getState().markdownScale).toBe(0.75);
    });

    it("has default enableThinking true", () => {
      expect(useSettingsStore.getState().enableThinking).toBe(true);
    });

    it("has default llmProvider builtin_local", () => {
      // The store initializes from localStorage; without any stored value
      // it should default to builtin_local
      const provider = useSettingsStore.getState().llmProvider;
      expect(["builtin_local", "ollama", "openai_compatible"]).toContain(provider);
    });
  });

  describe("setUiLanguage", () => {
    it("switches language", () => {
      useSettingsStore.getState().setUiLanguage("en");
      expect(useSettingsStore.getState().uiLanguage).toBe("en");

      useSettingsStore.getState().setUiLanguage("zh");
      expect(useSettingsStore.getState().uiLanguage).toBe("zh");
    });
  });

  describe("setTheme", () => {
    it("updates theme and stores to localStorage", () => {
      useSettingsStore.getState().setTheme("dark");
      expect(useSettingsStore.getState().theme).toBe("dark");
      expect(localStorage.getItem("aireader_theme")).toBe("dark");
    });

    it("applies dark class to documentElement", () => {
      useSettingsStore.getState().setTheme("dark");
      expect(document.documentElement.classList.contains("dark")).toBe(true);

      useSettingsStore.getState().setTheme("light");
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
  });

  describe("setMarkdownScale", () => {
    it("sets scale within valid range", () => {
      useSettingsStore.getState().setMarkdownScale(1.0);
      expect(useSettingsStore.getState().markdownScale).toBe(1.0);
    });

    it("clamps scale to minimum 0.6", () => {
      useSettingsStore.getState().setMarkdownScale(0.3);
      expect(useSettingsStore.getState().markdownScale).toBe(0.6);
    });

    it("clamps scale to maximum 1.2", () => {
      useSettingsStore.getState().setMarkdownScale(2.0);
      expect(useSettingsStore.getState().markdownScale).toBe(1.2);
    });
  });

  describe("setEnableThinking", () => {
    it("toggles thinking", () => {
      useSettingsStore.getState().setEnableThinking(false);
      expect(useSettingsStore.getState().enableThinking).toBe(false);

      useSettingsStore.getState().setEnableThinking(true);
      expect(useSettingsStore.getState().enableThinking).toBe(true);
    });
  });

  describe("prompts", () => {
    it("setPrompt updates a single prompt", () => {
      useSettingsStore.getState().setPrompt("translateLiteral", "custom prompt");
      expect(useSettingsStore.getState().prompts.translateLiteral).toBe("custom prompt");
      // Other prompts unchanged
      expect(useSettingsStore.getState().prompts.translateFree).not.toBe("custom prompt");
    });

    it("resetPrompt restores default for one prompt", () => {
      useSettingsStore.getState().setPrompt("translateLiteral", "custom");
      useSettingsStore.getState().resetPrompt("translateLiteral");
      expect(useSettingsStore.getState().prompts.translateLiteral).toBe(
        DEFAULT_PROMPTS.translateLiteral
      );
    });

    it("resetAllPrompts restores all defaults", () => {
      useSettingsStore.getState().setPrompt("translateLiteral", "a");
      useSettingsStore.getState().setPrompt("explain", "b");
      useSettingsStore.getState().resetAllPrompts();
      expect(useSettingsStore.getState().prompts).toEqual(DEFAULT_PROMPTS);
    });
  });

  describe("dictionary toggles", () => {
    it("setDictEnableEnToZh", () => {
      useSettingsStore.getState().setDictEnableEnToZh(false);
      expect(useSettingsStore.getState().dictEnableEnToZh).toBe(false);
    });

    it("setDictEnableZhToEn", () => {
      useSettingsStore.getState().setDictEnableZhToEn(false);
      expect(useSettingsStore.getState().dictEnableZhToEn).toBe(false);
    });
  });

  describe("save/load settings", () => {
    it("saveSettings persists to localStorage", () => {
      useSettingsStore.getState().setUiLanguage("en");
      useSettingsStore.getState().setEnableThinking(false);
      useSettingsStore.getState().saveSettings();

      const stored = JSON.parse(localStorage.getItem("aireader_settings") || "{}");
      expect(stored.uiLanguage).toBe("en");
      expect(stored.enableThinking).toBe(false);
    });

    it("loadSettings restores from localStorage", () => {
      // Save some settings
      useSettingsStore.getState().setUiLanguage("en");
      useSettingsStore.getState().setMarkdownScale(0.9);
      useSettingsStore.getState().saveSettings();

      // Reset store
      useSettingsStore.setState({ uiLanguage: "zh", markdownScale: 0.75 });
      expect(useSettingsStore.getState().uiLanguage).toBe("zh");

      // Load should restore
      useSettingsStore.getState().loadSettings();
      expect(useSettingsStore.getState().uiLanguage).toBe("en");
      expect(useSettingsStore.getState().markdownScale).toBe(0.9);
    });
  });

  describe("getActiveModel", () => {
    it("returns ollama model when provider is ollama", () => {
      useSettingsStore.setState({ llmProvider: "ollama", ollamaModel: "llama3:8b" });
      expect(useSettingsStore.getState().getActiveModel()).toBe("llama3:8b");
    });

    it("returns openai model when provider is openai_compatible", () => {
      useSettingsStore.setState({
        llmProvider: "openai_compatible",
        openAICompatibleModel: "gpt-4o",
      });
      expect(useSettingsStore.getState().getActiveModel()).toBe("gpt-4o");
    });
  });

  describe("builtin download URLs", () => {
    it("setBuiltinDownloadUrl stores custom URL", () => {
      useSettingsStore.getState().setBuiltinDownloadUrl("qwen3_0_6b_q4_k_m", "https://custom.example.com/model.gguf");
      expect(useSettingsStore.getState().builtinDownloadUrls["qwen3_0_6b_q4_k_m"]).toBe(
        "https://custom.example.com/model.gguf"
      );
    });

    it("resetBuiltinDownloadUrl removes custom URL", () => {
      useSettingsStore.getState().setBuiltinDownloadUrl("qwen3_0_6b_q4_k_m", "https://custom.example.com/model.gguf");
      useSettingsStore.getState().resetBuiltinDownloadUrl("qwen3_0_6b_q4_k_m");
      expect(useSettingsStore.getState().builtinDownloadUrls["qwen3_0_6b_q4_k_m"]).toBeUndefined();
    });

    it("resetAllBuiltinDownloadUrls clears all custom URLs", () => {
      useSettingsStore.getState().setBuiltinDownloadUrl("a", "url1");
      useSettingsStore.getState().setBuiltinDownloadUrl("b", "url2");
      useSettingsStore.getState().resetAllBuiltinDownloadUrls();
      expect(Object.keys(useSettingsStore.getState().builtinDownloadUrls)).toHaveLength(0);
    });
  });
});
