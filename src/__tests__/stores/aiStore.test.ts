/// <reference types="vitest/globals" />
import { useAIStore } from "@/stores/aiStore";

// Reset store between tests
beforeEach(() => {
  useAIStore.setState(useAIStore.getInitialState());
});

describe("useAIStore", () => {
  describe("startTask", () => {
    it("creates a new task with loading state", () => {
      const { taskId, signal } = useAIStore.getState().startTask("chat");
      const ctx = useAIStore.getState().contexts.chat;

      expect(taskId).toBeTruthy();
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(ctx.isLoading).toBe(true);
      expect(ctx.taskId).toBe(taskId);
      expect(ctx.streamingContent).toBe("");
      expect(ctx.streamingThinking).toBe("");
      expect(ctx.result).toBeNull();
      expect(ctx.error).toBeUndefined();
    });

    it("aborts previous task when starting a new one", () => {
      const first = useAIStore.getState().startTask("chat");
      const second = useAIStore.getState().startTask("chat");

      expect(first.signal.aborted).toBe(true);
      expect(second.signal.aborted).toBe(false);
      expect(useAIStore.getState().contexts.chat.taskId).toBe(second.taskId);
    });

    it("each context key is independent", () => {
      const chatTask = useAIStore.getState().startTask("chat");
      const explainTask = useAIStore.getState().startTask("explain");

      expect(useAIStore.getState().contexts.chat.taskId).toBe(chatTask.taskId);
      expect(useAIStore.getState().contexts.explain.taskId).toBe(explainTask.taskId);
      expect(chatTask.taskId).not.toBe(explainTask.taskId);
    });
  });

  describe("setStreamingContent", () => {
    it("updates streaming content for matching taskId", () => {
      const { taskId } = useAIStore.getState().startTask("chat");
      useAIStore.getState().setStreamingContent("chat", taskId, "Hello world");

      expect(useAIStore.getState().contexts.chat.streamingContent).toBe("Hello world");
    });

    it("ignores update for stale taskId", () => {
      const first = useAIStore.getState().startTask("chat");
      useAIStore.getState().startTask("chat"); // new task
      useAIStore.getState().setStreamingContent("chat", first.taskId, "stale data");

      expect(useAIStore.getState().contexts.chat.streamingContent).toBe("");
    });
  });

  describe("setThinking", () => {
    it("updates streaming thinking for matching taskId", () => {
      const { taskId } = useAIStore.getState().startTask("explain");
      useAIStore.getState().setThinking("explain", taskId, "thinking...");

      expect(useAIStore.getState().contexts.explain.streamingThinking).toBe("thinking...");
    });
  });

  describe("finishTask", () => {
    it("sets result and clears loading state", () => {
      const { taskId } = useAIStore.getState().startTask("translate:literal");
      useAIStore.getState().finishTask("translate:literal", taskId, "translated text", "thought process", "original");

      const ctx = useAIStore.getState().contexts["translate:literal"];
      expect(ctx.isLoading).toBe(false);
      expect(ctx.result).not.toBeNull();
      expect(ctx.result!.content).toBe("translated text");
      expect(ctx.result!.thinking).toBe("thought process");
      expect(ctx.result!.originalText).toBe("original");
      expect(ctx.result!.timestamp).toBeTruthy();
      expect(ctx.streamingContent).toBe("");
      expect(ctx.abortController).toBeUndefined();
    });

    it("ignores finish for stale taskId", () => {
      const first = useAIStore.getState().startTask("chat");
      useAIStore.getState().startTask("chat");
      useAIStore.getState().finishTask("chat", first.taskId, "stale", "", "");

      expect(useAIStore.getState().contexts.chat.isLoading).toBe(true);
      expect(useAIStore.getState().contexts.chat.result).toBeNull();
    });
  });

  describe("setError", () => {
    it("sets error and clears loading", () => {
      const { taskId } = useAIStore.getState().startTask("chat");
      useAIStore.getState().setError("chat", taskId, "network failure");

      const ctx = useAIStore.getState().contexts.chat;
      expect(ctx.isLoading).toBe(false);
      expect(ctx.error).toBe("network failure");
    });
  });

  describe("clearContext", () => {
    it("resets context and aborts active task", () => {
      const { signal } = useAIStore.getState().startTask("chat");
      useAIStore.getState().clearContext("chat");

      expect(signal.aborted).toBe(true);
      const ctx = useAIStore.getState().contexts.chat;
      expect(ctx.isLoading).toBe(false);
      expect(ctx.taskId).toBeNull();
      expect(ctx.result).toBeNull();
    });
  });

  describe("clearAllResults", () => {
    it("resets all contexts", () => {
      useAIStore.getState().startTask("chat");
      useAIStore.getState().startTask("explain");
      useAIStore.getState().startTask("translate:literal");
      useAIStore.getState().clearAllResults();

      const { contexts } = useAIStore.getState();
      for (const key of Object.keys(contexts)) {
        const ctx = contexts[key as keyof typeof contexts];
        expect(ctx.isLoading).toBe(false);
        expect(ctx.taskId).toBeNull();
      }
    });
  });
});
