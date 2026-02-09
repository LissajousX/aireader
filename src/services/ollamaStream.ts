import { useSettingsStore } from "@/stores/settingsStore";
import { invoke, Channel } from "@tauri-apps/api/core";

interface StreamCallbacks {
  onThinking?: (text: string) => void;
  onContent?: (text: string) => void;
  onDone?: () => void;
  onError?: (error: string) => void;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export type ThinkingLevel = 'none' | 'weak' | 'medium' | 'strong';

interface StreamOptions {
  enableThinking?: boolean;
  thinkingLevel?: ThinkingLevel;
  signal?: AbortSignal;
  messages?: ChatMessage[];
}

const THINKING_BUDGET_TOKENS: Record<ThinkingLevel, number> = {
  none: 0,
  weak: 1024,
  medium: 4096,
  strong: 16384,
};

function resolveThinkingMode(prompt: string, defaultThinking: boolean, level?: ThinkingLevel): { thinking: boolean; promptToSend: string; budgetTokens: number } {
  const effectiveLevel = level ?? (defaultThinking ? 'medium' : 'none');
  const re = /\/(think|no_think)\b/g;
  let last: "think" | "no_think" | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(prompt)) !== null) {
    last = m[1] as any;
  }

  if (last === "think") {
    return { thinking: true, promptToSend: prompt, budgetTokens: THINKING_BUDGET_TOKENS[effectiveLevel] || 4096 };
  }
  if (last === "no_think") {
    return { thinking: false, promptToSend: prompt, budgetTokens: 0 };
  }
  if (effectiveLevel === 'none') {
    return { thinking: false, promptToSend: `${prompt} /no_think`, budgetTokens: 0 };
  }
  return { thinking: true, promptToSend: prompt, budgetTokens: THINKING_BUDGET_TOKENS[effectiveLevel] };
}

