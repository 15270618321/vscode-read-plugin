// extension.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// 导入工具类
import { SecurityUtils } from './utils/security';
import { EncodingUtils } from './utils/encodingUtils';
import { FileUtils } from './utils/fileUtils';
import { ThemeUtils } from './utils/themeUtils';
import { debounce, throttle } from './utils/debounce';
import { EventManager } from './managers/eventManager';

// 导入类型定义
import {
    Book,
    PluginSettings,
    DEFAULT_SETTINGS,
    ALLOWED_EXTENSIONS,
    WebViewMessage
} from './types';

// 插件状态管理类
class ReadPluginState {
    private books: Book[] = [];
    private settings: PluginSettings;
    private storagePath: string;
    private eventManager: EventManager;

    constructor(context: vscode.ExtensionContext) {
        this.storagePath = this.getStoragePath(context);
        this.eventManager = new EventManager();
        this.settings = this.loadSettings();
        this.loadBooks();

        // 注册自动保存
        this.registerAutoSave();
    }

    private getStoragePath(context: vscode.ExtensionContext): string {
        if (context.storagePath) {
            return context.storagePath;
        }
        return path.join(os.homedir(), '.vscode-reader');
    }

    private loadSettings(): PluginSettings {
        const settingsPath = path.join(this.storagePath, 'settings.json');
        const defaultSettings = DEFAULT_SETTINGS;

        try {
            return FileUtils.readJsonFile(settingsPath, defaultSettings);
        } catch (error) {
            console.error('Failed to load settings:', error);
            return defaultSettings;
        }
    }

    private loadBooks(): void {
        const booksPath = path.join(this.storagePath, 'books.json');
        try {
            this.books = FileUtils.readJsonFile(booksPath, []);

            // 验证书籍文件是否存在
            this.books = this.books.filter(book => {
                try {
                    if (!fs.existsSync(book.path)) {
                        console.warn(`Book file not found: ${book.path}`);
                        return false;
                    }
                    return true;
                } catch (error) {
                    console.error(`Error checking book file ${book.path}:`, error);
                    return false;
                }
            });

            this.saveBooks();
        } catch (error) {
            console.error('Failed to load books:', error);
            this.books = [];
        }
    }

    private saveBooks(): void {
        const booksPath = path.join(this.storagePath, 'books.json');
        try {
            FileUtils.ensureDirectory(this.storagePath);
            FileUtils.writeJsonFile(booksPath, this.books);
        } catch (error) {
            console.error('Failed to save books:', error);
            vscode.window.showErrorMessage('Failed to save books');
        }
    }

    private saveSettings(): void {
        const settingsPath = path.join(this.storagePath, 'settings.json');
        try {
            FileUtils.ensureDirectory(this.storagePath);
            FileUtils.writeJsonFile(settingsPath, this.settings);
        } catch (error) {
            console.error('Failed to save settings:', error);
            vscode.window.showErrorMessage('Failed to save settings');
        }
    }

    private registerAutoSave(): void {
        const saveDebounced = debounce(() => {
            this.saveBooks();
            this.saveSettings();
        }, this.settings.autoSaveInterval);

        this.eventManager.register({
            dispose: () => {}
        });

        // 每分钟自动保存
        const interval = setInterval(() => {
            saveDebounced();
        }, 60000);

        this.eventManager.register({
            dispose: () => clearInterval(interval)
        });
    }

