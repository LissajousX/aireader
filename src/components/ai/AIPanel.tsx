import { useState, useEffect, useRef } from "react";
import { X, Languages, BookOpen, Loader2, Copy, Check, BookmarkPlus, Brain, ChevronDown, ChevronUp, StickyNote, Trash2, Download, MessageSquare, Send, RotateCcw, User, Bot, Square, Play } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Markdown } from "@/components/ui/Markdown";
import { useDocumentStore } from "@/stores/documentStore";
import { useAIStore, type AIContextKey } from "@/stores/aiStore";
import { useNoteStore } from "@/stores/noteStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { cn } from "@/lib/utils";
import { TRANSLATION_MODES } from "@/types";
import type { TranslationMode, Note } from "@/types";
import { streamGenerate, buildTranslatePrompt, buildExplainPrompt, type ThinkingMode } from "@/services/ollamaStream";
import { fetchOllamaModels, formatModelSize, type OllamaModel } from "@/services/ollamaApi";
import { invoke, Channel } from "@tauri-apps/api/core";

type TabType = "translate" | "explain" | "chat" | "notes";

interface AIPanelProps {
  style?: React.CSSProperties;
}

export function AIPanel({ style }: AIPanelProps) {
  const { selectedText, setSelectedText, toggleAIPanel, currentDocument, currentPage } = useDocumentStore();
  const { contexts, startTask, setThinking, setStreamingContent, finishTask, setError, clearAllResults, clearContext } = useAIStore();
  const { addNote, currentDocumentNotes, loadNotes, deleteNote, confirmNote } = useNoteStore();
  const {
    llmProvider,
    ollamaUrl,
    ollamaModel,
    builtinModelId,
    builtinComputeMode,
    builtinGpuBackend,
    builtinGpuLayers,
    builtinCudaVersion,
    openAICompatibleModel,
    openAICompatibleBaseUrl,
    openAICompatibleApiKey,
    prompts,
    setLlmProvider,
    setBuiltinModelId,
    setActiveModel,
    saveSettings,
    markdownScale,
    uiLanguage,
  } = useSettingsStore();

  const t = (zh: string, en: string) => (uiLanguage === 'en' ? en : zh);
  
  const [activeTab, setActiveTabRaw] = useState<TabType>(() => {
    const saved = localStorage.getItem('aireader_ai_active_tab');
    if (saved === 'translate' || saved === 'explain' || saved === 'chat' || saved === 'notes') return saved;
    return 'translate';
  });
  const setActiveTab = (tab: TabType) => {
    setActiveTabRaw(tab);
    localStorage.setItem('aireader_ai_active_tab', tab);
  };
  const [translationMode, setTranslationMode] = useState<TranslationMode["type"]>("free");
  const [thinkingMode, setThinkingMode] = useState<ThinkingMode>(() => {
    const saved = localStorage.getItem('aireader_thinking_mode');
    if (saved === 'off' || saved === 'quick') return saved;
    // Migrate from old values
    const oldSaved = localStorage.getItem('aireader_thinking_enabled');
    if (oldSaved === 'false') return 'off';
    return 'quick';
  });
  const toggleThinking = () => {
    setThinkingMode(prev => {
      const next: ThinkingMode = prev === 'off' ? 'quick' : 'off';
      localStorage.setItem('aireader_thinking_mode', next);
      return next;
    });
  };
  const thinkingEnabled = thinkingMode !== 'off';
  const [warningText, setWarningText] = useState<string | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showWarning = (text: string) => {
    setWarningText(text);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    warningTimerRef.current = setTimeout(() => setWarningText(null), 8000);
  };
  const [inputText, setInputText] = useState("");

  // T4: Locked chat context — when user enters chat tab with selected text, lock it as context
  const [lockedChatContext, setLockedChatContext] = useState<string | null>(null);

  // B4: Translation/explanation result cache — avoids re-requesting identical text
  const resultCacheRef = useRef<Map<string, { content: string; thinking?: string }>>(new Map());
  const makeCacheKey = (text: string, contextKey: string) => `${contextKey}::${text.trim().substring(0, 500)}`;

  const activeContextKey: AIContextKey | null =
    activeTab === "translate"
      ? (`translate:${translationMode}` as AIContextKey)
      : activeTab === "explain"
        ? "explain"
        : activeTab === "chat"
          ? "chat"
          : null;

  const activeContext = activeContextKey ? contexts[activeContextKey] : null;
  
  // 模型选择相关状态
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [showModelSelect, setShowModelSelect] = useState(false);
  const modelSelectRef = useRef<HTMLDivElement>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [openAiModelDraft, setOpenAiModelDraft] = useState(openAICompatibleModel);
  const [builtinModels, setBuiltinModels] = useState<Array<{ modelId: string; fileName: string; size: number }>>([]);
  const [builtinStatus, setBuiltinStatus] = useState<{ running: boolean; runningModelId?: string | null } | null>(null);
  const [builtinActionLoading, setBuiltinActionLoading] = useState<Record<string, boolean>>({});
  const [ollamaConnected, setOllamaConnected] = useState<boolean | null>(null);
  const [apiConnected, setApiConnected] = useState<boolean | null>(null);

  // 加载所有 provider 的模型列表
  useEffect(() => {
    (async () => {
      setLoadingModels(true);
      try {
        const list = await fetchOllamaModels(ollamaUrl);
        setModels(list);
        setOllamaConnected(true);
      } catch {
        setModels([]);
        setOllamaConnected(false);
      } finally {
        setLoadingModels(false);
      }
    })();
  }, [ollamaUrl]);

  useEffect(() => {
    (async () => {
      try {
        const list = await invoke<Array<{ modelId: string; fileName: string; size: number }>>("builtin_llm_list_models");
        setBuiltinModels(list || []);
      } catch {
        setBuiltinModels([]);
      }
    })();
  }, []);

  useEffect(() => {
    setOpenAiModelDraft(openAICompatibleModel);
  }, [openAICompatibleModel]);

  const handleRefreshModels = async () => {
    if (llmProvider !== 'ollama') return;
    setLoadingModels(true);
    try {
      const list = await fetchOllamaModels(ollamaUrl);
      setModels(list);
    } finally {
      setLoadingModels(false);
    }
  };
  
  // T2: Fetch all provider statuses when dropdown opens
  useEffect(() => {
    if (!showModelSelect) return;
    // Builtin status
    (async () => {
      try {
        const st = await invoke<{ running: boolean; runningModelId?: string | null }>("builtin_llm_status", { options: { modelId: builtinModelId } });
        setBuiltinStatus({ running: st.running, runningModelId: st.runningModelId });
      } catch { setBuiltinStatus(null); }
    })();
    // API connectivity
    setApiConnected(!!(openAICompatibleBaseUrl && openAICompatibleApiKey));
  }, [showModelSelect, builtinModelId, openAICompatibleBaseUrl, openAICompatibleApiKey]);


  // T7: Close model dropdown on outside click
  useEffect(() => {
    if (!showModelSelect) return;
    const handler = (e: MouseEvent) => {
      if (modelSelectRef.current && !modelSelectRef.current.contains(e.target as Node)) {
        setShowModelSelect(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showModelSelect]);

  const providerLabel = llmProvider === 'builtin_local' ? t('内置', 'Built-in')
    : llmProvider === 'ollama' ? 'Ollama'
    : 'API';

  const handleModelChange = (model: string) => {
    setActiveModel(model);
    saveSettings();
    setShowModelSelect(false);
  };

  const handleBuiltinModelChange = async (modelId: string) => {
    setBuiltinModelId(modelId);
    saveSettings();
    setShowModelSelect(false);
  };

  const refreshBuiltinInfo = async (modelId?: string) => {
    try {
      const st = await invoke<{ running: boolean; runningModelId?: string | null }>("builtin_llm_status", { options: { modelId: modelId || builtinModelId } });
      setBuiltinStatus({ running: st.running, runningModelId: st.runningModelId });
    } catch { /* ignore */ }
    try {
      const list = await invoke<Array<{ modelId: string; fileName: string; size: number }>>("builtin_llm_list_models");
      setBuiltinModels(list || []);
    } catch { /* ignore */ }
  };

  const handleBuiltinStart = async (modelId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setBuiltinActionLoading(prev => ({ ...prev, [modelId]: true }));
    try {
      setLlmProvider('builtin_local');
      setBuiltinModelId(modelId);
      saveSettings();
      const onProgress = new Channel<{ written: number; total: number | null; label: string }>();
      onProgress.onmessage = () => {};
      await invoke<any>("builtin_llm_ensure_running", {
        options: { modelId, mode: "bundled_only", computeMode: builtinComputeMode, gpuBackend: builtinGpuBackend, gpuLayers: builtinGpuLayers, cudaVersion: builtinCudaVersion },
        onProgress,
      });
      await refreshBuiltinInfo(modelId);
    } catch (err) {
      const msg = typeof err === 'string' ? err : (err as any)?.message || String(err);
      if (!/cancelled/i.test(msg)) {
        showWarning(t('启动失败: ', 'Start failed: ') + msg);
      }
    }
    setBuiltinActionLoading(prev => ({ ...prev, [modelId]: false }));
  };

  const handleBuiltinStopFromDropdown = async (modelId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setBuiltinActionLoading(prev => ({ ...prev, [modelId]: true }));
    try {
      await invoke<any>("builtin_llm_stop", { options: { modelId } });
      await refreshBuiltinInfo(modelId);
    } catch (err) {
      const msg = typeof err === 'string' ? err : (err as any)?.message || String(err);
      showWarning(t('停止失败: ', 'Stop failed: ') + msg);
    }
    setBuiltinActionLoading(prev => ({ ...prev, [modelId]: false }));
  };


  const currentModelName = llmProvider === 'openai_compatible'
    ? openAICompatibleModel
    : llmProvider === 'ollama'
      ? ollamaModel
      : builtinModelId;
  const selectedModelInfo = llmProvider === 'ollama'
    ? (models.find((m) => m.name === ollamaModel) || null)
    : null;

  // 同步选中文本到输入框
  useEffect(() => {
    if (selectedText?.text) {
      setInputText(selectedText.text);
      // T4: Auto-lock context when switching to chat with selected text
      if (activeTab === 'chat') {
        setLockedChatContext(selectedText.text);
      }
    }
  }, [selectedText?.text, activeTab]);

  // T4: Lock context when user switches to chat tab while text is selected
  useEffect(() => {
    if (activeTab === 'chat' && selectedText?.text && !lockedChatContext) {
      setLockedChatContext(selectedText.text);
    }
  }, [activeTab]);
  const [copied, setCopied] = useState(false);
  const [savingByContext, setSavingByContext] = useState<Record<string, boolean>>({});
  const [savedByContext, setSavedByContext] = useState<Record<string, boolean>>({});
  const [showThinkingByContext, setShowThinkingByContext] = useState<Record<string, boolean>>({});
  const [lastSavedContentByContext, setLastSavedContentByContext] = useState<Record<string, string | null>>({});

  const streamingContent = activeContext?.streamingContent || "";
  const thinking = activeContext?.streamingThinking || "";
  const showThinking = activeContextKey
    ? (showThinkingByContext[activeContextKey] ?? true)
    : true;

  const saving = activeContextKey ? (savingByContext[activeContextKey] ?? false) : false;
  const saved = activeContextKey ? (savedByContext[activeContextKey] ?? false) : false;
  const lastSavedContent = activeContextKey ? (lastSavedContentByContext[activeContextKey] ?? null) : null;

  // 切换文档时清空 AI 内容、选中文本和保存状态
  useEffect(() => {
    if (currentDocument) {
      (async () => {
        try {
          await loadNotes(currentDocument.id);
        } catch (error) {
          console.error("加载笔记失败:", error);
        }
      })();
      // 清空选中文本、AI 响应和保存状态
      setSelectedText(null);
      clearAllResults();
      setSavingByContext({});
      setSavedByContext({});
      setLastSavedContentByContext({});
    }
  }, [currentDocument?.id, loadNotes, setSelectedText, clearAllResults]);

  const handleTranslate = async () => {
    const textToProcess = inputText.trim();
    if (!textToProcess) return;
    
    const key = `translate:${translationMode}` as AIContextKey;
    
    // B4: Check cache first
    const cacheKey = makeCacheKey(textToProcess, key);
    const cached = resultCacheRef.current.get(cacheKey);
    if (cached) {
      const { taskId } = startTask(key);
      if (cached.thinking) {
        setThinking(key, taskId, cached.thinking);
      }
      finishTask(key, taskId, cached.content, cached.thinking || '', textToProcess);
      return;
    }

    setSavedByContext((prev) => ({ ...prev, [key]: false }));
    setLastSavedContentByContext((prev) => ({ ...prev, [key]: null }));
    if (thinkingEnabled) {
      setShowThinkingByContext((prev) => ({ ...prev, [key]: true }));
    }

    const { taskId, signal } = startTask(key);
    
    const prompt = buildTranslatePrompt(textToProcess, translationMode);
    let finalContent = "";
    let finalThinking = "";
    let thinkingDone = false;
    await streamGenerate(prompt, {
      onThinking: (t) => { 
        if (thinkingEnabled) {
          setThinking(key, taskId, t); 
          finalThinking = t; 
        }
      },
      onContent: (content) => {
        setStreamingContent(key, taskId, content);
        finalContent = content;
        if (thinkingEnabled && !thinkingDone && finalThinking) {
          thinkingDone = true;
          setShowThinkingByContext((prev) => ({ ...prev, [key]: false }));
        }
      },
      onDone: () => {
        // B4: Cache the result
        if (finalContent) {
          resultCacheRef.current.set(cacheKey, { content: finalContent, thinking: finalThinking || undefined });
        }
        finishTask(key, taskId, finalContent, finalThinking, textToProcess);
      },
      onError: (error) => setError(key, taskId, error),
      onWarning: showWarning,
    }, { thinkingMode, signal });
  };

  // 对话功能 - ChatGPT风格
  type ChatMsg = {id: string, role: 'user' | 'assistant', content: string, selected?: boolean, thinking?: string, thinkingCollapsed?: boolean};
  const [chatHistory, setChatHistoryRaw] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // B3: Persist chat history per document
  const chatStorageKey = currentDocument ? `aireader_chat_${currentDocument.id}` : null;
  const setChatHistory = (updater: ChatMsg[] | ((prev: ChatMsg[]) => ChatMsg[])) => {
    setChatHistoryRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (chatStorageKey && next.length > 0) {
        try {
          const toSave = next.map(m => ({ id: m.id, role: m.role, content: m.content, thinking: m.thinking }));
          localStorage.setItem(chatStorageKey, JSON.stringify(toSave));
        } catch { /* ignore quota errors */ }
      } else if (chatStorageKey && next.length === 0) {
        localStorage.removeItem(chatStorageKey);
      }
      return next;
    });
  };

  // B3: Load chat history when document changes
  useEffect(() => {
    if (!chatStorageKey) { setChatHistoryRaw([]); return; }
    try {
      const saved = localStorage.getItem(chatStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as ChatMsg[];
        if (Array.isArray(parsed)) { setChatHistoryRaw(parsed); return; }
      }
    } catch { /* ignore */ }
    setChatHistoryRaw([]);
  }, [chatStorageKey]);
  
  // 滚动到底部
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  useEffect(() => {
    if (activeTab === 'chat') scrollToBottom();
  }, [chatHistory, activeTab]);
  
  // 清空对话
  const clearChat = () => {
    setChatHistory([]);
    clearContext("chat");
  };
  
  // 复制单条消息
  const copyMessage = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      showWarning(t('复制失败', 'Copy failed'));
    }
  };
  
  // 切换消息选中状态
  const toggleMessageSelect = (id: string) => {
    setChatHistory(prev => prev.map(m => m.id === id ? {...m, selected: !m.selected} : m));
  };
  
  // 切换思考折叠状态
  const toggleThinkingCollapse = (id: string) => {
    setChatHistory(prev => prev.map(m => m.id === id ? {...m, thinkingCollapsed: !m.thinkingCollapsed} : m));
  };
  
  // 保存选中的对话为笔记
  const saveSelectedAsNote = async () => {
    const selected = chatHistory.filter(m => m.selected);
    if (selected.length === 0) return;
    
    const content = selected.map(m => `**${m.role === 'user' ? t('用户', 'User') : 'AI'}**: ${m.content}`).join('\n\n');
    await addNote({
      id: crypto.randomUUID(),
      documentId: currentDocument?.id || '__global__',
      type: "ai_generated",
      content,
      originalText: t("对话记录", "Chat log"),
      pageNumber: currentDocument ? currentPage : undefined,
      aiConfirmed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    // 取消选中
    setChatHistory(prev => prev.map(m => ({...m, selected: false})));
  };
  
  const handleChat = async () => {
    if (contexts.chat.isLoading) return;
    const textToProcess = (activeTab === 'chat' ? chatInput : inputText).trim();
    if (!textToProcess) return;
    
    // 添加用户消息到历史
    const userMsg = { id: crypto.randomUUID(), role: 'user' as const, content: textToProcess };
    const newHistory = [...chatHistory, userMsg];
    setChatHistory(newHistory);
    setChatInput("");
    setInputText("");

    const key: AIContextKey = "chat";
    const { taskId, signal } = startTask(key);
    let thinkingDone = false;
    
    // Build proper OpenAI messages array for multi-turn conversation
    const chatContextPrompt = lockedChatContext
      ? prompts.chatContext?.replace('{text}', lockedChatContext) 
        || `The user has selected the following text from the document:\n\n"${lockedChatContext}"\n\nPlease answer questions based on this context. Respond in the same language as the user's question.`
      : null;
    const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];
    if (chatContextPrompt) {
      messages.push({ role: 'system', content: chatContextPrompt });
    }
    messages.push(...newHistory.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })));
    // Use last user message as the prompt fallback (for Ollama /api/generate)
    const prompt = textToProcess;
    
    let finalContent = "";
    let finalThinking = "";
    await streamGenerate(prompt, {
      onThinking: (t) => { 
        if (thinkingEnabled) {
          setThinking(key, taskId, t); 
          finalThinking = t; 
        }
      },
      onContent: (content) => {
        setStreamingContent(key, taskId, content);
        finalContent = content;
        if (thinkingEnabled && !thinkingDone && finalThinking) {
          thinkingDone = true;
        }
      },
      onDone: () => {
        if (finalContent) {
          setChatHistory(prev => [...prev, { 
            id: crypto.randomUUID(), 
            role: 'assistant', 
            content: finalContent,
            thinking: finalThinking || undefined
          }]);
        }

        finishTask(key, taskId, finalContent, finalThinking, textToProcess);
      },
      onError: (error) => setError(key, taskId, error),
      onWarning: showWarning,
    }, { thinkingMode, signal, messages });
  };

  const handleExplain = async () => {
    const textToProcess = inputText.trim();
    if (!textToProcess) return;
    
    const key: AIContextKey = "explain";

    // B4: Check cache first
    const cacheKey = makeCacheKey(textToProcess, key);
    const cached = resultCacheRef.current.get(cacheKey);
    if (cached) {
      const { taskId } = startTask(key);
      if (cached.thinking) setThinking(key, taskId, cached.thinking);
      finishTask(key, taskId, cached.content, cached.thinking || '', textToProcess);
      return;
    }

    setSavedByContext((prev) => ({ ...prev, [key]: false }));
    setLastSavedContentByContext((prev) => ({ ...prev, [key]: null }));
    if (thinkingEnabled) {
      setShowThinkingByContext((prev) => ({ ...prev, [key]: true }));
    }

    const { taskId, signal } = startTask(key);
    
    const prompt = buildExplainPrompt(textToProcess);
    let finalContent = "";
    let finalThinking = "";
    let thinkingDone = false;
    await streamGenerate(prompt, {
      onThinking: (t) => { 
        if (thinkingEnabled) {
          setThinking(key, taskId, t); 
          finalThinking = t; 
        }
      },
      onContent: (content) => {
        setStreamingContent(key, taskId, content);
        finalContent = content;
        if (thinkingEnabled && !thinkingDone && finalThinking) {
          thinkingDone = true;
          setShowThinkingByContext((prev) => ({ ...prev, [key]: false }));
        }
      },
      onDone: () => {
        if (finalContent) {
          resultCacheRef.current.set(cacheKey, { content: finalContent, thinking: finalThinking || undefined });
        }
        finishTask(key, taskId, finalContent, finalThinking, textToProcess);
      },
      onError: (error) => setError(key, taskId, error),
      onWarning: showWarning,
    }, { thinkingMode, signal });
  };

  const handleRegenerate = () => {
    if (!activeContextKey || activeTab === 'chat' || activeTab === 'notes') return;
    // Clear cache for this specific key+text combo
    const text = inputText.trim();
    if (!text) return;
    const cacheKey = makeCacheKey(text, activeContextKey);
    resultCacheRef.current.delete(cacheKey);
    // Reset save state
    setSavedByContext((prev) => ({ ...prev, [activeContextKey]: false }));
    setLastSavedContentByContext((prev) => ({ ...prev, [activeContextKey]: null }));
    // Re-run
    handleTabAction();
  };

  const handleCopy = async () => {
    const content = currentContent;
    if (content) {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSaveAsNote = async () => {
    if (!activeContextKey) return;
    const content = currentContent;
    if (!content) return;
    
    // 检查是否已保存过相同内容
    if (lastSavedContent === content) {
      return; // 已保存，不重复保存
    }

    const effectiveDocId = currentDocument?.id ?? '__global__';
    
    setSavingByContext((prev) => ({ ...prev, [activeContextKey]: true }));
    try {
      await addNote({
        id: crypto.randomUUID(),
        documentId: effectiveDocId,
        type: "ai_generated",
        content,
        originalText: selectedText?.text,
        pageNumber: currentPage,
        aiConfirmed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setLastSavedContentByContext((prev) => ({ ...prev, [activeContextKey]: content }));
      setSavedByContext((prev) => ({ ...prev, [activeContextKey]: true }));
      // 刷新笔记列表
      await loadNotes(effectiveDocId);
    } catch (error) {
      console.error("Save note failed:", error);
      alert(t("保存笔记失败: ", "Failed to save note: ") + (error instanceof Error ? error.message : t("未知错误", "Unknown error")));
    } finally {
      setSavingByContext((prev) => ({ ...prev, [activeContextKey]: false }));
    }
  };

  const tabs = [
    { id: "translate" as const, label: t("翻译", "Translate"), icon: Languages, color: 'text-blue-500' },
    { id: "explain" as const, label: t("文法解释", "Grammar"), icon: BookOpen, color: 'text-violet-500' },
    { id: "chat" as const, label: t("对话", "Chat"), icon: MessageSquare, color: 'text-sky-500' },
    { id: "notes" as const, label: t("笔记", "Notes"), icon: StickyNote, color: 'text-emerald-500' },
  ];

  const handleTabAction = () => {
    switch (activeTab) {
      case "translate": return handleTranslate();
      case "explain": return handleExplain();
      case "chat": return handleChat();
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    const { confirm } = await import("@tauri-apps/plugin-dialog");
    const ok = await confirm(t("确定要删除这条笔记吗？", "Delete this note?"), {
      title: t("删除笔记", "Delete Note"),
      kind: "warning",
      okLabel: t("删除", "Delete"),
      cancelLabel: t("取消", "Cancel"),
    });
    if (!ok) return;

    try {
      await deleteNote(noteId);
      if (currentDocument) {
        await loadNotes(currentDocument.id);
      }
    } catch (error) {
      console.error("Delete note failed:", error);
      alert(t("删除笔记失败: ", "Failed to delete note: ") + (error instanceof Error ? error.message : t("未知错误", "Unknown error")));
    }
  };

  const handleConfirmNote = async (noteId: string) => {
    try {
      await confirmNote(noteId);
      if (currentDocument) {
        await loadNotes(currentDocument.id);
      }
    } catch (error) {
      console.error("Confirm note failed:", error);
      alert(t("确认笔记失败: ", "Failed to confirm note: ") + (error instanceof Error ? error.message : t("未知错误", "Unknown error")));
    }
  };

  const getNoteTypeLabel = (type: Note["type"]) => {
    switch (type) {
      case "ai_generated":
        return { label: t("AI 生成", "AI Generated"), color: "bg-yellow-500/20 text-yellow-700" };
      case "confirmed":
        return { label: t("已确认", "Confirmed"), color: "bg-green-500/20 text-green-700" };
      case "user":
        return { label: t("用户笔记", "User Note"), color: "bg-blue-500/20 text-blue-700" };
      default:
        return { label: t("笔记", "Note"), color: "bg-muted" };
    }
  };

  const exportNotesAsMarkdown = async () => {
    if (currentDocumentNotes.length === 0) return;
    
    const docTitle = currentDocument?.title || t("笔记", "Notes");
    const locale = uiLanguage === 'en' ? 'en-US' : 'zh-CN';
    let markdown = `# ${docTitle} - ${t('笔记导出', 'Notes Export')}\n\n`;
    markdown += `${t('导出时间', 'Exported at')}: ${new Date().toLocaleString(locale)}\n\n---\n\n`;
    
    currentDocumentNotes.forEach((note, index) => {
      const typeInfo = getNoteTypeLabel(note.type);
      markdown += `## ${t('笔记', 'Note')} ${index + 1} [${typeInfo.label}]\n\n`;
      if (note.pageNumber) {
        markdown += `**${t('页码', 'Page')}**: ${uiLanguage === 'en' ? '' : '第 '}${note.pageNumber}${uiLanguage === 'en' ? '' : ' 页'}\n\n`;
      }
      if (note.originalText) {
        markdown += `**${t('原文', 'Original')}**:\n> ${note.originalText}\n\n`;
      }
      markdown += `**${t('内容', 'Content')}**:\n${note.content}\n\n`;
      markdown += `*${t('创建于', 'Created at')}: ${new Date(note.createdAt).toLocaleString(locale)}*\n\n---\n\n`;
    });
    
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      
      const filePath = await save({
        defaultPath: `${docTitle.replace(/\.[^.]+$/, "")}_${t('笔记', 'notes')}.md`,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      
      if (filePath) {
        await writeTextFile(filePath, markdown);
        alert(t("笔记导出成功！", "Notes exported successfully!"));
      }
    } catch (error) {
      console.error("Export notes failed:", error);
      alert(t("导出失败: ", "Export failed: ") + (error instanceof Error ? error.message : t("未知错误", "Unknown error")));
    }
  };

  // 获取当前 tab 的内容：只显示当前 tab 的内容，不混用其他 tab
  // 注意：chat tab 有专门的 UI，不在这里显示
  const getCurrentTabContent = () => {
    if (activeTab === "notes" || activeTab === "chat") return null;

    if (!activeContextKey) return null;
    const ctx = contexts[activeContextKey];
    if (ctx.isLoading) return ctx.streamingContent || null;
    return ctx.result?.content || null;
  };

  const getCurrentTabThinking = () => {
    // chat tab 有专门的思考显示，notes 没有思考
    if (activeTab === "notes" || activeTab === "chat") return null;

    if (!activeContextKey) return null;
    const ctx = contexts[activeContextKey];
    if (ctx.isLoading) return ctx.streamingThinking || null;
    return ctx.result?.thinking || null;
  };

  const getTabLabel = () => {
    switch (activeTab) {
      case "translate": return t("翻译", "Translate");
      case "chat": return t("对话", "Chat");
      case "explain": return t("文法解释", "Grammar");
      default: return "";
    }
  };

  const currentContent = getCurrentTabContent();
  const currentThinking = getCurrentTabThinking();

  return (
    <div className="h-full bg-card border-l border-border/60 flex flex-col" style={style}>
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/60">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-primary" />
          {/* 模型选择器 */}
          <div className="flex items-center gap-2">
            <div className="relative" ref={modelSelectRef}>
              <button
                className="flex items-center gap-1 px-2 py-1 text-xs bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                onClick={() => {
                  setShowModelSelect(!showModelSelect);
                }}
              >
                <span className="px-1 py-0.5 text-[10px] rounded bg-primary/10 text-primary font-medium">{providerLabel}</span>
                <span className="max-w-[120px] truncate">{currentModelName}</span>
                {selectedModelInfo && (
                  <span className="text-xs text-muted-foreground">({formatModelSize(selectedModelInfo.size)})</span>
                )}
                <ChevronDown className="w-3 h-3" />
              </button>
              {showModelSelect && (
                <div className="absolute top-full left-0 mt-1 w-72 bg-background border border-border rounded-md shadow-lg z-50 max-h-64 overflow-y-auto">
                  {/* Built-in model — only show the configured model from settings */}
                  <div className="px-3 pt-2 pb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t('内置', 'Built-in')}</div>
                  {(() => {
                    const m = builtinModelId;
                    const isRunning = builtinStatus?.running && builtinStatus.runningModelId === m;
                    const isInstalled = builtinModels.some((bm) => bm.modelId === m);
                    const isActive = llmProvider === 'builtin_local';
                    const isBusy = builtinActionLoading[m] ?? false;
                    return (
                      <div
                        onClick={() => { setLlmProvider('builtin_local'); void handleBuiltinModelChange(m); }}
                        className={cn(
                          "w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors cursor-pointer",
                          isActive && "bg-primary/10 text-primary"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {isRunning ? (
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" title={t('运行中', 'Running')} />
                            ) : isInstalled ? (
                              <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 flex-shrink-0" title={t('已安装', 'Installed')} />
                            ) : (
                              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 flex-shrink-0" title={t('未配置', 'Not configured')} />
                            )}
                            <span className="truncate">{m}</span>
                          </div>
                          <div className="flex-shrink-0">
                            {isBusy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                            ) : isRunning ? (
                              <button
                                onClick={(e) => handleBuiltinStopFromDropdown(m, e)}
                                className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 hover:bg-red-500/20 transition-colors"
                                title={t('停止', 'Stop')}
                              >
                                <Square className="w-2.5 h-2.5" />
                                {t('停止', 'Stop')}
                              </button>
                            ) : isInstalled ? (
                              <button
                                onClick={(e) => handleBuiltinStart(m, e)}
                                className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 hover:bg-green-500/20 transition-colors"
                                title={t('启动', 'Start')}
                              >
                                <Play className="w-2.5 h-2.5" />
                                {t('启动', 'Start')}
                              </button>
                            ) : (
                              <span className="text-[10px] text-amber-600">{t('请在设置中下载', 'Configure in Settings')}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Ollama models */}
                  {models.length > 0 && (
                    <>
                      <div className="px-3 pt-2.5 pb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider border-t border-border/40 mt-1">Ollama</div>
                      {models.map((m) => {
                        const isActive = llmProvider === 'ollama' && ollamaModel === m.name;
                        return (
                          <button
                            key={`ollama:${m.name}`}
                            onClick={() => { setLlmProvider('ollama'); handleModelChange(m.name); }}
                            className={cn(
                              "w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors",
                              isActive && "bg-primary/10 text-primary"
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ollamaConnected === false ? 'bg-red-500' : 'bg-green-500'}`} />
                                <span className="truncate">{m.name}</span>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <span className="text-[9px] px-1 rounded bg-orange-500/10 text-orange-600">Ollama</span>
                                <span className="text-xs text-muted-foreground whitespace-nowrap">{formatModelSize(m.size)}</span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </>
                  )}

                  {/* OpenAI Compatible */}
                  <div className="px-3 pt-2.5 pb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider border-t border-border/40 mt-1">API</div>
                  <div className="px-3 py-1.5 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${apiConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                      <span className="text-[9px] px-1 rounded bg-violet-500/10 text-violet-600">API</span>
                      <input
                        type="text"
                        value={openAiModelDraft}
                        onChange={(e) => setOpenAiModelDraft(e.target.value)}
                        className="flex-1 px-1.5 py-1 border border-border rounded bg-background text-foreground text-xs"
                        placeholder="gpt-4o-mini"
                      />
                      <Button
                        size="sm"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => { setLlmProvider('openai_compatible'); handleModelChange(openAiModelDraft.trim()); }}
                        disabled={!openAiModelDraft.trim()}
                      >
                        {t('确定', 'OK')}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {llmProvider === 'ollama' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleRefreshModels}
                disabled={loadingModels}
                title={t('刷新模型列表', 'Refresh model list')}
              >
                {loadingModels ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              </Button>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={toggleAIPanel}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex gap-0.5 px-2 py-1.5 border-b border-border/60 bg-muted/30">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1 py-1.5 text-xs rounded-lg transition-all",
              activeTab === tab.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
          >
            <tab.icon className={`w-3.5 h-3.5 ${tab.color}`} />
            {tab.label}
          </button>
        ))}
      </div>

      {warningText && (
        <div className="mx-2 mt-1.5 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-500/15 rounded-lg flex items-center gap-1.5">
          <span>⚠</span>
          <span className="flex-1">{warningText}</span>
          <button onClick={() => setWarningText(null)} className="text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200">✕</button>
        </div>
      )}

      <div className="flex-1 overflow-auto p-3">
        {activeTab === "notes" ? (
          <div className="space-y-2">
            {currentDocumentNotes.length > 0 && (
              <div className="flex gap-2 pb-2 border-b border-border">
                <Button variant="outline" size="sm" onClick={exportNotesAsMarkdown}>
                  <Download className="w-3 h-3 mr-1" />
                  {t('导出 Markdown', 'Export Markdown')}
                </Button>
              </div>
            )}
            {currentDocumentNotes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-8">
                <StickyNote className="w-12 h-12 mb-3 opacity-50" />
                <p className="text-sm">{t('暂无笔记', 'No notes yet')}</p>
                <p className="text-xs">{t('选中文本后使用 AI 功能生成笔记', 'Select text and use AI to generate notes')}</p>
              </div>
            ) : (
              currentDocumentNotes.map((note) => {
                const typeInfo = getNoteTypeLabel(note.type);
                return (
                  <div key={note.id} className="bg-background border border-border rounded-md p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={cn("text-xs px-1 rounded", typeInfo.color)}>{typeInfo.label}</span>
                        {note.pageNumber && <span className="text-xs text-muted-foreground">{uiLanguage === 'en' ? `P${note.pageNumber}` : `第 ${note.pageNumber} 页`}</span>}
                      </div>
                      <div className="flex gap-1">
                        {note.type === "ai_generated" && (
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleConfirmNote(note.id)}>
                            <Check className="w-3 h-3 text-green-600" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDeleteNote(note.id)}>
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    {note.originalText && (
                      <div className="text-xs bg-muted/50 p-2 rounded text-muted-foreground max-h-16 overflow-auto">{note.originalText}</div>
                    )}
                    <div className="prose prose-sm ai-prose dark:prose-invert max-w-none">
                      <div style={{ fontSize: `${markdownScale}rem` }}>
                        <Markdown>{note.content}</Markdown>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">{new Date(note.createdAt).toLocaleString(uiLanguage === 'en' ? 'en-US' : 'zh-CN')}</div>
                  </div>
                );
              })
            )}
          </div>
        ) : activeTab === "chat" ? (
          /* ChatGPT 风格对话界面 */
          <div className="flex flex-col h-full">
            {/* T4: Locked context preview bar */}
            {lockedChatContext && (
              <div className="flex items-start gap-2 px-3 py-2 mb-2 rounded-lg bg-primary/5 border border-primary/20 text-xs">
                <span className="text-primary mt-0.5 flex-shrink-0">📌</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] text-primary font-medium mb-0.5">{t('对话上下文', 'Chat Context')}</div>
                  <div className="text-muted-foreground line-clamp-2 break-all">{lockedChatContext}</div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {selectedText?.text && selectedText.text !== lockedChatContext && (
                    <button onClick={() => setLockedChatContext(selectedText.text)} className="text-[10px] text-primary hover:underline">{t('更新', 'Update')}</button>
                  )}
                  <button onClick={() => setLockedChatContext(null)} className="text-[10px] text-muted-foreground hover:text-destructive">{t('清除', 'Clear')}</button>
                </div>
              </div>
            )}
            {/* 对话历史 */}
            <div className="flex-1 overflow-auto space-y-3 mb-3">
              {chatHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-8">
                  <MessageSquare className="w-12 h-12 mb-3 opacity-50" />
                  <p className="text-sm">{t('开始对话', 'Start a conversation')}</p>
                  <p className="text-xs">{t('输入问题与 AI 交流', 'Type a question to chat with AI')}</p>
                  <p className="text-xs mt-2 max-w-[280px]">
                    {lockedChatContext
                      ? t('已锁定上下文，你可以针对选中的文本追问、讨论。', 'Context locked. Ask follow-up questions about the selected text.')
                      : t('暂不支持对全文档的对话，仅支持对选中文本的对话。选中文本后切换到对话即可锁定上下文。', 'Full-document chat is not yet supported. Select text first, then switch to Chat to lock it as context.')}
                  </p>
                </div>
              ) : (
                <>
                  {chatHistory.map((msg) => (
                    <div key={msg.id} className={cn("group flex gap-2", msg.role === 'user' ? "flex-row-reverse" : "flex-row")}>
                      {/* Avatar */}
                      <div className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
                        msg.role === 'user' ? "bg-primary/15" : "bg-primary/10"
                      )}>
                        {msg.role === 'user' ? <User className="w-3.5 h-3.5 text-primary" /> : <Bot className="w-3.5 h-3.5 text-primary" />}
                      </div>
                      <div className={cn("max-w-[82%] space-y-0.5", msg.role === 'user' ? "items-end" : "items-start")}>
                        {/* Message bubble */}
                        <div className={cn(
                          "rounded-2xl px-3 py-1",
                          msg.role === 'user'
                            ? "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100 rounded-tr-md"
                            : "bg-muted/60 border border-border/40 rounded-tl-md"
                        )}>
                          {/* Thinking — collapsed by default */}
                          {msg.role === 'assistant' && msg.thinking && (
                            <div className="mb-2">
                              <button
                                onClick={() => toggleThinkingCollapse(msg.id)}
                                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <Brain className="w-3 h-3 text-amber-500" />
                                <span>{t('思考过程', 'Thinking')}</span>
                                {msg.thinkingCollapsed !== false ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                              </button>
                              {msg.thinkingCollapsed === false && (
                                <div className="mt-1.5 text-xs text-muted-foreground/80 italic max-h-40 overflow-y-auto whitespace-pre-wrap bg-background/50 rounded-lg p-2 border border-border/30">
                                  {msg.thinking}
                                </div>
                              )}
                            </div>
                          )}
                          <div className="prose prose-sm ai-prose dark:prose-invert max-w-none">
                            <div style={{ fontSize: `${markdownScale}rem` }}>
                              <Markdown>{msg.content}</Markdown>
                            </div>
                          </div>
                        </div>
                        {/* Actions — visible on hover */}
                        <div className={cn(
                          "flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity",
                          msg.role === 'user' ? "justify-end" : "justify-start"
                        )}>
                          <button
                            onClick={() => copyMessage(msg.content)}
                            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            title={t('复制', 'Copy')}
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => toggleMessageSelect(msg.id)}
                            className={cn(
                              "p-1 rounded-md transition-colors",
                              msg.selected
                                ? "text-primary bg-primary/10 hover:bg-primary/20"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted"
                            )}
                            title={msg.selected ? t('取消选中', 'Deselect') : t('选中', 'Select')}
                          >
                            <Check className={cn("w-3 h-3", !msg.selected && "opacity-50")} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {/* Streaming response */}
                  {contexts.chat.isLoading && (
                    <div className="flex gap-2 flex-row">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Bot className="w-3.5 h-3.5 text-primary animate-pulse" />
                      </div>
                      <div className="max-w-[82%] rounded-2xl rounded-tl-md px-3.5 py-2.5 bg-muted/50 border border-border/40">
                        {contexts.chat.streamingThinking && (
                          <div className="mb-2">
                            <div className="flex items-center gap-1 text-[11px] text-amber-500">
                              <Brain className="w-3 h-3 animate-pulse" />
                              <span>{t('思考中...', 'Thinking...')}</span>
                            </div>
                            <div className="mt-1.5 text-xs text-muted-foreground/80 italic max-h-40 overflow-y-auto whitespace-pre-wrap bg-background/50 rounded-lg p-2 border border-border/30">
                              {contexts.chat.streamingThinking}
                            </div>
                          </div>
                        )}
                        {contexts.chat.streamingContent ? (
                          <div className="prose prose-sm ai-prose dark:prose-invert max-w-none">
                            <div style={{ fontSize: `${markdownScale}rem` }}>
                              <Markdown>{contexts.chat.streamingContent}</Markdown>
                            </div>
                          </div>
                        ) : !contexts.chat.streamingThinking ? (
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            {t('正在生成...', 'Generating...')}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </>
              )}
            </div>
            
            {/* 选中消息时显示保存按钮 */}
            {chatHistory.some(m => m.selected) && (
              <div className="flex gap-2 mb-2">
                <Button size="sm" onClick={saveSelectedAsNote} className="flex-1">
                  <BookmarkPlus className="w-3 h-3 mr-1" />
                  {t('保存选中为笔记', 'Save selected as note')} ({chatHistory.filter(m => m.selected).length})
                </Button>
              </div>
            )}
            
            {/* 输入区域 */}
            <div className="border-t border-border/60 pt-2 space-y-2">
              {/* 思考开关和清空按钮 - 在输入框上方 */}
              <div className="flex justify-between items-center">
                <button
                  onClick={toggleThinking}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded text-xs transition-all",
                    thinkingEnabled ? "bg-amber-500/20 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground"
                  )}
                >
                  <Brain className="w-3 h-3" />
                  {thinkingEnabled ? t('思考', 'Think') : t('不思考', 'Off')}
                </button>
                <button
                  onClick={clearChat}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <RotateCcw className="w-3 h-3" />
                  {t('清空对话', 'Clear Chat')}
                </button>
              </div>
              {llmProvider === 'ollama' && ollamaModel?.toLowerCase().startsWith('qwen3:4b') && !thinkingEnabled && (
                <div className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-1 rounded">
                  {t(
                    '⚠ qwen3:4b 关闭思考时仍可能输出思考内容且较慢',
                    '⚠ qwen3:4b may still output thinking when disabled'
                  )}
                </div>
              )}
              {/* 输入框和发送按钮 */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChat(); }}}
                    placeholder={t('输入消息... (Enter 发送)', 'Type a message... (Enter to send)')}
                    className="w-full text-sm bg-muted/40 p-2.5 rounded-xl min-h-[40px] max-h-[100px] resize-none border-0 focus:ring-1 focus:ring-primary/40 outline-none"
                    rows={1}
                  />
                  {chatInput.trim().length > 0 && (
                    <button
                      type="button"
                      onClick={() => setChatInput("")}
                      className="absolute top-2 right-2 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                      title={t('清空', 'Clear')}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {contexts.chat.isLoading ? (
                  <Button onClick={() => clearContext('chat')} size="icon" className="rounded-xl" variant="destructive">
                    <Square className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button onClick={handleChat} disabled={!chatInput.trim()} size="icon" className="rounded-xl">
                    <Send className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* 可编辑输入框 */}
            <div>
              <div className="text-xs text-muted-foreground mb-1">{t('输入文本', 'Input Text')}</div>
              <div className="relative">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={t('选中文档中的文本，或直接输入...', 'Select text in document, or type directly...')}
                  className="w-full text-sm bg-muted/40 p-2.5 rounded-xl min-h-[80px] max-h-[200px] resize-y border-0 focus:ring-1 focus:ring-primary/40 outline-none"
                />
                {inputText.trim().length > 0 && (
                  <button
                    type="button"
                    onClick={() => setInputText("")}
                    className="absolute top-2 right-2 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                    title={t('清空', 'Clear')}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {activeTab === "translate" && (
              <div className="flex gap-1">
                {TRANSLATION_MODES.map((mode) => {
                  const modeKey = `translate:${mode.type}` as AIContextKey;
                  const modeResult = contexts[modeKey].result;
                  return (
                    <button
                      key={mode.type}
                      onClick={() => {
                        setTranslationMode(mode.type);
                      }}
                      className={cn(
                        "flex-1 py-1 text-xs rounded transition-colors relative",
                        translationMode === mode.type
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted hover:bg-muted/80"
                      )}
                    >
                      {uiLanguage === 'en' ? mode.labelEn : mode.labelZh}
                      {modeResult && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* 思考开关 + 开始按钮同行 */}
            <div className="flex gap-2">
              <button
                onClick={toggleThinking}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-md text-sm transition-all",
                  thinkingEnabled
                    ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                    : "bg-muted text-muted-foreground border border-transparent"
                )}
                title={thinkingEnabled ? t('思考已开启', 'Thinking on') : t('思考已关闭', 'Thinking off')}
              >
                <Brain className={cn("w-4 h-4", thinkingEnabled && "text-amber-500")} />
                <span className="text-xs">{thinkingEnabled ? t('思考', 'Think') : t('不思考', 'Off')}</span>
              </button>
              {activeContext?.isLoading ? (
                <Button
                  onClick={() => activeContextKey && clearContext(activeContextKey)}
                  variant="destructive"
                  className="flex-1"
                >
                  <Square className="w-4 h-4 mr-2" />
                  {t('停止', 'Stop')}
                </Button>
              ) : (() => {
                const hasResult = !!(activeContext?.result && activeContext.result.originalText === inputText.trim());
                const tabLabel = tabs.find((tb) => tb.id === activeTab)?.label ?? '';
                return (
                  <Button
                    onClick={hasResult ? handleRegenerate : handleTabAction}
                    className="flex-1"
                    disabled={!inputText.trim()}
                  >
                    {hasResult
                      ? (uiLanguage === 'en' ? `Redo ${tabLabel}` : `重新${tabLabel}`)
                      : (uiLanguage === 'en' ? `Start ${tabLabel}` : `开始${tabLabel}`)}
                  </Button>
                );
              })()}
            </div>

            {llmProvider === 'ollama' && ollamaModel?.toLowerCase().startsWith('qwen3:4b') && !thinkingEnabled && (
              <div className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1.5 rounded-lg">
                {t(
                  '⚠ qwen3:4b 存在已知问题：关闭思考时仍可能输出思考内容，响应较慢。建议使用其他规格的模型。',
                  '⚠ qwen3:4b has a known bug: disabling thinking may still produce slow responses. Consider using a different model size.'
                )}
              </div>
            )}

            {activeContext?.error && (
              <div className="text-sm text-destructive bg-destructive/10 p-2 rounded-xl flex items-start justify-between gap-2">
                <span>{activeContext.error}</span>
                <button className="text-destructive/60 hover:text-destructive flex-shrink-0 text-sm leading-none px-1" onClick={() => { if (activeContextKey) clearContext(activeContextKey); }}>×</button>
              </div>
            )}

            {/* 实时思考过程显示 - 流式传输时显示 thinking，完成后显示 currentThinking */}
            {(thinking || currentThinking) && (
              <div className="space-y-1">
                <button
                  onClick={() => {
                    if (!activeContextKey) return;
                    setShowThinkingByContext((prev) => ({
                      ...prev,
                      [activeContextKey]: !(prev[activeContextKey] ?? true),
                    }));
                  }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Brain className={cn("w-3 h-3", activeContext?.isLoading && thinking && "animate-pulse text-amber-500")} />
                  <span>{t('思考过程', 'Thinking')}{activeContext?.isLoading && thinking ? t(' (思考中...)', ' (thinking...)') : t(' (已完成)', ' (done)')}</span>
                  {showThinking ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
                {showThinking && (
                  <div className="text-xs bg-muted/50 p-2 rounded-md max-h-[300px] overflow-y-auto text-muted-foreground italic whitespace-pre-wrap break-words">
                    {/* 优先显示实时思考内容，否则显示保存的思考内容 */}
                    {thinking || currentThinking}
                  </div>
                )}
              </div>
            )}

            {(currentContent || streamingContent) && (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <span className="bg-yellow-500/20 text-yellow-700 px-1 rounded text-xs">
                    {getTabLabel()}
                  </span>
                  {activeContext?.isLoading ? t('生成中...', 'Generating...') : t('结果', 'Result')}
                </div>
                <div className="bg-primary/5 p-3 rounded-xl prose prose-sm ai-prose dark:prose-invert max-w-none">
                  <div style={{ fontSize: `${markdownScale}rem` }}>
                    <Markdown>{currentContent}</Markdown>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={!!activeContext?.isLoading} className="border-primary/30 text-primary hover:bg-primary/10 hover:text-primary">
                    <RotateCcw className="w-4 h-4 mr-1" />
                    {t('重新生成', 'Regenerate')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleCopy}>
                    {copied ? (
                      <Check className="w-4 h-4 mr-1" />
                    ) : (
                      <Copy className="w-4 h-4 mr-1" />
                    )}
                    {copied ? t('已复制', 'Copied') : t('复制', 'Copy')}
                  </Button>
                  <Button 
                    variant={saved ? "default" : "outline"} 
                    size="sm" 
                    onClick={handleSaveAsNote} 
                    disabled={saving || saved}
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : saved ? (
                      <Check className="w-4 h-4 mr-1" />
                    ) : (
                      <BookmarkPlus className="w-4 h-4 mr-1" />
                    )}
                    {saving ? t('保存中...', 'Saving...') : saved ? t('已保存', 'Saved') : t('存为笔记', 'Save as Note')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