export async function streamGenerate(
  prompt: string,
  callbacks: StreamCallbacks,
  options?: StreamOptions
): Promise<void> {
  try {
    const settings = useSettingsStore.getState();
    const provider = settings.llmProvider;
    const enableThinking = options?.enableThinking ?? settings.enableThinking;
    const thinkingLevel = options?.thinkingLevel;
    const thinkingResolved = resolveThinkingMode(prompt, enableThinking, thinkingLevel);

    let response!: Response;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const decoder = new TextDecoder();

    if (provider === 'builtin_local') {
      const builtinThinking = thinkingResolved.thinking;
      // Check if model is already running — do NOT auto-download or auto-start
      const result = await invoke<{ running?: boolean; baseUrl?: string | null }>("builtin_llm_status", {
        options: { modelId: settings.builtinModelId },
      });
      if (!result.running || !result.baseUrl) {
        throw new Error(settings.uiLanguage === 'en'
          ? 'Built-in model is not running. Please start it from the model selector or configure it in Settings.'
          : '内置模型未运行，请在模型选择器中启动，或在设置中一键配置。');
      }
      const baseUrl = (result.baseUrl || "").replace(/\/+$/, "");

      // For builtin model: use both API param AND prompt-level tag for maximum compatibility.
      // Some llama-server builds ignore enable_thinking, so /think or /no_think in prompt ensures correct behavior.
      const thinkTag = builtinThinking ? ' /think' : ' /no_think';
      const builtinMessages: ChatMessage[] = options?.messages
        ? options.messages.map((m, i, arr) =>
            i === arr.length - 1 && m.role === 'user' && !m.content.includes('/think') && !m.content.includes('/no_think')
              ? { ...m, content: m.content + thinkTag }
              : m
          )
        : [{ role: 'user', content: prompt.includes('/think') || prompt.includes('/no_think') ? prompt : prompt + thinkTag }];
      // T3: Retry with backoff for 503 (model still loading after auto_start)
      const requestBody = JSON.stringify({
        model: settings.builtinModelId,
        messages: builtinMessages,
        stream: true,
        enable_thinking: builtinThinking,
        ...(builtinThinking && thinkingResolved.budgetTokens > 0 ? { thinking_budget: thinkingResolved.budgetTokens } : {}),
      });
      const maxRetries = 6;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        response = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: options?.signal,
          body: requestBody,
        });
        if (response.status === 503 && attempt < maxRetries) {
          // Server started but model not loaded yet — wait and retry
          await new Promise(r => setTimeout(r, 1000 + attempt * 500));
          continue;
        }
        break;
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`内置模型请求失败: ${response.status}${text ? ` :: ${text}` : ''}`);
      }

      reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法获取响应流');
      }

      let buffer = '';
      let rawContent = '';
      let thinkingContent = '';
      let mainContent = '';
      let doneCalled = false;
      // State for parsing <think> blocks from content stream
      // 'init'=waiting, 'in_think'=inside <think>, 'done'=past think block or no think block
      let thinkParseState: 'init' | 'in_think' | 'done' = 'init';
      let mainContentStart = 0; // cached position where main content starts in rawContent
      let hasReasoningField = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n');
        buffer = parts.pop() || '';

        for (const raw of parts) {
          const line = raw.trim();
          if (!line) continue;
          if (!line.startsWith('data:')) continue;

          const dataStr = line.slice(5).trim();
          if (!dataStr) continue;
          if (dataStr === '[DONE]') {
            if (!doneCalled) {
              doneCalled = true;
              callbacks.onDone?.();
            }
            continue;
          }

          try {
            const data = JSON.parse(dataStr) as any;
            const delta = data?.choices?.[0]?.delta;
            const contentDelta = delta?.content ?? '';
            const reasoningDelta = delta?.reasoning_content ?? delta?.reasoning ?? delta?.thinking ?? '';

            // Handle separate reasoning/thinking field (some llama-server builds)
            if (builtinThinking && typeof reasoningDelta === 'string' && reasoningDelta) {
              hasReasoningField = true;
              thinkingContent += reasoningDelta;
              callbacks.onThinking?.(thinkingContent);
            }

            // Handle content — may contain <think>...</think> blocks from Qwen3
            if (typeof contentDelta === 'string' && contentDelta) {
              // If reasoning comes via separate field, content is always main content
              if (hasReasoningField) {
                mainContent += contentDelta;
                callbacks.onContent?.(mainContent);
              } else {
                // Parse <think> blocks from content stream
                rawContent += contentDelta;

                if (thinkParseState === 'init') {
                  // Trim leading whitespace/newlines before checking for <think> tag
                  const trimmed = rawContent.trimStart();
                  if (trimmed.startsWith('<think>')) {
                    thinkParseState = 'in_think';
                  } else if (trimmed.length > 7 || (!trimmed.startsWith('<') && trimmed.length > 0)) {
                    thinkParseState = 'done';
                  }
                }

                if (thinkParseState === 'in_think') {
                  const thinkOpenIdx = rawContent.indexOf('<think>');
                  const thinkBodyStart = thinkOpenIdx + 7; // position after '<think>'
                  const closeIdx = rawContent.indexOf('</think>');
                  if (closeIdx >= 0) {
                    thinkParseState = 'done';
                    mainContentStart = closeIdx + 8;
                    if (builtinThinking) {
                      thinkingContent = rawContent.substring(thinkBodyStart, closeIdx);
                      callbacks.onThinking?.(thinkingContent);
                    }
                    mainContent = rawContent.substring(mainContentStart).replace(/^\s+/, '');
                    if (mainContent) callbacks.onContent?.(mainContent);
                  } else if (builtinThinking) {
                    thinkingContent = rawContent.substring(thinkBodyStart);
                    callbacks.onThinking?.(thinkingContent);
                  }
                } else if (thinkParseState === 'done') {
                  // Use cached mainContentStart to avoid re-scanning
                  mainContent = rawContent.substring(mainContentStart).replace(/^\s+/, '');
                  callbacks.onContent?.(mainContent);
                }
              }
            }

            const finishReason = data?.choices?.[0]?.finish_reason;
            if (finishReason && !doneCalled) {
              doneCalled = true;
              callbacks.onDone?.();
            }
          } catch {
            // ignore
          }
        }
      }

      if (!doneCalled) {
        callbacks.onDone?.();
      }
      return;
    }

    if (provider === 'openai_compatible') {
      const baseUrl = (settings.openAICompatibleBaseUrl || '').replace(/\/+$/, '');
      const apiKey = settings.openAICompatibleApiKey;
      const modelName = settings.openAICompatibleModel;

      if (!baseUrl) {
        throw new Error('OpenAI-Compatible Base URL 不能为空');
      }
      if (!apiKey) {
        throw new Error('OpenAI-Compatible API Key 不能为空');
      }
      if (!modelName) {
        throw new Error('OpenAI-Compatible Model 不能为空');
      }

      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: options?.signal,
        body: JSON.stringify({
          model: modelName,
          messages: options?.messages || [{ role: 'user', content: prompt }],
          stream: true,
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`OpenAI-Compatible 请求失败: ${response.status}${text ? ` :: ${text}` : ''}`);
      }

      reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法获取响应流');
      }

      let buffer = '';
      let thinkingContent = '';
      let mainContent = '';
      let doneCalled = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n');
        buffer = parts.pop() || '';

        for (const raw of parts) {
          const line = raw.trim();
          if (!line) continue;
          if (!line.startsWith('data:')) continue;

          const dataStr = line.slice(5).trim();
          if (!dataStr) continue;
          if (dataStr === '[DONE]') {
            if (!doneCalled) {
              doneCalled = true;
              callbacks.onDone?.();
            }
            continue;
          }

          try {
            const data = JSON.parse(dataStr) as any;
            const delta = data?.choices?.[0]?.delta;
            const contentDelta = delta?.content;
            const reasoningDelta = delta?.reasoning ?? delta?.thinking;

            if (enableThinking && typeof reasoningDelta === 'string' && reasoningDelta) {
              thinkingContent += reasoningDelta;
              callbacks.onThinking?.(thinkingContent);
            }

            if (typeof contentDelta === 'string' && contentDelta) {
              mainContent += contentDelta;
              callbacks.onContent?.(mainContent);
            }

            const finishReason = data?.choices?.[0]?.finish_reason;
            if (finishReason && !doneCalled) {
              doneCalled = true;
              callbacks.onDone?.();
            }
          } catch {
            // ignore
          }
        }
      }

      if (!doneCalled) {
        callbacks.onDone?.();
      }
      return;
    }

    const modelName = settings.ollamaModel;
    const finalPrompt = thinkingResolved.promptToSend;
    const useChat = !!(options?.messages && options.messages.length > 0);

    // Use Rust backend proxy to bypass WebView CORS restrictions
    let doneCalled = false;
    const onChunk = new Channel<{ kind: string; text: string }>();
    onChunk.onmessage = (msg) => {
      if (msg.kind === 'thinking') {
        if (thinkingResolved.thinking) callbacks.onThinking?.(msg.text);
      } else if (msg.kind === 'content') {
        callbacks.onContent?.(msg.text);
      } else if (msg.kind === 'done' && !doneCalled) {
        doneCalled = true;
        callbacks.onDone?.();
      }
    };

    await invoke('ollama_stream_chat', {
      baseUrl: settings.ollamaUrl,
      model: modelName,
      prompt: useChat ? null : finalPrompt,
      messages: useChat ? options!.messages : null,
      think: thinkingResolved.thinking,
      onChunk,
    });

    if (!doneCalled) {
      callbacks.onDone?.();
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return;
    }
    callbacks.onError?.(error instanceof Error ? error.message : "未知错误");
  }
}

