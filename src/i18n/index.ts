import { useSettingsStore } from "@/stores/settingsStore";

export type UiLanguage = "zh" | "en";

type MessageDict = Record<string, string>;

type Params = Record<string, string | number | boolean | null | undefined>;

const ZH: MessageDict = {
  "app.name": "Aireader",

  "app.untitled": "未命名",

  "common.ai": "AI",
  "common.ai_assistant": "AI 助手",
  "common.back_to_home": "返回欢迎页",
  "common.open_file": "导入文档",
  "common.import": "导入",
  "common.import_select": "选择并导入",
  "common.all": "全部",
  "common.type.pdf": "PDF",
  "common.type.epub": "EPUB",
  "common.type.md": "Markdown",
  "common.type.txt": "TXT",
  "common.cancel": "取消",
  "common.close": "关闭",
  "common.save": "保存",
  "common.settings": "设置",
  "common.help": "使用说明",
  "common.library": "文档库",
  "common.user": "用户",
  "common.local_mode": "本地模式",

  "theme.switch_to_light": "切换到亮色模式",
  "theme.switch_to_dark": "切换到暗色模式",

  "ai.open": "打开 AI 助手",
  "ai.close": "关闭 AI 助手",

  "welcome.tagline": "Read. Select. Translate. Save.",
  "welcome.subtitle": "面向阅读的 AI 助手：支持 PDF / EPUB / Markdown / TXT。选中文字即可翻译、解释并沉淀为笔记。",
  "welcome.recent.title": "最近文档",
  "welcome.recent.empty": "还没有打开过文档",
  "welcome.recent.open_hint": "你可以先点击“导入文档”导入一本书/文章",
  "welcome.quick.language": "语言",
  "welcome.quick.language.zh": "中文",
  "welcome.quick.language.en": "English",
  "welcome.open_primary": "导入文档",
  "welcome.open_secondary": "导入",
  "welcome.action.open.desc": "选择一个或多个文件（将导入为副本）",
  "welcome.action.import_files.title": "导入多个文件",
  "welcome.action.import_files.desc": "选择多个文档导入为副本",
  "welcome.action.import_folder.title": "导入文件夹",
  "welcome.action.import_folder.desc": "选择一个文件夹并批量导入",
  "welcome.feature.select_translate.title": "选中即译",
  "welcome.feature.select_translate.desc": "在文档中选择文本，AI 面板自动展开",
  "welcome.feature.grammar.title": "文法解释",
  "welcome.feature.grammar.desc": "拆解句子结构，理解更透彻",
  "welcome.feature.chat.title": "随时对话",
  "welcome.feature.chat.desc": "围绕文档上下文提问、总结、扩展",
  "welcome.feature.notes.title": "笔记沉淀",
  "welcome.feature.notes.desc": "把翻译/解释一键保存为可回顾笔记",

  "sidebar.documents": "文档列表",
  "sidebar.no_documents": "暂无文档",
  "sidebar.search_placeholder": "搜索...",
  "sidebar.sort.label": "排序",
  "sidebar.sort.recent": "最近",
  "sidebar.sort.name": "名称",
  "sidebar.sort.progress": "进度",
  "sidebar.sort.order.asc": "升序",
  "sidebar.sort.order.desc": "降序",
  "sidebar.filter.type": "文件类型",
  "sidebar.copy_badge": "副本",
  "sidebar.copy_badge_title": "已导入副本到文档库",
  "sidebar.link_badge": "链接",
  "sidebar.link_badge_title": "直接打开的原始文件",

  "library.title": "文档库",
  "library.count": "({count} 个文档)",
  "library.search_placeholder": "搜索文档...",
  "library.add_document": "添加文档",
  "library.add_files": "导入文件",
  "library.add_folder": "导入文件夹",
  "library.filter.type": "类型筛选",
  "library.sort": "排序：",
  "library.sort.recent": "最近阅读",
  "library.sort.name": "名称",
  "library.sort.progress": "进度",
  "library.empty": "文档库为空",
  "library.no_match": "没有找到匹配的文档",
  "library.empty_hint": "点击「添加文档」开始阅读",
  "library.remove_title": "从文档库移除",
  "library.remove_dialog.title": "移除文档",
  "library.remove_dialog.msg": "确定要从文档库中移除这个文档吗？\n\n如果该文档是「导入副本」，将同时删除副本文件。",
  "library.remove_dialog.ok": "移除",

  "library.storage_dir.title": "文档库位置",
  "library.storage_dir.desc": "导入副本将保存到这个文件夹",
  "library.storage_dir.default": "默认位置",
  "library.storage_dir.choose": "选择文件夹",
  "library.storage_dir.reset": "恢复默认",
  "library.storage_dir.open": "打开文件夹",

  "date.today": "今天",
  "date.yesterday": "昨天",
  "date.days_ago": "{days}天前",
  "date.page": "页",

  "app.open_dialog.filter_name": "电子书文档",
  "app.import_option.title": "导入选项",
  "app.import_option.msg": "是否导入为副本？\n\n- 是：复制到应用数据目录，后续移动/删除原文件不影响阅读\n- 否：直接读取原文件路径",
  "app.import_option.ok": "导入副本",
  "app.import_option.cancel": "直接打开",
};

