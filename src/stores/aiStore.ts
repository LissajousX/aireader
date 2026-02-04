import { create } from 'zustand';

type TabType = 'translate' | 'explain' | 'chat';
type TranslateMode = 'literal' | 'free' | 'plain';

interface TabResult {
  content: string;
  thinking: string;
  originalText: string;
  timestamp: string;
}

// 翻译结果按模式存储
export type AIContextKey = `translate:${TranslateMode}` | Exclude<TabType, 'translate'>;

interface AIContext {
  taskId: string | null;
  isLoading: boolean;
  error?: string;
  streamingContent: string;
  streamingThinking: string;
  result: TabResult | null;
  abortController?: AbortController;
}

const createEmptyContext = (): AIContext => ({
  taskId: null,
  isLoading: false,
  error: undefined,
  streamingContent: '',
  streamingThinking: '',
  result: null,
  abortController: undefined,
});

const initialContexts: Record<AIContextKey, AIContext> = {
  'translate:literal': createEmptyContext(),
  'translate:free': createEmptyContext(),
  'translate:plain': createEmptyContext(),
  explain: createEmptyContext(),
  chat: createEmptyContext(),
};

interface AIState {
  // 按功能存储结果
  contexts: Record<AIContextKey, AIContext>;

  startTask: (key: AIContextKey) => { taskId: string; signal: AbortSignal };
  setThinking: (key: AIContextKey, taskId: string, thinking: string) => void;
  setStreamingContent: (key: AIContextKey, taskId: string, content: string) => void;
  finishTask: (key: AIContextKey, taskId: string, content: string, thinking: string, originalText: string) => void;
  setError: (key: AIContextKey, taskId: string, error: string) => void;
  clearContext: (key: AIContextKey) => void;
  clearAllResults: () => void;
}

export const useAIStore = create<AIState>((set, get) => ({
  contexts: { ...initialContexts },

  startTask: (key) => {
    const prev = get().contexts[key];
    if (prev.abortController) {
      prev.abortController.abort();
    }
    const abortController = new AbortController();
    const taskId = crypto.randomUUID();

    set((state) => ({
      contexts: {
        ...state.contexts,
        [key]: {
          ...state.contexts[key],
          taskId,
          isLoading: true,
          error: undefined,
          streamingContent: '',
          streamingThinking: '',
          result: null,
          abortController,
        },
      },
    }));

    return { taskId, signal: abortController.signal };
  },

  setThinking: (key, taskId, thinking) =>
    set((state) => {
      const ctx = state.contexts[key];
      if (ctx.taskId !== taskId) return state;
      return {
        contexts: {
          ...state.contexts,
          [key]: { ...ctx, streamingThinking: thinking },
        },
      };
    }),

  setStreamingContent: (key, taskId, content) =>
    set((state) => {
      const ctx = state.contexts[key];
      if (ctx.taskId !== taskId) return state;
      return {
        contexts: {
          ...state.contexts,
          [key]: { ...ctx, streamingContent: content },
        },
      };
    }),

  finishTask: (key, taskId, content, thinking, originalText) =>
    set((state) => {
      const ctx = state.contexts[key];
      if (ctx.taskId !== taskId) return state;
      return {
        contexts: {
          ...state.contexts,
          [key]: {
            ...ctx,
            isLoading: false,
            error: undefined,
            streamingContent: '',
            streamingThinking: '',
            result: {
              content,
              thinking,
              originalText,
              timestamp: new Date().toISOString(),
            },
            abortController: undefined,
          },
        },
      };
    }),

  setError: (key, taskId, error) =>
    set((state) => {
      const ctx = state.contexts[key];
      if (ctx.taskId !== taskId) return state;
      return {
        contexts: {
          ...state.contexts,
          [key]: {
            ...ctx,
            isLoading: false,
            error,
            abortController: undefined,
          },
        },
      };
    }),

  clearContext: (key) =>
    set((state) => {
      const ctx = state.contexts[key];
      if (ctx.abortController) {
        ctx.abortController.abort();
      }
      return {
        contexts: {
          ...state.contexts,
          [key]: createEmptyContext(),
        },
      };
    }),

  clearAllResults: () =>
    set((state) => {
      Object.values(state.contexts).forEach((ctx) => ctx.abortController?.abort());
      return { contexts: { ...initialContexts } };
    }),
}));
