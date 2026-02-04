import { useState, useEffect, useRef } from "react";
import { X, Volume2, Loader2 } from "lucide-react";
import { lookupWord, type DictionaryResult } from "@/services/dictionary";

interface WordPopupProps {
  word: string;
  position: { x: number; y: number };
  onClose: () => void;
}

export function WordPopup({ word, position, onClose }: WordPopupProps) {
  const [result, setResult] = useState<DictionaryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const lookup = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await lookupWord(word);
        if (data) {
          setResult(data);
        } else {
          setError("Not found");
        }
      } catch (e) {
        setError("Lookup failed");
      } finally {
        setLoading(false);
      }
    };
    lookup();
  }, [word]);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    
    // 延迟添加监听，避免立即触发
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);
    
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  // ESC 关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // 计算弹窗位置，确保不超出视窗
  const getPopupStyle = () => {
    const popupWidth = 320;
    const popupHeight = 250;
    const padding = 10;
    
    let left = position.x;
    let top = position.y + 20; // 在选中文字下方
    
    // 右边界检查
    if (left + popupWidth > window.innerWidth - padding) {
      left = window.innerWidth - popupWidth - padding;
    }
    
    // 下边界检查
    if (top + popupHeight > window.innerHeight - padding) {
      top = position.y - popupHeight - 10; // 改为显示在上方
    }
    
    // 左边界检查
    if (left < padding) {
      left = padding;
    }
    
    return { left, top };
  };

  const playAudio = () => {
    if (result?.audioUrl) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      audioRef.current = new Audio(result.audioUrl);
      audioRef.current.play().catch(console.error);
    }
  };

  const style = getPopupStyle();

  return (
    <div
      ref={popupRef}
      className="fixed z-[100] bg-card border border-border rounded-lg shadow-xl w-80 max-h-64 overflow-hidden"
      style={{ left: style.left, top: style.top }}
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/50">
        <div className="flex items-center gap-2">
          <span className="font-medium">{word}</span>
          {result?.phonetic && (
            <span className="text-sm text-muted-foreground">{result.phonetic}</span>
          )}
          {result?.audioUrl && (
            <button
              onClick={playAudio}
              className="p-1 hover:bg-muted rounded transition-colors"
              title="Play pronunciation"
            >
              <Volume2 className="w-4 h-4 text-primary" />
            </button>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-muted rounded transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 内容区域 */}
      <div className="p-3 overflow-y-auto max-h-48 text-sm">
        {loading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && !loading && (
          <div className="text-muted-foreground text-center py-4">{error}</div>
        )}

        {result && !loading && (
          <div className="space-y-2">
            {/* 简单翻译 */}
            {result.translation && (
              <div className="bg-primary/10 text-primary px-2 py-1 rounded text-sm font-medium whitespace-pre-wrap break-words">
                {result.translation}
              </div>
            )}

            {/* 详细释义 */}
            {result.meanings.map((meaning, idx) => (
              <div key={idx} className="space-y-1">
                <div className="text-xs text-muted-foreground italic">
                  {meaning.partOfSpeech}
                </div>
                {meaning.definitions.map((def, defIdx) => (
                  <div key={defIdx} className="text-foreground pl-2 border-l-2 border-muted whitespace-pre-wrap break-words">
                    {def}
                  </div>
                ))}
                {meaning.examples.length > 0 && (
                  <div className="text-xs text-muted-foreground pl-2 italic">
                    e.g. {meaning.examples[0]}
                  </div>
                )}
              </div>
            ))}

            {result.meanings.length === 0 && !result.translation && (
              <div className="text-muted-foreground text-center">No definitions available</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
