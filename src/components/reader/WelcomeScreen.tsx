import { BookOpen, FileText, Sparkles, StickyNote, MessageSquareText, Languages, Library, Settings, HelpCircle, FolderOpen, Moon, Sun, AlertTriangle, PanelLeftOpen } from "lucide-react";
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
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleSidebar} title={t('sidebar.show')}>
            <PanelLeftOpen className="w-4 h-4" />
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
              <Library className="w-4 h-4 mr-1.5 text-blue-500" />
              {t("common.library")}
            </Button>
            <Button variant="outline" size="sm" className="h-8 backdrop-blur bg-card/60" onClick={openHelp}>
              <HelpCircle className="w-4 h-4 mr-1.5 text-emerald-500" />
              {t("common.help")}
            </Button>
            <Button variant="outline" size="sm" className="h-8 backdrop-blur bg-card/60" onClick={openSettings}>
              <Settings className="w-4 h-4 mr-1.5 text-muted-foreground" />
              {t("common.settings")}
            </Button>
            {onToggleTheme && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleTheme}>
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
            )}
            <Button size="sm" className="h-8" onClick={toggleAIPanel}>
              <Sparkles className="w-3.5 h-3.5 mr-1.5 text-purple-300" />
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
            <p className="mt-1.5 text-xs font-medium tracking-widest uppercase text-primary/60 pl-11">
              {t("welcome.tagline")}
            </p>
            <p className="mt-2 text-sm text-muted-foreground max-w-[60ch] leading-relaxed pl-11">
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
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-blue-500" />
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
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <FolderOpen className="w-5 h-5 text-amber-500" />
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
            <div className="group rounded-xl border border-blue-300/40 dark:border-blue-500/30 bg-gradient-to-br from-blue-100/80 to-indigo-50/60 dark:from-blue-500/15 dark:to-indigo-500/10 hover:from-blue-200/90 hover:to-indigo-100/70 dark:hover:from-blue-500/25 dark:hover:to-indigo-500/15 shadow-sm hover:shadow-md hover:border-blue-400/60 dark:hover:border-blue-400/50 transition-all p-4">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-200/80 to-indigo-200/50 dark:from-blue-500/30 dark:to-indigo-500/20 flex items-center justify-center group-hover:from-blue-300/80 group-hover:to-indigo-200/60 dark:group-hover:from-blue-500/40 dark:group-hover:to-indigo-500/30 transition-colors mb-2.5">
                <Languages className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="font-medium text-sm">{t("welcome.feature.select_translate.title")}</div>
              <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{t("welcome.feature.select_translate.desc")}</div>
            </div>

            <div className="group rounded-xl border border-violet-300/40 dark:border-violet-500/30 bg-gradient-to-br from-violet-100/80 to-purple-50/60 dark:from-violet-500/15 dark:to-purple-500/10 hover:from-violet-200/90 hover:to-purple-100/70 dark:hover:from-violet-500/25 dark:hover:to-purple-500/15 shadow-sm hover:shadow-md hover:border-violet-400/60 dark:hover:border-violet-400/50 transition-all p-4">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-200/80 to-purple-200/50 dark:from-violet-500/30 dark:to-purple-500/20 flex items-center justify-center group-hover:from-violet-300/80 group-hover:to-purple-200/60 dark:group-hover:from-violet-500/40 dark:group-hover:to-purple-500/30 transition-colors mb-2.5">
                <Languages className="w-4.5 h-4.5 text-violet-600 dark:text-violet-400" />
              </div>
              <div className="font-medium text-sm">{t("welcome.feature.grammar.title")}</div>
              <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{t("welcome.feature.grammar.desc")}</div>
            </div>

            <div className="group rounded-xl border border-sky-300/40 dark:border-sky-500/30 bg-gradient-to-br from-sky-100/80 to-cyan-50/60 dark:from-sky-500/15 dark:to-cyan-500/10 hover:from-sky-200/90 hover:to-cyan-100/70 dark:hover:from-sky-500/25 dark:hover:to-cyan-500/15 shadow-sm hover:shadow-md hover:border-sky-400/60 dark:hover:border-sky-400/50 transition-all p-4">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-sky-200/80 to-cyan-200/50 dark:from-sky-500/30 dark:to-cyan-500/20 flex items-center justify-center group-hover:from-sky-300/80 group-hover:to-cyan-200/60 dark:group-hover:from-sky-500/40 dark:group-hover:to-cyan-500/30 transition-colors mb-2.5">
                <MessageSquareText className="w-4.5 h-4.5 text-sky-600 dark:text-sky-400" />
              </div>
              <div className="font-medium text-sm">{t("welcome.feature.chat.title")}</div>
              <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{t("welcome.feature.chat.desc")}</div>
            </div>

            <div className="group rounded-xl border border-emerald-300/40 dark:border-emerald-500/30 bg-gradient-to-br from-emerald-100/80 to-teal-50/60 dark:from-emerald-500/15 dark:to-teal-500/10 hover:from-emerald-200/90 hover:to-teal-100/70 dark:hover:from-emerald-500/25 dark:hover:to-teal-500/15 shadow-sm hover:shadow-md hover:border-emerald-400/60 dark:hover:border-emerald-400/50 transition-all p-4">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-200/80 to-teal-200/50 dark:from-emerald-500/30 dark:to-teal-500/20 flex items-center justify-center group-hover:from-emerald-300/80 group-hover:to-teal-200/60 dark:group-hover:from-emerald-500/40 dark:group-hover:to-teal-500/30 transition-colors mb-2.5">
                <StickyNote className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />
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