const EN: MessageDict = {
  "app.name": "Aireader",

  "app.untitled": "Untitled",

  "common.ai": "AI",
  "common.ai_assistant": "AI Assistant",
  "common.back_to_home": "Back to Home",
  "common.open_file": "Import Documents",
  "common.import": "Import",
  "common.import_select": "Import",
  "common.all": "All",
  "common.type.pdf": "PDF",
  "common.type.epub": "EPUB",
  "common.type.md": "Markdown",
  "common.type.txt": "TXT",
  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.save": "Save",
  "common.settings": "Settings",
  "common.help": "Help",
  "common.library": "Library",
  "common.user": "User",
  "common.local_mode": "Local",

  "theme.switch_to_light": "Switch to Light",
  "theme.switch_to_dark": "Switch to Dark",

  "ai.open": "Open AI",
  "ai.close": "Close AI",

  "welcome.tagline": "Read. Select. Translate. Save.",
  "welcome.subtitle": "An AI reading assistant for PDF / EPUB / Markdown / TXT. Select text to translate, explain, and save notes.",
  "welcome.recent.title": "Recent Documents",
  "welcome.recent.empty": "No documents yet",
  "welcome.recent.open_hint": "Click “Import Documents” to import your first book/article",
  "welcome.quick.language": "Language",
  "welcome.quick.language.zh": "中文",
  "welcome.quick.language.en": "English",
  "welcome.open_primary": "Import Documents",
  "welcome.open_secondary": "Import",
  "welcome.action.open.desc": "Select one or more files (imported as copies)",
  "welcome.action.import_files.title": "Import Files",
  "welcome.action.import_files.desc": "Select multiple documents to import as copies",
  "welcome.action.import_folder.title": "Import Folder",
  "welcome.action.import_folder.desc": "Pick a folder and import supported files",
  "welcome.feature.select_translate.title": "Select to Translate",
  "welcome.feature.select_translate.desc": "Select text to open the AI panel",
  "welcome.feature.grammar.title": "Grammar",
  "welcome.feature.grammar.desc": "Break down sentence structure",
  "welcome.feature.chat.title": "Chat Anytime",
  "welcome.feature.chat.desc": "Ask, summarize, and explore",
  "welcome.feature.notes.title": "Notes",
  "welcome.feature.notes.desc": "Save translations and explanations",

  "sidebar.documents": "Documents",
  "sidebar.no_documents": "No documents",
  "sidebar.search_placeholder": "Search...",
  "sidebar.sort.label": "Sort",
  "sidebar.sort.recent": "Recent",
  "sidebar.sort.name": "Name",
  "sidebar.sort.progress": "Progress",
  "sidebar.sort.order.asc": "Ascending",
  "sidebar.sort.order.desc": "Descending",
  "sidebar.filter.type": "File Type",
  "sidebar.copy_badge": "Copy",
  "sidebar.copy_badge_title": "Imported copy in documents library",
  "sidebar.link_badge": "Link",
  "sidebar.link_badge_title": "Opened from original location",

  "library.title": "Library",
  "library.count": "({count} documents)",
  "library.search_placeholder": "Search documents...",
  "library.add_document": "Add",
  "library.add_files": "Import Files",
  "library.add_folder": "Import Folder",
  "library.filter.type": "Type",
  "library.sort": "Sort:",
  "library.sort.recent": "Recent",
  "library.sort.name": "Name",
  "library.sort.progress": "Progress",
  "library.empty": "Library is empty",
  "library.no_match": "No matching documents",
  "library.empty_hint": "Click “Add” to start reading",
  "library.remove_title": "Remove from library",
  "library.remove_dialog.title": "Remove Document",
  "library.remove_dialog.msg": "Remove this document from your library?\n\nIf it was imported as a copy, the copied file will also be deleted.",
  "library.remove_dialog.ok": "Remove",

  "library.storage_dir.title": "Library Folder",
  "library.storage_dir.desc": "Imported copies will be saved here",
  "library.storage_dir.default": "Default",
  "library.storage_dir.choose": "Choose Folder",
  "library.storage_dir.reset": "Reset",
  "library.storage_dir.open": "Open Folder",

  "date.today": "Today",
  "date.yesterday": "Yesterday",
  "date.days_ago": "{days} days ago",
  "date.page": "page",

  "app.open_dialog.filter_name": "Documents",
  "app.import_option.title": "Import Options",
  "app.import_option.msg": "Import as a copy?\n\n- Yes: copy into app data folder; moving/deleting the original won't affect reading\n- No: read from original path",
  "app.import_option.ok": "Import Copy",
  "app.import_option.cancel": "Open Directly",
};

const ALL: Record<UiLanguage, MessageDict> = {
  zh: ZH,
  en: EN,
};

function format(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const v = params[key];
    if (v === undefined || v === null) return "";
    return String(v);
  });
}

export function tr(lang: UiLanguage, key: string, params?: Params): string {
  const table = ALL[lang] || ALL.zh;
  const template = table[key] ?? ALL.zh[key] ?? key;
  return format(template, params);
}

export function useI18n(): {
  lang: UiLanguage;
  t: (key: string, params?: Params) => string;
  b: (zh: string, en: string) => string;
} {
  const lang = useSettingsStore((s) => s.uiLanguage);
  return {
    lang,
    t: (key, params) => tr(lang, key, params),
    b: (zh, en) => (lang === "en" ? en : zh),
  };
}
