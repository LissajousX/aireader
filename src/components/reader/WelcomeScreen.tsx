import { BookOpen, FileText, Sparkles, StickyNote, MessageSquareText, Languages, Library, Settings, HelpCircle, FolderOpen, Menu, Moon, Sun, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useSettingsStore } from "@/stores/settingsStore";
import { useDocumentStore } from "@/stores/documentStore";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

interface WelcomeScreenProps {
  onOpenFile: () => void;
  onImportFolder: () => void;
  isDark?: boolean;
  onToggleTheme?: () => void;
  aiAutoStartFailed?: boolean;
}

export function WelcomeScreen({ onOpenFile, onImportFolder, isDark, onToggleTheme, aiAutoStartFailed }: WelcomeScreenProps) {
  const { t } = useI18n();
  const { uiLanguage, setUiLanguage, saveSettings, builtinAutoEnabled, llmProvider } = useSettingsStore();
  const aiNotConfigured = !builtinAutoEnabled || llmProvider !== 'builtin_local';
  const { openLibrary, openSettings, openSettingsTab, openHelp, toggleSidebar, toggleAIPanel } = useDocumentStore();

  const handleSwitchLang = (lang: "zh" | "en") => {
    setUiLanguage(lang);
    saveSettings();
  };

  return (
    <div className="flex-1 relative overflow-hidden bg-background">
      {/* Background decorations */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 right-0 w-[700px] h-[500px] rounded-full bg-primary/[0.06] blur-[120px]" />
        <div className="absolute bottom-0 -left-20 w-[600px] h-[400px] rounded-full bg-primary/[0.04] blur-[100px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-primary/[0.02] blur-[80px]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent" />
        <div className="absolute inset-0 opacity-[0.018]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, currentColor 0.5px, transparent 0)", backgroundSize: "28px 28px" }} />
      </div>

      {/* Top toolbar */}
      <div className="absolute top-0 left-0 right-0 z-10 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleSidebar} title={t('common.library')}>
            <Menu className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-1.5">
            <div className="flex items-center rounded-lg border border-border/60 bg-card/60 backdrop-blur overflow-hidden">
              <button
                type="button"
                onClick={() => handleSwitchLang("zh")}
                className={cn(
                  "px-2.5 h-8 text-xs transition-colors",
                  uiLanguage === "zh" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                )}
              >
                {t("welcome.quick.language.zh")}
              </button>
              <button
                type="button"
                onClick={() => handleSwitchLang("en")}
                className={cn(
                  "px-2.5 h-8 text-xs transition-colors",
                  uiLanguage === "en" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                )}
              >
                {t("welcome.quick.language.en")}
              </button>
            </div>
            <Button variant="outline" size="sm" className="h-8 backdrop-blur bg-card/60" onClick={openLibrary}>
              <Library className="w-4 h-4 mr-1.5" />
              {t("common.library")}
            </Button>
            <Button variant="outline" size="sm" className="h-8 backdrop-blur bg-card/60" onClick={openHelp}>
              <HelpCircle className="w-4 h-4 mr-1.5" />
              {t("common.help")}
            </Button>
            <Button variant="outline" size="sm" className="h-8 backdrop-blur bg-card/60" onClick={openSettings}>
              <Settings className="w-4 h-4 mr-1.5" />
              {t("common.settings")}
            </Button>
            {onToggleTheme && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleTheme}>
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
            )}
            <Button size="sm" className="h-8" onClick={toggleAIPanel}>
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              {t("common.ai_assistant")}
            </Button>
          </div>
        </div>
      </div>

      {/* Main content - vertically centered */}
      <div className="relative h-full flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-3xl space-y-8">
          {/* App title with icon book equal height to 'A' */}
          <div>
            <div className="flex items-center gap-3">
              <BookOpen className="w-8 h-8 text-primary flex-shrink-0" strokeWidth={1.75} />
              <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-[0.06em]">
                <span className="text-primary">Ai</span><span className="text-foreground/85">Reader</span>
              </h1>
            </div>
            <p className="mt-3 text-sm text-muted-foreground max-w-[60ch] leading-relaxed pl-11">
              {t("welcome.subtitle")}
            </p>
          </div>

          {/* Import actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onOpenFile}
              className="rounded-2xl border border-border/60 bg-card hover:bg-card/90 backdrop-blur-xl shadow-sm hover:shadow-md hover:border-primary/30 transition-all p-5 text-left active:translate-y-[1px]"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium">{t("welcome.open_primary")}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{t("welcome.action.open.desc")}</div>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={onImportFolder}
              className="rounded-2xl border border-border/60 bg-card hover:bg-card/90 backdrop-blur-xl shadow-sm hover:shadow-md hover:border-primary/30 transition-all p-5 text-left active:translate-y-[1px]"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <FolderOpen className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium">{t("welcome.action.import_folder.title")}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{t("welcome.action.import_folder.desc")}</div>
                </div>
              </div>
            </button>
          </div>

          {/* Auto-start failure warning */}
          {aiAutoStartFailed && !aiNotConfigured && (
            <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/[0.05] px-4 py-3 flex items-center gap-3">
              <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0" />
              <div className="text-xs text-muted-foreground">
                {uiLanguage === 'zh'
                  ? 'AI 自动启动失败，请打开设置重新配置。'
                  : 'AI auto-start failed. Please open Settings to reconfigure.'}
              </div>
              <Button variant="outline" size="sm" className="ml-auto flex-shrink-0 h-7 text-xs" onClick={() => openSettingsTab('ai')}>
                {uiLanguage === 'zh' ? '设置' : 'Settings'}
              </Button>
            </div>
          )}

          {/* Feature cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="group rounded-xl border border-border/60 bg-card/80 hover:bg-card backdrop-blur shadow-sm hover:shadow-md hover:border-border/80 transition-all p-4">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors mb-2.5">
                <Sparkles className="w-4.5 h-4.5 text-primary" />
              </div>
              <div className="font-medium text-sm">{t("welcome.feature.select_translate.title")}</div>
              <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{t("welcome.feature.select_translate.desc")}</div>
            </div>

            <div className="group rounded-xl border border-border/60 bg-card/80 hover:bg-card backdrop-blur shadow-sm hover:shadow-md hover:border-border/80 transition-all p-4">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors mb-2.5">
                <Languages className="w-4.5 h-4.5 text-primary" />
              </div>
              <div className="font-medium text-sm">{t("welcome.feature.grammar.title")}</div>
              <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{t("welcome.feature.grammar.desc")}</div>
            </div>

            <div className="group rounded-xl border border-border/60 bg-card/80 hover:bg-card backdrop-blur shadow-sm hover:shadow-md hover:border-border/80 transition-all p-4">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors mb-2.5">
                <MessageSquareText className="w-4.5 h-4.5 text-primary" />
              </div>
              <div className="font-medium text-sm">{t("welcome.feature.chat.title")}</div>
              <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{t("welcome.feature.chat.desc")}</div>
            </div>

            <div className="group rounded-xl border border-border/60 bg-card/80 hover:bg-card backdrop-blur shadow-sm hover:shadow-md hover:border-border/80 transition-all p-4">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors mb-2.5">
                <StickyNote className="w-4.5 h-4.5 text-primary" />
              </div>
              <div className="font-medium text-sm">{t("welcome.feature.notes.title")}</div>
              <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{t("welcome.feature.notes.desc")}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
