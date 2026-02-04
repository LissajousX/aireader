// 词典服务 - 使用在线 API

import { invoke } from "@tauri-apps/api/core";

export interface DictionaryResult {
  word: string;
  phonetic?: string;
  audioUrl?: string;
  translation?: string;
  meanings: Array<{
    partOfSpeech: string;
    definitions: string[];
    examples: string[];
  }>;
}

let offlineInstallPromise: Promise<void> | null = null;
let cedictInstallPromise: Promise<void> | null = null;

async function ensureOfflineDictionaryInstalled(): Promise<void> {
  if (offlineInstallPromise) return offlineInstallPromise;

  offlineInstallPromise = (async () => {
    try {
      const status = await invoke<{ installed: boolean; ifo_path?: string | null }>(
        "dictionary_status"
      );
      if (status?.installed) return;
    } catch {
      // ignore and try install
    }

    await invoke("dictionary_install_ecdict");
  })();

  offlineInstallPromise.catch(() => {
    offlineInstallPromise = null;
  });

  return offlineInstallPromise;
}

async function ensureCedictInstalled(): Promise<void> {
  if (cedictInstallPromise) return cedictInstallPromise;

  cedictInstallPromise = (async () => {
    try {
      const status = await invoke<{ installed: boolean; ifo_path?: string | null }>("cedict_status");
      if (status?.installed) return;
    } catch {
      // ignore and try install
    }
    await invoke("cedict_install");
  })();

  cedictInstallPromise.catch(() => {
    cedictInstallPromise = null;
  });

  return cedictInstallPromise;
}

async function lookupCedict(cleanWord: string): Promise<DictionaryResult | null> {
  try {
    await ensureCedictInstalled();
    const res = await invoke<DictionaryResult | null>("cedict_lookup", { word: cleanWord });
    if (!res) return null;
    return res;
  } catch {
    return null;
  }
}

async function lookupOffline(cleanWord: string): Promise<DictionaryResult | null> {
  try {
    await ensureOfflineDictionaryInstalled();
    const res = await invoke<DictionaryResult | null>("dictionary_lookup", { word: cleanWord });
    if (!res) return null;
    return res;
  } catch {
    return null;
  }
}