    // 公开方法
    addBook(bookPath: string): Book {
        try {
            // 安全验证
            SecurityUtils.sanitizePath(bookPath);

            if (!SecurityUtils.validateFileExtension(bookPath, ALLOWED_EXTENSIONS)) {
                throw new Error('Only .txt and .pdf files are supported');
            }

            const fileSize = FileUtils.getFileSize(bookPath);
            if (fileSize > this.settings.maxFileSize) {
                throw new Error(`File too large (max ${this.settings.maxFileSize / 1024 / 1024}MB)`);
            }

            const bookName = path.basename(bookPath);
            const existingBook = this.books.find(b => b.path === bookPath);

            if (existingBook) {
                vscode.window.showInformationMessage(`Book already exists: ${bookName}`);
                return existingBook;
            }

            const book: Book = {
                id: Date.now().toString(),
                name: bookName,
                path: bookPath,
                progress: 0,
                fileSize: fileSize,
                addedTime: Date.now(),
                encoding: EncodingUtils.detectEncoding(bookPath)
            };

            this.books.push(book);
            this.saveBooks();
            return book;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to add book: ${errorMessage}`);
            throw error;
        }
    }

    getBooks(): Book[] {
        return [...this.books];
    }

    getBook(bookId: string): Book | undefined {
        return this.books.find(b => b.id === bookId);
    }

    updateBookProgress(bookId: string, progress: number): void {
        const book = this.books.find(b => b.id === bookId);
        if (book) {
            // 限制范围并保留2位小数
            const formattedProgress = Math.max(0, Math.min(100, Math.round(progress * 100) / 100));
            book.progress = formattedProgress;
            book.lastReadTime = Date.now();

            // 触发自动保存
            const saveDebounced = debounce(() => this.saveBooks(), 1000);
            saveDebounced();
        }
    }

    removeBook(bookId: string): boolean {
        const initialLength = this.books.length;
        this.books = this.books.filter(b => b.id !== bookId);

        if (this.books.length < initialLength) {
            this.saveBooks();
            return true;
        }
        return false;
    }

    getSettings(): PluginSettings {
        return { ...this.settings };
    }

    updateSettings(newSettings: Partial<PluginSettings>): void {
        this.settings = { ...this.settings, ...newSettings };
        this.saveSettings();
    }

    getFontSize(): number {
        return this.settings.fontSize;
    }

    setFontSize(size: number): number {
        this.settings.fontSize = Math.max(8, Math.min(48, Math.round(size)));
        this.saveSettings();
        return this.settings.fontSize;
    }

    increaseFontSize(): number {
        return this.setFontSize(this.settings.fontSize + 2);
    }

    decreaseFontSize(): number {
        return this.setFontSize(this.settings.fontSize - 2);
    }

    dispose(): void {
        this.eventManager.dispose();
        // 最后一次保存
        this.saveBooks();
        this.saveSettings();
    }
}

// 书籍树项
class BookItem extends vscode.TreeItem {
    constructor(public readonly book: Book) {
        super(book.name, vscode.TreeItemCollapsibleState.None);

        const formattedProgress = Math.round(book.progress * 100) / 100;
        this.tooltip = this.getTooltipText();
        this.description = `${formattedProgress}%`;
        this.contextValue = 'bookItem';

        this.command = {
            command: 'readplugin.openBook',
            title: 'Open Book',
            arguments: [book]
        };

        // 设置图标
        const ext = path.extname(book.name).toLowerCase();
        if (ext === '.pdf') {
            this.iconPath = new vscode.ThemeIcon('file-pdf');
        } else {
            this.iconPath = new vscode.ThemeIcon('file-text');
        }
    }

    private getTooltipText(): string {
        const lines = [
            `Name: ${this.book.name}`,
            `Progress: ${Math.round(this.book.progress * 100) / 100}%`,
            `Size: ${this.formatFileSize(this.book.fileSize)}`,
            `Added: ${new Date(this.book.addedTime).toLocaleDateString()}`
        ];

        if (this.book.lastReadTime) {
            lines.push(`Last Read: ${new Date(this.book.lastReadTime).toLocaleString()}`);
        }

        return lines.join('\n');
    }

    private formatFileSize(bytes: number): string {
        if (bytes === 0) {
            return '0 Bytes';
        }
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// 添加书籍项
class AddBookItem extends vscode.TreeItem {
    constructor() {
        super('+ Add Book', vscode.TreeItemCollapsibleState.None);
        this.tooltip = 'Add a new book file';
        this.command = {
            command: 'readplugin.addBook',
            title: 'Add Book'
        };
        this.iconPath = new vscode.ThemeIcon('add');
        this.contextValue = 'addBookItem';
    }
}

// 书籍树数据提供者
class BooksTreeDataProvider implements vscode.TreeDataProvider<BookItem | AddBookItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<BookItem | AddBookItem | undefined | null | void> =
        new vscode.EventEmitter<BookItem | AddBookItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<BookItem | AddBookItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    constructor(private state: ReadPluginState) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    refreshBook(_bookId: string): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: BookItem | AddBookItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: any): Thenable<(BookItem | AddBookItem)[]> {
        if (!element) {
            const books = this.state.getBooks()
                .sort((a, b) => (b.lastReadTime || 0) - (a.lastReadTime || 0))
                .map(book => new BookItem(book));
            return Promise.resolve([new AddBookItem(), ...books]);
        }
        return Promise.resolve([]);
    }
}

// 书籍内容视图提供者
class BookContentViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'read-plugin.bookContent';
    private _view?: vscode.WebviewView;
    private _currentBook?: Book;
    private _state: ReadPluginState;
    private _treeDataProvider?: BooksTreeDataProvider;
    private _eventManager: EventManager;
    private _isLoading: boolean = false;

    constructor(
        private readonly _extensionContext: vscode.ExtensionContext,
        state: ReadPluginState
    ) {
        this._state = state;
        this._eventManager = new EventManager();
    }

    setTreeDataProvider(provider: BooksTreeDataProvider): void {
        this._treeDataProvider = provider;
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionContext.extensionUri]
        };

        // 监听主题变化
        this._eventManager.register(ThemeUtils.onThemeChange(() => {
            if (this._view) {
                this._view.webview.html = this._getHtmlForWebview(this._view.webview);
            }
        }));

        // 清理监听器
        webviewView.onDidDispose(() => {
            this._eventManager.dispose();
        });

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        this._setupMessageHandlers();
    }

    private _setupMessageHandlers(): void {
        if (!this._view) {
            return;
        }

        const messageHandler = this._view.webview.onDidReceiveMessage(
            throttle((data: WebViewMessage) => {
                this._handleWebviewMessage(data);
            }, 100)
        );

        this._eventManager.register(messageHandler);
    }

    private async _handleWebviewMessage(data: WebViewMessage): Promise<void> {
        if (!this._view) {
            return;
        }

        switch (data.type) {
            case 'updateProgress':
                if (this._currentBook && data.progress !== undefined) {
                    this._state.updateBookProgress(this._currentBook.id, data.progress);
                    this._treeDataProvider?.refreshBook(this._currentBook.id);
                }
                break;

            case 'increaseFontSize':
                this._state.increaseFontSize();
                this._updateFontSize(data.scrollPosition);
                break;

            case 'decreaseFontSize':
                this._state.decreaseFontSize();
                this._updateFontSize(data.scrollPosition);
                break;

            case 'setFontSize':
                if (data.fontSize !== undefined) {
                    this._state.setFontSize(data.fontSize);
                    this._updateFontSize(data.scrollPosition);
                }
                break;

            case 'loadPdfFile':
                if (this._currentBook && data.bookId === this._currentBook.id) {
                    this._loadPdfFile(data.bookId);
                }
                break;

            case 'loadMoreContent':
                if (this._currentBook &&
                    data.bookId === this._currentBook.id &&
                    !this._isLoading) {
                    this._loadMoreContent(
                        data.bookId,
                        data.start,
                        data.end,
                        data.scrollPosition
                    );
                }
                break;

            case 'saveBookmark':
                if (this._currentBook) {
                    this._saveBookmark(data.position);
                }
                break;
        }
    }

    openBook(book: Book): void {
        this._currentBook = book;
        if (this._view) {
            this._view.show?.(true);
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        }
    }

    private _updateFontSize(scrollPosition?: number): void {
        if (!this._view) {
            return;
        }

        this._view.webview.postMessage({
            type: 'updateFontSize',
            fontSize: this._state.getFontSize()
        });

        if (scrollPosition !== undefined) {
            setTimeout(() => {
                this._view?.webview.postMessage({
                    type: 'restoreScrollPosition',
                    scrollPosition: scrollPosition
                });
            }, 100);
        }
    }

    private async _loadMoreContent(
        bookId: string,
        start: number,
        end: number,
        scrollPosition?: number
    ): Promise<void> {
        if (!this._currentBook ||
            this._currentBook.id !== bookId ||
            this._isLoading) {
            return;
        }

        this._isLoading = true;

        try {
            const encoding = this._currentBook.encoding || 'utf8';
            const content = EncodingUtils.readFileWithEncoding(
                this._currentBook.path,
                start,
                end,
                encoding
            );

            const escapedContent = SecurityUtils.escapeHtml(content);

            if (this._view) {
                this._view.webview.postMessage({
                    type: 'contentLoaded',
                    content: escapedContent,
                    start: start,
                    end: end,
                    scrollPosition: scrollPosition
                });
            }
        } catch (error) {
            console.error('Failed to load more content:', error);

            if (this._view) {
                this._view.webview.postMessage({
                    type: 'contentError',
                    error: 'Failed to load content'
                });
            }
        } finally {
            this._isLoading = false;
        }
    }

    private async _loadPdfFile(bookId: string): Promise<void> {
        if (!this._currentBook || this._currentBook.id !== bookId) {
            return;
        }

        try {
            const pdfData = fs.readFileSync(this._currentBook.path);
            const base64Data = pdfData.toString('base64');

            if (this._view) {
                this._view.webview.postMessage({
                    type: 'pdfData',
                    data: base64Data
                });
            }
        } catch (error) {
            console.error('Failed to load PDF file:', error);

            if (this._view) {
                this._view.webview.postMessage({
                    type: 'pdfError',
                    error: (error as Error).message || 'Failed to load PDF'
                });
            }
        }
    }

    private _saveBookmark(position: any): void {
        // TODO: 实现书签保存逻辑
        console.log('Save bookmark:', position);
    }

    private _getHtmlForWebview(_webview: vscode.Webview): string {
        const themeColors = ThemeUtils.getThemeColors();
        const settings = this._state.getSettings();

        if (!this._currentBook) {
            return this._getEmptyStateHtml(themeColors);
        }

        const ext = path.extname(this._currentBook.path).toLowerCase();

        if (ext === '.pdf') {
            return this._getPdfHtml(this._currentBook, themeColors, settings);
        } else {
            return this._getTextHtml(this._currentBook, themeColors, settings);
        }
    }

    private _getEmptyStateHtml(themeColors: any): string {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Book Reader</title>
                <style>
                    body {
                        font-family: ${this._state.getSettings().fontFamily};
                        padding: 40px 20px;
                        background-color: ${themeColors.backgroundColor};
                        color: ${themeColors.textColor};
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                        margin: 0;
                        transition: all 0.3s;
                    }
                    .empty-state {
                        text-align: center;
                        max-width: 400px;
                    }
                    .empty-state h2 {
                        font-size: 24px;
                        margin-bottom: 16px;
                        color: ${themeColors.textColor};
                        font-weight: 600;
                    }
                    .empty-state p {
                        font-size: 16px;
                        line-height: 1.6;
                        color: ${themeColors.mutedColor};
                        margin-bottom: 8px;
                    }
                    .empty-state .icon {
                        font-size: 48px;
                        margin-bottom: 24px;
                        opacity: 0.5;
                    }
                    .empty-state .hint {
                        font-size: 14px;
                        color: ${themeColors.mutedColor};
                        margin-top: 24px;
                        padding: 12px;
                        background-color: ${themeColors.backgroundColor === '#1e1e1e' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'};
                        border-radius: 6px;
                    }
                </style>
            </head>
            <body>
                <div class="empty-state">
                    <div class="icon">📚</div>
                    <h2>No Book Selected</h2>
                    <p>Select a book from the sidebar to start reading</p>
                    <p>Or add a new book using the "+ Add Book" button</p>
                    <div class="hint">
                        Supported formats: .txt, .pdf
                    </div>
                </div>
            </body>
            </html>
        `;
    }

    private _getPdfHtml(book: Book, themeColors: any, settings: PluginSettings): string {
        const fontSize = settings.fontSize;

        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${SecurityUtils.escapeHtml(book.name)}</title>
                <style>
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }

                    body {
                        font-family: ${settings.fontFamily};
                        background-color: ${themeColors.backgroundColor};
                        color: ${themeColors.textColor};
                        transition: background-color 0.3s, color 0.3s;
                        font-size: ${fontSize}px;
                        overflow-x: hidden;
                    }

                    #pdf-container {
                        width: 100%;
                        min-height: 100vh;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        padding: 20px;
                    }

