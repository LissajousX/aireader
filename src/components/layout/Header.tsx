import { useState, useEffect } from "react";
import { Menu, Moon, Sun, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useDocumentStore } from "@/stores/documentStore";
import { useI18n } from "@/i18n";

export function Header() {
  const { 
    currentDocument, 
    toggleSidebar, 
    toggleAIPanel, 
    aiPanelOpen
  } = useDocumentStore();

  const { t } = useI18n();

  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });

  useEffect(() => {
    // 初始化主题
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
      setIsDark(true);
    }
  }, []);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const toggleTheme = () => {
    const newDark = !isDark;
    setIsDark(newDark);
    if (newDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  return (
    <>
      <header className="h-11 bg-background/80 backdrop-blur-sm border-b border-border/50 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleSidebar}>
            <Menu className="w-4 h-4" />
          </Button>
          {currentDocument && (
            <span className="text-sm font-medium truncate max-w-[400px]">
              {currentDocument.title}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            title={isDark ? t("theme.switch_to_light") : t("theme.switch_to_dark")}
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </Button>
          <Button
            variant={aiPanelOpen ? "secondary" : "default"}
            size="sm"
            onClick={toggleAIPanel}
            className="h-9 px-3"
            title={aiPanelOpen ? t("ai.close") : t("ai.open")}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            {t("common.ai_assistant")}
          </Button>
        </div>
      </header>
    </>
  );
}