async function fetchEnTranslation(text: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=zh-CN|en`,
      { signal: AbortSignal.timeout(3000) }
    );
    if (!response.ok) return null;
    const data = await response.json().catch(() => null) as any;
    const t = data?.responseData?.translatedText;
    if (typeof t !== 'string') return null;
    const clean = t.trim();
    if (!clean) return null;
    if (clean === text) return null;
    return clean;
  } catch {
    return null;
  }
}

export function isSingleCJKWord(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.length > 20) return false;
  if (/[\s\u00A0]/.test(trimmed)) return false;
  if (/[^\u4e00-\u9fff]/.test(trimmed)) return false;
  return true;
}

type DictionaryCacheEntry = {
  result: DictionaryResult;
  updatedAt: number;
};

const DICT_CACHE_KEY = 'aireader_dictionary_cache_v2';
const MAX_CACHE_ENTRIES = 500;

function clearLegacyCacheKeys() {
  try {
    localStorage.removeItem('aireader_dictionary_cache_v1');
  } catch {
  }
}

function loadCache(): Record<string, DictionaryCacheEntry> {
  try {
    clearLegacyCacheKeys();
    const raw = localStorage.getItem(DICT_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as any;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

function saveCache(cache: Record<string, DictionaryCacheEntry>) {
  try {
    localStorage.setItem(DICT_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

function getCached(word: string): DictionaryResult | null {
  const cache = loadCache();
  const entry = cache[word];
  if (!entry?.result) return null;
  entry.updatedAt = Date.now();
  saveCache(cache);
  return entry.result;
}

function setCached(word: string, result: DictionaryResult) {
  const cache = loadCache();
  cache[word] = { result, updatedAt: Date.now() };

  const keys = Object.keys(cache);
  if (keys.length > MAX_CACHE_ENTRIES) {
    keys
      .sort((a, b) => (cache[a]?.updatedAt ?? 0) - (cache[b]?.updatedAt ?? 0))
      .slice(0, keys.length - MAX_CACHE_ENTRIES)
      .forEach((k) => {
        delete cache[k];
      });
  }
  saveCache(cache);
}

// 简单的英中词典（常用词）
const SIMPLE_DICT: Record<string, string> = {
  "the": "定冠词", "a": "一个", "an": "一个", "is": "是", "are": "是",
  "was": "是(过去)", "were": "是(过去)", "be": "是", "been": "是(过去分词)",
  "have": "有", "has": "有", "had": "有(过去)", "do": "做", "does": "做",
  "did": "做(过去)", "will": "将要", "would": "将会", "could": "能够",
  "should": "应该", "may": "可能", "might": "可能", "must": "必须",
  "can": "能", "and": "和", "or": "或", "but": "但是", "if": "如果",
  "then": "然后", "when": "当...时", "where": "哪里", "what": "什么",
  "which": "哪个", "who": "谁", "how": "如何", "why": "为什么",
  "this": "这个", "that": "那个", "these": "这些", "those": "那些",
  "it": "它", "they": "他们", "we": "我们", "you": "你", "i": "我",
  "he": "他", "she": "她", "my": "我的", "your": "你的", "his": "他的",
  "her": "她的", "its": "它的", "our": "我们的", "their": "他们的",
  "not": "不", "no": "不", "yes": "是", "all": "所有", "each": "每个",
  "every": "每个", "both": "两者都", "few": "很少", "more": "更多",
  "most": "最多", "other": "其他", "some": "一些", "only": "只有",
  "same": "相同", "so": "所以", "than": "比", "too": "也/太", "very": "非常",
  "just": "只是", "also": "也", "now": "现在", "here": "这里", "there": "那里",
  "after": "之后", "before": "之前", "from": "从", "to": "到", "in": "在...里",
  "on": "在...上", "at": "在", "by": "通过", "for": "为了", "with": "和/用",
  "about": "关于", "into": "进入", "through": "通过", "during": "在...期间",
  "between": "在...之间", "without": "没有", "however": "然而",
  "therefore": "因此", "although": "虽然", "because": "因为",
  "time": "时间", "year": "年", "people": "人们", "way": "方式", "day": "天",
  "man": "男人", "woman": "女人", "child": "孩子", "world": "世界",
  "life": "生活", "hand": "手", "part": "部分", "place": "地方",
  "work": "工作", "book": "书", "word": "词", "good": "好的", "new": "新的",
  "first": "第一", "last": "最后", "long": "长的", "great": "伟大的",
  "little": "小的", "own": "自己的", "old": "老的", "right": "正确的",
  "big": "大的", "high": "高的", "different": "不同的", "small": "小的",
  "large": "大的", "next": "下一个", "early": "早的", "young": "年轻的",
  "important": "重要的", "public": "公共的", "bad": "坏的",
  "able": "能够的", "go": "去", "come": "来", "make": "制作", "see": "看见",
  "know": "知道", "take": "拿", "get": "得到", "give": "给", "find": "找到",
  "think": "想", "say": "说", "tell": "告诉", "ask": "问", "use": "使用",
  "try": "尝试", "need": "需要", "want": "想要", "look": "看", "feel": "感觉",
  "become": "变成", "leave": "离开", "put": "放", "mean": "意味着",
  "keep": "保持", "let": "让", "begin": "开始", "seem": "似乎", "help": "帮助",
  "show": "展示", "hear": "听见", "play": "玩", "run": "跑", "move": "移动",
  "live": "生活", "believe": "相信", "hold": "持有", "bring": "带来",
  "happen": "发生", "write": "写", "provide": "提供", "sit": "坐",
  "stand": "站", "lose": "失去", "pay": "支付", "meet": "遇见",
  "include": "包括", "continue": "继续", "set": "设置", "learn": "学习",
  "change": "改变", "lead": "领导", "understand": "理解", "watch": "观看",
  "follow": "跟随", "stop": "停止", "create": "创造", "speak": "说话",
  "read": "读", "allow": "允许", "add": "添加", "spend": "花费",
  "grow": "生长", "open": "打开", "walk": "走", "win": "赢", "offer": "提供",
  "remember": "记得", "love": "爱", "consider": "考虑", "appear": "出现",
  "buy": "买", "wait": "等待", "serve": "服务", "die": "死", "send": "发送",
  "expect": "期望", "build": "建造", "stay": "停留", "fall": "落下",
  "cut": "切", "reach": "到达", "kill": "杀死", "remain": "保持",
};

// 查询免费词典 API
async function fetchFromAPI(word: string): Promise<any> {
  try {
    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`,
      { signal: AbortSignal.timeout(3000) }
    );
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchZhTranslation(word: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|zh-CN`,
      { signal: AbortSignal.timeout(3000) }
    );
    if (!response.ok) return null;
    const data = await response.json().catch(() => null) as any;
    const t = data?.responseData?.translatedText;
    if (typeof t !== 'string') return null;
    const clean = t.trim();
    if (!clean) return null;
    if (clean.toLowerCase() === word.toLowerCase()) return null;
    return clean;
  } catch {
    return null;
  }
}

// 主查询函数
export async function lookupWord(word: string): Promise<DictionaryResult | null> {
  const raw = word.trim();
  if (!raw || raw.length > 50) return null;

  if (isSingleCJKWord(raw)) {
    const cacheKey = `zh:${raw}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const cedict = await lookupCedict(raw);
    if (cedict) {
      const result: DictionaryResult = {
        ...cedict,
        word: raw,
      };
      setCached(cacheKey, result);
      return result;
    }

    const online = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
    const translated = online ? await fetchEnTranslation(raw) : null;
    if (!translated) return null;

    const translatedWord = translated.trim();
    let result: DictionaryResult = { word: raw, translation: translatedWord, meanings: [] };

    if (isSingleWord(translatedWord)) {
      const cleanEn = translatedWord.toLowerCase();
      const offline = await lookupOffline(cleanEn);
      if (offline) {
        result = {
          ...offline,
          word: raw,
          translation: translatedWord,
        };
      } else if (online) {
        const apiResult = await fetchFromAPI(cleanEn);
        if (apiResult?.[0]) {
          const entry = apiResult[0];
          let phonetic = entry.phonetic;
          let audioUrl: string | undefined;
          if (entry.phonetics) {
            for (const p of entry.phonetics) {
              if (p.text && !phonetic) phonetic = p.text;
              if (!audioUrl && typeof p.audio === 'string' && p.audio.trim()) {
                audioUrl = p.audio;
              }
            }
          }
          result = {
            word: raw,
            phonetic,
            audioUrl,
            translation: translatedWord,
            meanings: [],
          };
        }
      }
    }

    setCached(cacheKey, result);
    return result;
  }

  const cleanWord = raw.toLowerCase();
  if (!cleanWord || cleanWord.length > 50) return null;
  
  const simpleTranslation = SIMPLE_DICT[cleanWord];

  const offline = await lookupOffline(cleanWord);
  if (offline) {
    if (!offline.translation && simpleTranslation) {
      offline.translation = simpleTranslation;
    }
    setCached(cleanWord, offline);
    return offline;
  }

  const cached = getCached(cleanWord);
  if (cached) return cached;

  const online = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
  const translated = online ? await fetchZhTranslation(cleanWord) : null;
  const translationFinal = translated || simpleTranslation;
  if (!translationFinal) {
    return null;
  }

  const apiResult = online ? await fetchFromAPI(cleanWord) : null;
  
  if (apiResult?.[0]) {
    const entry = apiResult[0];
    let phonetic = entry.phonetic;
    let audioUrl: string | undefined;
    if (entry.phonetics) {
      for (const p of entry.phonetics) {
        if (p.text && !phonetic) phonetic = p.text;
        if (!audioUrl && typeof p.audio === 'string' && p.audio.trim()) {
          audioUrl = p.audio;
        }
      }
    }
    const result: DictionaryResult = {
      word: entry.word,
      phonetic,
      audioUrl,
      translation: translationFinal,
      meanings: [],
    };

    setCached(cleanWord, result);
    return result;
  }

  const result: DictionaryResult = { word: cleanWord, translation: translationFinal, meanings: [] };
  setCached(cleanWord, result);
  return result;
  
  return null;
}

// 判断是否为单个英文单词
export function isSingleWord(text: string): boolean {
  const trimmed = text.trim();
  return /^[a-zA-Z]+(-[a-zA-Z]+)?$/.test(trimmed) && trimmed.length <= 30;
}