                    .pdf-header {
                        width: 100%;
                        max-width: 1200px;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 16px 0;
                        margin-bottom: 20px;
                        border-bottom: 1px solid ${themeColors.borderColor};
                    }

                    .book-title {
                        font-size: 18px;
                        font-weight: 600;
                        color: ${themeColors.textColor};
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        flex: 1;
                    }

                    .pdf-controls {
                        display: flex;
                        gap: 8px;
                        flex-wrap: wrap;
                    }

                    .control-btn {
                        background-color: ${themeColors.backgroundColor === '#1e1e1e' ? '#333' : '#f0f0f0'};
                        color: ${themeColors.textColor};
                        border: 1px solid ${themeColors.borderColor};
                        border-radius: 4px;
                        padding: 8px 16px;
                        font-size: 14px;
                        cursor: pointer;
                        transition: all 0.2s;
                        display: flex;
                        align-items: center;
                        gap: 6px;
                    }

                    .control-btn:hover {
                        background-color: ${themeColors.backgroundColor === '#1e1e1e' ? '#444' : '#e0e0e0'};
                        transform: translateY(-1px);
                    }

                    .control-btn:active {
                        transform: translateY(0);
                    }

                    .control-btn:disabled {
                        opacity: 0.5;
                        cursor: not-allowed;
                        transform: none;
                    }