export function buildTranslatePrompt(text: string, mode: string): string {
  const settings = useSettingsStore.getState();
  const prompts = settings.prompts;

  const detectDirection = (input: string): 'en_to_zh' | 'zh_to_en' => {
    const s = input || '';
    const cjk = (s.match(/[\u4e00-\u9fff]/g) || []).length;
    const latin = (s.match(/[A-Za-z]/g) || []).length;
    if (cjk > 0 && latin === 0) return 'zh_to_en';
    if (latin > 0 && cjk === 0) return 'en_to_zh';
    if (cjk > latin) return 'zh_to_en';
    return 'en_to_zh';
  };

  const direction = detectDirection(text);
  if (direction === 'zh_to_en') {
    switch (mode) {
      case 'literal':
        return prompts.translateLiteralZhToEn.replace('{text}', text);
      case 'plain':
        return prompts.translatePlainZhToEn.replace('{text}', text);
      case 'free':
      default:
        return prompts.translateFreeZhToEn.replace('{text}', text);
    }
  }
  
  switch (mode) {
    case "literal":
      return prompts.translateLiteral.replace("{text}", text);
    case "free":
      return prompts.translateFree.replace("{text}", text);
    case "plain":
      return prompts.translatePlain.replace("{text}", text);
    default:
      return prompts.translateFree.replace("{text}", text);
  }
}

export function buildExplainPrompt(text: string): string {
  const settings = useSettingsStore.getState();

  const detectDirection = (input: string): 'en' | 'zh' => {
    const s = input || '';
    const cjk = (s.match(/[\u4e00-\u9fff]/g) || []).length;
    const latin = (s.match(/[A-Za-z]/g) || []).length;
    if (cjk > 0 && latin === 0) return 'zh';
    if (latin > 0 && cjk === 0) return 'en';
    if (cjk > latin) return 'zh';
    return 'en';
  };

  const lang = detectDirection(text);
  if (lang === 'zh') {
    return settings.prompts.explainZhToEn.replace('{text}', text);
  }

  return settings.prompts.explain.replace('{text}', text);
}
