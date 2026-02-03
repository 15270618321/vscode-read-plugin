// types/index.ts
export interface Book {
    id: string;
    name: string;
    path: string;
    progress: number;
    fileSize: number;
    lastReadTime?: number;
    addedTime: number;
    encoding?: string;
}

export interface PluginSettings {
    fontSize: number;
    fontFamily: string;
    lineHeight: number;
    theme: 'auto' | 'light' | 'dark';
    autoSaveInterval: number;
    maxFileSize: number;
}

export interface WebViewMessage {
    type: string;
    [key: string]: any;
}

export interface ContentChunk {
    content: string;
    start: number;
    end: number;
    totalSize: number;
}

export interface PdfState {
    currentPage: number;
    totalPages: number;
    zoom: number;
    rotation: number;
}

export const ALLOWED_EXTENSIONS = ['.txt', '.pdf'];
export const DEFAULT_SETTINGS: PluginSettings = {
    fontSize: 14,
    fontFamily: "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    lineHeight: 1.8,
    theme: 'auto',
    autoSaveInterval: 3000,
    maxFileSize: 50 * 1024 * 1024 // 50MB
};