                    #pdf-canvas-container {
                        width: 100%;
                        max-width: 1200px;
                        overflow: auto;
                        background-color: ${themeColors.backgroundColor === '#1e1e1e' ? '#000' : '#fff'};
                        border-radius: 8px;
                        box-shadow: 0 4px 12px ${themeColors.backgroundColor === '#1e1e1e' ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.1)'};
                        margin-bottom: 20px;
                    }

                    #pdf-canvas {
                        display: block;
                        margin: 0 auto;
                        max-width: 100%;
                    }

                    .page-navigation {
                        display: flex;
                        align-items: center;
                        gap: 16px;
                        margin-top: 20px;
                    }

                    .page-input {
                        width: 80px;
                        padding: 8px;
                        text-align: center;
                        border: 1px solid ${themeColors.borderColor};
                        border-radius: 4px;
                        background-color: ${themeColors.backgroundColor === '#1e1e1e' ? '#333' : '#fff'};
                        color: ${themeColors.textColor};
                        font-size: 14px;
                    }

                    .page-input:focus {
                        outline: none;
                        border-color: ${themeColors.backgroundColor === '#1e1e1e' ? '#666' : '#999'};
                    }

                    .page-info {
                        font-size: 14px;
                        color: ${themeColors.mutedColor};
                    }

                    .loading {
                        text-align: center;
                        padding: 60px 20px;
                        color: ${themeColors.mutedColor};
                        font-style: italic;
                    }

                    .zoom-controls {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        margin-left: 20px;
                    }

                    .zoom-value {
                        min-width: 60px;
                        text-align: center;
                        font-size: 14px;
                        color: ${themeColors.mutedColor};
                    }

                    @media (max-width: 768px) {
                        .pdf-header {
                            flex-direction: column;
                            gap: 12px;
                            align-items: stretch;
                        }

                        .book-title {
                            text-align: center;
                        }

                        .pdf-controls {
                            justify-content: center;
                        }

                        .control-btn {
                            padding: 6px 12px;
                            font-size: 13px;
                        }

                        .page-navigation {
                            flex-wrap: wrap;
                            justify-content: center;
                        }
                    }
                </style>
                <!-- PDF.js -->
                <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
            </head>
            <body>
                <div id="pdf-container">
                    <div class="pdf-header">
                        <div class="book-title">${SecurityUtils.escapeHtml(book.name)}</div>
                        <div class="pdf-controls">
                            <button id="prev-page" class="control-btn">← Prev</button>
                            <div class="page-navigation">
                                <input type="number" id="page-input" class="page-input" min="1" value="1">
                                <span class="page-info">of <span id="total-pages">?</span></span>
                            </div>
                            <button id="next-page" class="control-btn">Next →</button>

                            <div class="zoom-controls">
                                <button id="zoom-out" class="control-btn">-</button>
                                <span id="zoom-value" class="zoom-value">150%</span>
                                <button id="zoom-in" class="control-btn">+</button>
                            </div>
                        </div>
                    </div>

                    <div id="pdf-canvas-container">
                        <div id="loading" class="loading">Loading PDF...</div>
                        <canvas id="pdf-canvas"></canvas>
                    </div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    const isDarkTheme = ${themeColors.backgroundColor === '#1e1e1e'};

                    // PDF状态
                    let pdfDoc = null;
                    let currentPage = 1;
                    let totalPages = 0;
                    let zoom = 1.5;
                    let isRendering = false;

                    // 元素
                    const canvas = document.getElementById('pdf-canvas');
                    const ctx = canvas.getContext('2d');
                    const loadingEl = document.getElementById('loading');
                    const pageInput = document.getElementById('page-input');
                    const totalPagesEl = document.getElementById('total-pages');
                    const zoomValueEl = document.getElementById('zoom-value');

                    // 初始化
                    loadPDF();

                    async function loadPDF() {
                        try {
                            vscode.postMessage({
                                type: 'loadPdfFile',
                                bookId: '${book.id}'
                            });
                        } catch (error) {
                            showError('Failed to load PDF');
                        }
                    }

                    // 消息监听
                    window.addEventListener('message', async event => {
                        const message = event.data;

                        if (message.type === 'pdfData') {
                            try {
                                const binaryString = atob(message.data);
                                const len = binaryString.length;
                                const bytes = new Uint8Array(len);
                                for (let i = 0; i < len; i++) {
                                    bytes[i] = binaryString.charCodeAt(i);
                                }
                                const arrayBuffer = bytes.buffer;

                                const loadingTask = pdfjsLib.getDocument({
                                    data: arrayBuffer,
                                    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
                                    cMapPacked: true
                                });

                                pdfDoc = await loadingTask.promise;
                                totalPages = pdfDoc.numPages;
                                totalPagesEl.textContent = totalPages;
                                pageInput.max = totalPages;
                                loadingEl.style.display = 'none';

                                await renderPage(currentPage);
                                updateProgress();

                            } catch (error) {
                                showError('Failed to process PDF: ' + error.message);
                            }

                        } else if (message.type === 'pdfError') {
                            showError(message.error || 'Failed to load PDF');
                        }
                    });

                    async function renderPage(pageNum) {
                        if (!pdfDoc || isRendering) return;

                        isRendering = true;
                        currentPage = pageNum;
                        pageInput.value = currentPage;

                        try {
                            const page = await pdfDoc.getPage(pageNum);
                            const viewport = page.getViewport({ scale: zoom });

                            canvas.width = viewport.width;
                            canvas.height = viewport.height;

                            // 设置背景
                            ctx.fillStyle = isDarkTheme ? '#000000' : '#ffffff';
                            ctx.fillRect(0, 0, canvas.width, canvas.height);

                            const renderContext = {
                                canvasContext: ctx,
                                viewport: viewport
                            };

                            await page.render(renderContext).promise;

                            // 暗色主题处理
                            if (isDarkTheme) {
                                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                                const data = imageData.data;

                                for (let i = 0; i < data.length; i += 4) {
                                    // 反转颜色
                                    data[i] = 255 - data[i];     // R
                                    data[i + 1] = 255 - data[i + 1]; // G
                                    data[i + 2] = 255 - data[i + 2]; // B
                                }

                                ctx.putImageData(imageData, 0, 0);
                            }

                            // 更新缩放显示
                            zoomValueEl.textContent = Math.round(zoom * 100) + '%';

                        } catch (error) {
                            console.error('Error rendering page:', error);
                            showError('Failed to render page');
                        } finally {
                            isRendering = false;
                        }
                    }

                    function updateProgress() {
                        const progress = (currentPage / totalPages) * 100;
                        const formattedProgress = Math.round(progress * 100) / 100;
                        vscode.postMessage({
                            type: 'updateProgress',
                            progress: formattedProgress
                        });
                    }

                    function showError(message) {
                        loadingEl.textContent = 'Error: ' + message;
                        loadingEl.style.color = '#ff6b6b';
                    }

                    // 事件绑定
                    document.getElementById('prev-page').addEventListener('click', () => {
                        if (currentPage > 1) {
                            renderPage(currentPage - 1);
                        }
                    });

                    document.getElementById('next-page').addEventListener('click', () => {
                        if (currentPage < totalPages) {
                            renderPage(currentPage + 1);
                        }
                    });

                    document.getElementById('zoom-in').addEventListener('click', () => {
                        zoom *= 1.2;
                        renderPage(currentPage);
                    });

                    document.getElementById('zoom-out').addEventListener('click', () => {
                        zoom = Math.max(0.5, zoom / 1.2);
                        renderPage(currentPage);
                    });

                    pageInput.addEventListener('change', () => {
                        const page = parseInt(pageInput.value);
                        if (page >= 1 && page <= totalPages && page !== currentPage) {
                            renderPage(page);
                        } else {
                            pageInput.value = currentPage;
                        }
                    });

                    pageInput.addEventListener('keypress', (e) => {
                        if (e.key === 'Enter') {
                            pageInput.blur();
                        }
                    });

                    // 键盘快捷键
                    document.addEventListener('keydown', (e) => {
                        if (e.target === pageInput) return;

                        switch(e.key) {
                            case 'ArrowLeft':
                            case 'PageUp':
                                if (currentPage > 1) {
                                    e.preventDefault();
                                    renderPage(currentPage - 1);
                                }
                                break;
                            case 'ArrowRight':
                            case 'PageDown':
                            case ' ':
                                if (currentPage < totalPages) {
                                    e.preventDefault();
                                    renderPage(currentPage + 1);
                                }
                                break;
                            case '+':
                            case '=':
                                if (e.ctrlKey || e.metaKey) {
                                    e.preventDefault();
                                    zoom *= 1.2;
                                    renderPage(currentPage);
                                }
                                break;
                            case '-':
                                if (e.ctrlKey || e.metaKey) {
                                    e.preventDefault();
                                    zoom = Math.max(0.5, zoom / 1.2);
                                    renderPage(currentPage);
                                }
                                break;
                        }
                    });
                </script>
            </body>
            </html>
        `;
    }

    private _getTextHtml(book: Book, themeColors: any, settings: PluginSettings): string {
        const fontSize = settings.fontSize;
        const lineHeight = settings.lineHeight;

        // 计算初始加载范围
        const fileSize = book.fileSize;
        const chunkSize = 50 * 1024; // 50KB
        const initialStart = Math.floor((book.progress / 100) * fileSize);
        const start = Math.max(0, initialStart - chunkSize);
        const end = Math.min(fileSize, initialStart + chunkSize * 2);

        // 读取初始内容
        let initialContent = 'Failed to load book content';
        try {
            const encoding = book.encoding || 'utf8';
            const content = EncodingUtils.readFileWithEncoding(book.path, start, end, encoding);
            initialContent = SecurityUtils.escapeHtml(content);
        } catch (error) {
            console.error('Failed to read initial content:', error);
        }

        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${SecurityUtils.escapeHtml(book.name)}</title>
                <style>
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }

                    body {
                        font-family: ${settings.fontFamily};
                        background-color: ${themeColors.backgroundColor};
                        color: ${themeColors.textColor};
                        line-height: ${lineHeight};
                        transition: all 0.3s;
                        font-size: ${fontSize}px;
                    }

                    .book-container {
                        max-width: 800px;
                        margin: 0 auto;
                        padding: 40px 20px;
                    }

                    .book-header {
                        margin-bottom: 32px;
                        padding-bottom: 16px;
                        border-bottom: 1px solid ${themeColors.borderColor};
                    }

                    .book-title {
                        font-size: 24px;
                        font-weight: 700;
                        color: ${themeColors.textColor};
                        margin-bottom: 8px;
                        word-break: break-word;
                    }

                    .book-meta {
                        font-size: 14px;
                        color: ${themeColors.mutedColor};
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        flex-wrap: wrap;
                        gap: 12px;
                    }

                    .book-content {
                        background-color: ${themeColors.backgroundColor === '#1e1e1e' ? '#252526' : '#ffffff'};
                        border-radius: 12px;
                        padding: 32px;
                        box-shadow: 0 4px 16px ${themeColors.backgroundColor === '#1e1e1e' ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.08)'};
                        transition: all 0.3s;
                        position: relative;
                        white-space: pre-wrap;
                        word-wrap: break-word;
                        overflow-wrap: break-word;
                    }

                    .content-text {
                        font-size: ${fontSize}px;
                        line-height: ${lineHeight};
                        transition: font-size 0.3s;
                        min-height: 400px;
                    }

                    .font-controls-fixed {
                        position: fixed;
                        top: 50%;
                        right: 20px;
                        transform: translateY(-50%);
                        display: flex;
                        flex-direction: column;
                        gap: 12px;
                        z-index: 1000;
                        background-color: ${themeColors.backgroundColor === '#1e1e1e' ? 'rgba(37, 37, 38, 0.95)' : 'rgba(255, 255, 255, 0.95)'};
                        padding: 16px;
                        border-radius: 12px;
                        box-shadow: 0 4px 20px ${themeColors.backgroundColor === '#1e1e1e' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.1)'};
                        backdrop-filter: blur(10px);
                        border: 1px solid ${themeColors.borderColor};
                    }

                    .font-btn {
                        background-color: ${themeColors.backgroundColor === '#1e1e1e' ? '#333' : '#f5f5f5'};
                        color: ${themeColors.textColor};
                        border: 1px solid ${themeColors.borderColor};
                        border-radius: 8px;
                        padding: 12px;
                        font-size: 16px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                        width: 48px;
                        height: 48px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        user-select: none;
                    }

                    .font-btn:hover {
                        background-color: ${themeColors.backgroundColor === '#1e1e1e' ? '#444' : '#e8e8e8'};
                        transform: translateY(-2px);
                        box-shadow: 0 4px 8px ${themeColors.backgroundColor === '#1e1e1e' ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.1)'};
                    }

                    .font-btn:active {
                        transform: translateY(0);
                    }

                    .font-size-display {
                        text-align: center;
                        font-size: 12px;
                        color: ${themeColors.mutedColor};
                        margin-top: 4px;
                        font-weight: 500;
                    }

                    .loading-indicator {
                        text-align: center;
                        padding: 32px;
                        color: ${themeColors.mutedColor};
                        font-style: italic;
                        font-size: 14px;
                        display: none;
                    }

                    .progress-indicator {
                        position: fixed;
                        bottom: 20px;
                        right: 20px;
                        background-color: ${themeColors.backgroundColor === '#1e1e1e' ? 'rgba(37, 37, 38, 0.95)' : 'rgba(255, 255, 255, 0.95)'};
                        padding: 8px 16px;
                        border-radius: 20px;
                        font-size: 12px;
                        color: ${themeColors.mutedColor};
                        border: 1px solid ${themeColors.borderColor};
                        backdrop-filter: blur(10px);
                        z-index: 999;
                    }

                    .chapter-navigation {
                        position: fixed;
                        bottom: 20px;
                        left: 50%;
                        transform: translateX(-50%);
                        display: flex;
                        gap: 12px;
                        background-color: ${themeColors.backgroundColor === '#1e1e1e' ? 'rgba(37, 37, 38, 0.95)' : 'rgba(255, 255, 255, 0.95)'};
                        padding: 8px 16px;
                        border-radius: 20px;
                        backdrop-filter: blur(10px);
                        border: 1px solid ${themeColors.borderColor};
                        z-index: 999;
                    }

                    .nav-btn {
                        background: none;
                        border: none;
                        color: ${themeColors.textColor};
                        cursor: pointer;
                        padding: 4px 12px;
                        border-radius: 4px;
                        font-size: 14px;
                        transition: background-color 0.2s;
                    }

                    .nav-btn:hover {
                        background-color: ${themeColors.backgroundColor === '#1e1e1e' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'};
                    }

                    @media (max-width: 768px) {
                        .book-container {
                            padding: 20px 16px;
                        }

                        .book-content {
                            padding: 24px;
                        }

                        .font-controls-fixed {
                            right: 10px;
                            padding: 12px;
                        }

                        .font-btn {
                            width: 40px;
                            height: 40px;
                            font-size: 14px;
                        }

                        .chapter-navigation {
                            bottom: 10px;
                            padding: 6px 12px;
                        }

                        .progress-indicator {
                            bottom: 10px;
                            right: 10px;
                        }
                    }

                    @media (max-width: 480px) {
                        .book-title {
                            font-size: 20px;
                        }

                        .book-meta {
                            flex-direction: column;
                            align-items: flex-start;
                            gap: 8px;
                        }

                        .font-controls-fixed {
                            flex-direction: row;
                            top: auto;
                            bottom: 80px;
                            right: 50%;
                            transform: translateX(50%);
                            padding: 8px 16px;
                        }

                        .font-btn {
                            width: 36px;
                            height: 36px;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="book-container">
                    <div class="book-header">
                        <h1 class="book-title">${SecurityUtils.escapeHtml(book.name)}</h1>
                        <div class="book-meta">
                            <span>${this._formatFileSize(book.fileSize)} • ${new Date(book.addedTime).toLocaleDateString()}</span>
                            <span>Progress: ${Math.round(book.progress * 100) / 100}%</span>
                        </div>
                    </div>

                    <div class="book-content">
                        <div id="content" class="content-text"
                             data-start="${start}"
                             data-end="${end}"
                             data-total="${fileSize}">
                            ${initialContent}
                        </div>
                        <div id="loading" class="loading-indicator">Loading more content...</div>
                    </div>
                </div>

                <div class="font-controls-fixed">
                    <button id="decrease-font" class="font-btn" title="Decrease font size (Ctrl+-)">
                        A−
                    </button>
                    <div class="font-size-display" id="font-size-display">${fontSize}px</div>
                    <button id="increase-font" class="font-btn" title="Increase font size (Ctrl+=)">
                        A+
                    </button>
                </div>

                <div class="progress-indicator" id="progress-indicator">
                    ${Math.round(book.progress * 100) / 100}%
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    const isDarkTheme = ${themeColors.backgroundColor === '#1e1e1e'};

                    // 书籍信息
                    const bookInfo = {
                        id: '${book.id}',
                        filePath: '${SecurityUtils.escapeHtml(book.path)}',
                        fileSize: ${fileSize},
                        chunkSize: ${chunkSize},
                        encoding: '${book.encoding || 'utf8'}'
                    };

                    // 状态
                    let currentFontSize = ${fontSize};
                    let isLoading = false;
                    let lastScrollTime = 0;
                    let lastProgress = ${book.progress};

                    // 元素
                    const contentEl = document.getElementById('content');
                    const loadingEl = document.getElementById('loading');
                    const progressIndicator = document.getElementById('progress-indicator');
                    const fontSizeDisplay = document.getElementById('font-size-display');

                    // 防抖函数
                    function debounce(func, wait) {
                        let timeout;
                        return function executedFunction(...args) {
                            const later = () => {
                                clearTimeout(timeout);
                                func(...args);
                            };
                            clearTimeout(timeout);
                            timeout = setTimeout(later, wait);
                        };
                    }

                    // 保存滚动位置
                    function saveScrollPosition() {
                        return {
                            top: window.scrollY,
                            height: document.documentElement.scrollHeight,
                            clientHeight: window.innerHeight
                        };
                    }

                    // 恢复滚动位置
                    function restoreScrollPosition(position) {
                        if (position && position.top !== undefined) {
                            window.scrollTo(0, position.top);
                        }
                    }

                    // 更新字体大小
                    function updateFontSize(size) {
                        currentFontSize = size;
                        contentEl.style.fontSize = size + 'px';
                        fontSizeDisplay.textContent = size + 'px';

                        // 保存到localStorage
                        localStorage.setItem('readplugin-fontsize-' + bookInfo.id, size.toString());
                    }

                    // 更新进度
                    const updateProgress = debounce(function() {
                        const scrollTop = window.scrollY;
                        const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;

                        if (scrollHeight > 0) {
                            const progress = Math.min(100, Math.max(0, (scrollTop / scrollHeight) * 100));
                            const formattedProgress = Math.round(progress * 100) / 100;

                            if (Math.abs(formattedProgress - lastProgress) >= 0.1) {
                                lastProgress = formattedProgress;
                                progressIndicator.textContent = formattedProgress + '%';

                                vscode.postMessage({
                                    type: 'updateProgress',
                                    progress: formattedProgress
                                });
                            }
                        }
                    }, 1000);

                    // 加载更多内容
                    async function loadMoreContent(direction) {
                        if (isLoading) return;

                        isLoading = true;
                        loadingEl.style.display = 'block';
                        const scrollPosition = saveScrollPosition();

                        try {
                            const currentStart = parseInt(contentEl.dataset.start);
                            const currentEnd = parseInt(contentEl.dataset.end);
                            let newStart = currentStart;
                            let newEnd = currentEnd;

                            if (direction === 'up' && currentStart > 0) {
                                newStart = Math.max(0, currentStart - bookInfo.chunkSize);
                            } else if (direction === 'down' && currentEnd < bookInfo.fileSize) {
                                newEnd = Math.min(bookInfo.fileSize, currentEnd + bookInfo.chunkSize);
                            } else {
                                return;
                            }

                            vscode.postMessage({
                                type: 'loadMoreContent',
                                bookId: bookInfo.id,
                                start: newStart,
                                end: newEnd,
                                scrollPosition: scrollPosition
                            });

                        } catch (error) {
                            console.error('Failed to load more content:', error);
                            loadingEl.textContent = 'Error loading content';
                        }
                    }

                    // 事件监听
                    document.getElementById('increase-font').addEventListener('click', () => {
                        const scrollPosition = saveScrollPosition();
                        vscode.postMessage({
                            type: 'increaseFontSize',
                            scrollPosition: scrollPosition
                        });
                    });

                    document.getElementById('decrease-font').addEventListener('click', () => {
                        const scrollPosition = saveScrollPosition();
                        vscode.postMessage({
                            type: 'decreaseFontSize',
                            scrollPosition: scrollPosition
                        });
                    });

                    // 滚动事件 - 防抖处理
                    const handleScroll = debounce(function() {
                        updateProgress();

                        // 检测是否需要加载更多内容
                        const scrollTop = window.scrollY;
                        const scrollHeight = document.documentElement.scrollHeight;
                        const clientHeight = window.innerHeight;
                        const threshold = 500;

                        if (scrollTop < threshold) {
                            loadMoreContent('up');
                        } else if (scrollTop > scrollHeight - clientHeight - threshold) {
                            loadMoreContent('down');
                        }
                    }, 200);

                    window.addEventListener('scroll', handleScroll);

                    // 键盘快捷键
                    document.addEventListener('keydown', (e) => {
                        if (e.ctrlKey || e.metaKey) {
                            switch(e.key) {
                                case '=':
                                case '+':
                                    e.preventDefault();
                                    const pos1 = saveScrollPosition();
                                    vscode.postMessage({
                                        type: 'increaseFontSize',
                                        scrollPosition: pos1
                                    });
                                    break;
                                case '-':
                                    e.preventDefault();
                                    const pos2 = saveScrollPosition();
                                    vscode.postMessage({
                                        type: 'decreaseFontSize',
                                        scrollPosition: pos2
                                    });
                                    break;
                            }
                        }
                    });

                    // 消息监听
                    window.addEventListener('message', (event) => {
                        const message = event.data;

                        switch (message.type) {
                            case 'contentLoaded':
                                contentEl.innerHTML = message.content;
                                contentEl.dataset.start = message.start;
                                contentEl.dataset.end = message.end;
                                loadingEl.style.display = 'none';
                                isLoading = false;

                                if (message.scrollPosition) {
                                    restoreScrollPosition(message.scrollPosition);
                                }
                                break;

                            case 'contentError':
                                loadingEl.textContent = message.error || 'Error loading content';
                                loadingEl.style.color = '#ff6b6b';
                                isLoading = false;
                                break;

                            case 'updateFontSize':
                                updateFontSize(message.fontSize);
                                break;

                            case 'restoreScrollPosition':
                                restoreScrollPosition(message.scrollPosition);
                                break;
                        }
                    });

                    // 初始加载
                    window.addEventListener('load', () => {
                        // 恢复字体大小
                        const savedFontSize = localStorage.getItem('readplugin-fontsize-' + bookInfo.id);
                        if (savedFontSize) {
                            const size = parseInt(savedFontSize);
                            if (!isNaN(size) && size >= 8 && size <= 48) {
                                updateFontSize(size);
                            }
                        }

                        // 滚动到上次阅读位置
                        const progress = ${book.progress};
                        if (progress > 0) {
                            const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
                            const scrollTop = (progress / 100) * scrollHeight;
                            window.scrollTo(0, scrollTop);
                        }

                        // 初始进度更新
                        updateProgress();
                    });
                </script>
            </body>
            </html>
        `;
    }

    private _formatFileSize(bytes: number): string {
        if (bytes === 0) {
            return '0 Bytes';
        }
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    updateFontSize(scrollPosition?: number): void {
        if (!this._view) {
            return;
        }

        this._view.webview.postMessage({
            type: 'updateFontSize',
            fontSize: this._state.getFontSize()
        });

        if (scrollPosition !== undefined) {
            setTimeout(() => {
                this._view?.webview.postMessage({
                    type: 'restoreScrollPosition',
                    scrollPosition: scrollPosition
                });
            }, 100);
        }
    }

    dispose(): void {
        this._eventManager.dispose();
    }
}

