export interface Document {
  id: string;
  title: string;
  type: 'pdf' | 'epub' | 'txt' | 'md';
  path: string;
  totalPages: number;
  currentPage: number;
  readingProgress: number;
  lastPosition?: string; // PDF: scroll offset "scroll:1234", EPUB: CFI "epubcfi(...)", TXT/MD: "scroll:1234"
  isCopy?: boolean; // true = imported copy in documents dir, false/undefined = original path
  originalPath?: string; // for non-copy imports, the original file path (same as path)
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: string;
  documentId: string;
  type: 'quote' | 'ai_generated' | 'confirmed' | 'user';
  content: string;
  originalText?: string;
  pageNumber?: number;
  positionData?: string;
  aiConfirmed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Concept {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
}

export interface TextSelection {
  text: string;
  pageNumber: number;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface AIResponse {
  translation?: string;
  explanation?: string;
  chat?: string;
  concepts?: string[];
  isLoading: boolean;
  error?: string;
}

export interface TranslationMode {
  type: 'literal' | 'free' | 'plain';
  labelZh: string;
  labelEn: string;
}

export const TRANSLATION_MODES: TranslationMode[] = [
  { type: 'literal', labelZh: '直译', labelEn: 'Literal' },
  { type: 'free', labelZh: '意译', labelEn: 'Free' },
  { type: 'plain', labelZh: '白话解释', labelEn: 'Plain' },
];