// 激活插件
export function activate(context: vscode.ExtensionContext): void {
    console.log('Read Plugin is now active!');

    // 初始化状态
    const state = new ReadPluginState(context);

    // 注册书籍视图
    const booksTreeDataProvider = new BooksTreeDataProvider(state);
    vscode.window.registerTreeDataProvider('read-plugin-books', booksTreeDataProvider);

    // 注册书籍内容视图
    const bookContentProvider = new BookContentViewProvider(context, state);
    bookContentProvider.setTreeDataProvider(booksTreeDataProvider);

    const contentViewProvider = vscode.window.registerWebviewViewProvider(
        BookContentViewProvider.viewType,
        bookContentProvider
    );

    // 注册命令
    const commands = [
        // 添加书籍
        vscode.commands.registerCommand('readplugin.addBook', async () => {
            const fileUri = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: {
                    'Books': ['txt', 'pdf'],
                    'Text Files': ['txt'],
                    'PDF Files': ['pdf']
                },
                openLabel: 'Add Book'
            });

            if (fileUri && fileUri[0]) {
                try {
                    const filePath = fileUri[0].fsPath;
                    const book = state.addBook(filePath);
                    booksTreeDataProvider.refresh();

                    vscode.window.showInformationMessage(
                        `Added book: ${book.name}`,
                        'Open'
                    ).then(choice => {
                        if (choice === 'Open') {
                            bookContentProvider.openBook(book);
                        }
                    });
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    vscode.window.showErrorMessage(`Failed to add book: ${errorMessage}`);
                }
            }
        }),

        // 打开书籍
        vscode.commands.registerCommand('readplugin.openBook', (book: Book) => {
            bookContentProvider.openBook(book);
        }),

        // 删除书籍
        vscode.commands.registerCommand('readplugin.removeBook', async (bookItem: BookItem) => {
            const choice = await vscode.window.showWarningMessage(
                `Are you sure you want to remove "${bookItem.book.name}" from your library?`,
                { modal: true },
                'Remove',
                'Cancel'
            );

            if (choice === 'Remove') {
                const success = state.removeBook(bookItem.book.id);
                if (success) {
                    booksTreeDataProvider.refresh();
                    vscode.window.showInformationMessage(`Removed book: ${bookItem.book.name}`);
                }
            }
        }),

        // 增加字体大小
        vscode.commands.registerCommand('readplugin.increaseFontSize', () => {
            state.increaseFontSize();
            bookContentProvider.updateFontSize();
        }),

        // 减小字体大小
        vscode.commands.registerCommand('readplugin.decreaseFontSize', () => {
            state.decreaseFontSize();
            bookContentProvider.updateFontSize();
        }),

        // 重置字体大小
        vscode.commands.registerCommand('readplugin.resetFontSize', () => {
            state.setFontSize(DEFAULT_SETTINGS.fontSize);
            bookContentProvider.updateFontSize();
        }),

        // 打开设置
        vscode.commands.registerCommand('readplugin.openSettings', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'readplugin');
        })
    ];

    // 添加到订阅
    commands.forEach(command => context.subscriptions.push(command));
    context.subscriptions.push(contentViewProvider);

    // 插件禁用时清理
    context.subscriptions.push({
        dispose: () => {
            state.dispose();
            bookContentProvider.dispose();
        }
    });
}

// 停用插件
export function deactivate(): void {
    console.log('Read Plugin is now deactivated!');
}