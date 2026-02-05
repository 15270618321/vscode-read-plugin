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

// 导入服务
import { WechatReadService } from './services/wechatReadService';

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

    async syncWechatBooks(): Promise<Book[]> {
        const service = new WechatReadService(this.settings);

        try {
            const wechatBooks = await service.getBooks(this.settings.wechatReadSynckey || 0);

            // 更新本地存储的微信读书书籍
            const localBooks = this.books.filter(book => book.type !== 'wechat');
            this.books = [...localBooks, ...wechatBooks];

            // 更新synckey
            if (wechatBooks.length > 0 && wechatBooks[0].synckey) {
                this.settings.wechatReadSynckey = wechatBooks[0].synckey;
                this.saveSettings();
            }

            this.saveBooks();
            return wechatBooks;
        } catch (error) {
            console.error('Failed to sync WeChat books:', error);
            vscode.window.showErrorMessage('Failed to sync WeChat books');
            return [];
        }
    }

    getWechatBooks(): Book[] {
        return this.books.filter(book => book.type === 'wechat');
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
        if (book.type === 'wechat') {
            this.iconPath = new vscode.ThemeIcon('book');
        } else {
            const ext = path.extname(book.name).toLowerCase();
            if (ext === '.pdf') {
                this.iconPath = new vscode.ThemeIcon('file-pdf');
            } else {
                this.iconPath = new vscode.ThemeIcon('file-text');
            }
        }
    }

    private getTooltipText(): string {
        const lines = [
            `Name: ${this.book.name}`,
            `Progress: ${Math.round(this.book.progress * 100) / 100}%`,
            `Added: ${new Date(this.book.addedTime).toLocaleDateString()}`
        ];

        if (this.book.type === 'wechat') {
            lines.push(`Type: WeChat Read`);
            if (this.book.author) {
                lines.push(`Author: ${this.book.author}`);
            }
            if (this.book.bookId) {
                lines.push(`Book ID: ${this.book.bookId}`);
            }
        } else {
            lines.push(`Size: ${this.formatFileSize(this.book.fileSize)}`);
            if (this.book.encoding) {
                lines.push(`Encoding: ${this.book.encoding}`);
            }
        }

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

// 微信读书登录项
class WechatLoginItem extends vscode.TreeItem {
    constructor() {
        super('🔐 Login to WeChat Read', vscode.TreeItemCollapsibleState.None);
        this.tooltip = 'Login to WeChat Read to access your books';
        this.command = {
            command: 'readplugin.loginWechatRead',
            title: 'Login to WeChat Read'
        };
        this.iconPath = new vscode.ThemeIcon('key');
        this.contextValue = 'wechatLoginItem';
    }
}

// 微信读书同步项
class WechatSyncItem extends vscode.TreeItem {
    constructor() {
        super('🔄 Sync WeChat Books', vscode.TreeItemCollapsibleState.None);
        this.tooltip = 'Sync your WeChat Read books';
        this.command = {
            command: 'readplugin.syncWechatBooks',
            title: 'Sync WeChat Books'
        };
        this.iconPath = new vscode.ThemeIcon('sync');
        this.contextValue = 'wechatSyncItem';
    }
}

// 微信读书状态项
class WechatStatusItem extends vscode.TreeItem {
    constructor(status: string) {
        super(`📱 WeChat Read: ${status}`, vscode.TreeItemCollapsibleState.None);
        this.tooltip = `WeChat Read status: ${status}`;
        this.iconPath = new vscode.ThemeIcon('info');
        this.contextValue = 'wechatStatusItem';
    }
}

// 书籍树数据提供者
class BooksTreeDataProvider implements vscode.TreeDataProvider<BookItem | AddBookItem | WechatLoginItem | WechatSyncItem | WechatStatusItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<BookItem | AddBookItem | WechatLoginItem | WechatSyncItem | WechatStatusItem | undefined | null | void> =
        new vscode.EventEmitter<BookItem | AddBookItem | WechatLoginItem | WechatSyncItem | WechatStatusItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<BookItem | AddBookItem | WechatLoginItem | WechatSyncItem | WechatStatusItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    constructor(private state: ReadPluginState) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    refreshBook(_bookId: string): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: BookItem | AddBookItem | WechatLoginItem | WechatSyncItem | WechatStatusItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: any): Thenable<(BookItem | AddBookItem | WechatLoginItem | WechatSyncItem | WechatStatusItem)[]> {
        if (!element) {
            const items: (BookItem | AddBookItem | WechatLoginItem | WechatSyncItem | WechatStatusItem)[] = [];

            // 添加添加书籍项
            items.push(new AddBookItem());

            // 添加微信读书相关项
            const settings = this.state.getSettings();
            if (settings.wechatReadToken && settings.wechatReadUserId) {
                items.push(new WechatStatusItem('LoggedIn'));
                items.push(new WechatSyncItem());
            } else {
                items.push(new WechatStatusItem('Not Logged In'));
                items.push(new WechatLoginItem());
            }

            // 添加书籍列表
            const books = this.state.getBooks()
                .sort((a, b) => (b.lastReadTime || 0) - (a.lastReadTime || 0))
                .map(book => new BookItem(book));
            items.push(...books);

            return Promise.resolve(items);
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
        console.log('Received message from webview:', data);
        if (!this._view) {
            console.log('No view available, ignoring message');
            return;
        }

        switch (data.type) {
            case 'updateProgress':
                if (this._currentBook && data.progress !== undefined) {
                    console.log('Updating book progress:', { bookId: this._currentBook.id, progress: data.progress });
                    this._state.updateBookProgress(this._currentBook.id, data.progress);
                    this._treeDataProvider?.refreshBook(this._currentBook.id);
                }
                break;

            case 'increaseFontSize':
                if (this._currentBook) {
                    console.log('Increasing font size for book:', this._currentBook.id);
                    const newSize = this._state.increaseFontSize();
                    console.log('New font size:', newSize);
                    this._updateFontSize(data.scrollPosition);
                } else {
                    console.log('No current book for increaseFontSize');
                }
                break;

            case 'decreaseFontSize':
                if (this._currentBook) {
                    console.log('Decreasing font size for book:', this._currentBook.id);
                    const newSize = this._state.decreaseFontSize();
                    console.log('New font size:', newSize);
                    this._updateFontSize(data.scrollPosition);
                } else {
                    console.log('No current book for decreaseFontSize');
                }
                break;

            case 'setFontSize':
                if (this._currentBook && data.fontSize !== undefined) {
                    console.log('Setting font size for book:', { bookId: this._currentBook.id, fontSize: data.fontSize });
                    const newSize = this._state.setFontSize(data.fontSize);
                    console.log('New font size:', newSize);
                    this._updateFontSize(data.scrollPosition);
                } else {
                    console.log('No current book or fontSize for setFontSize');
                }
                break;

            case 'loadPdfFile':
                if (this._currentBook && data.bookId === this._currentBook.id) {
                    this._loadPdfFile(data.bookId);
                }
                break;

            case 'loadMoreContent':
                if (this._currentBook && data.start !== undefined && data.end !== undefined) {
                    console.log('Loading more content:', { bookId: this._currentBook.id, start: data.start, end: data.end });
                    try {
                        const encoding = data.encoding || this._currentBook.encoding || 'utf8';
                        const content = EncodingUtils.readFileWithEncoding(this._currentBook.path, data.start, data.end, encoding);
                        const escapedContent = SecurityUtils.escapeHtml(content);

                        this._view.webview.postMessage({
                            type: 'moreContent',
                            content: escapedContent,
                            start: data.start,
                            end: data.end,
                            bookId: this._currentBook.id
                        });
                    } catch (error) {
                        console.error('Failed to load more content:', error);
                        this._view.webview.postMessage({
                            type: 'contentError',
                            error: (error as Error).message || 'Failed to load more content',
                            bookId: this._currentBook.id
                        });
                    }
                }
                break;

            case 'saveBookmark':
                if (this._currentBook) {
                    this._saveBookmark(data.position);
                }
                break;
            case 'syncWechatProgress':
                if (this._currentBook && this._currentBook.type === 'wechat' && this._currentBook.bookId) {
                    this._syncWechatProgress(this._currentBook.id, this._currentBook.bookId);
                }
                break;
        }
    }

    openBook(book: Book): void {
        console.log('Opening book:', { id: book.id, name: book.name, size: book.fileSize });
        this._currentBook = book;
        if (this._view) {
            console.log('View available, updating HTML');
            try {
                const html = this._getHtmlForWebview(this._view.webview);
                console.log('Generated HTML length:', html.length);
                this._view.show?.(true);
                this._view.webview.html = html;
                console.log('Webview HTML updated successfully');
            } catch (error) {
                console.error('Error updating webview HTML:', error);
            }
        } else {
            console.log('No view available for book:', book.id);
        }
    }

    public refreshFontSize(): void {
        this._updateFontSize();
    }

    private _updateFontSize(scrollPosition?: number): void {
        if (!this._view || !this._currentBook) {
            console.log('Cannot update font size:', { hasView: !!this._view, hasCurrentBook: !!this._currentBook });
            return;
        }

        const fontSize = this._state.getFontSize();
        console.log('Sending updateFontSize message:', { fontSize: fontSize, bookId: this._currentBook.id });

        this._view.webview.postMessage({
            type: 'updateFontSize',
            fontSize: fontSize,
            bookId: this._currentBook.id
        });

        if (scrollPosition !== undefined && this._currentBook) {
            const bookId = this._currentBook.id;
            console.log('Scheduling scroll position restore:', { scrollPosition: scrollPosition, bookId: bookId });
            setTimeout(() => {
                if (this._view) {
                    console.log('Sending restoreScrollPosition message:', { scrollPosition: scrollPosition, bookId: bookId });
                    this._view.webview.postMessage({
                        type: 'restoreScrollPosition',
                        scrollPosition: scrollPosition,
                        bookId: bookId
                    });
                } else {
                    console.log('View no longer available for restoreScrollPosition');
                }
            }, 100);
        }
    }



    private async _loadPdfFile(bookId: string): Promise<void> {
        if (!this._currentBook || this._currentBook.id !== bookId) {
            return;
        }

        try {
            const pdfData = fs.readFileSync(this._currentBook.path);
            const base64Data = pdfData.toString('base64');

            if (this._view && this._currentBook) {
                this._view.webview.postMessage({
                    type: 'pdfData',
                    data: base64Data,
                    bookId: this._currentBook.id
                });
            }
        } catch (error) {
            console.error('Failed to load PDF file:', error);

            if (this._view && this._currentBook) {
                this._view.webview.postMessage({
                    type: 'pdfError',
                    error: (error as Error).message || 'Failed to load PDF',
                    bookId: this._currentBook.id
                });
            }
        }
    }

    private _saveBookmark(position: any): void {
        // TODO: 实现书签保存逻辑
        console.log('Save bookmark:', position);
    }

    private async _syncWechatProgress(bookId: string, _wechatBookId: string): Promise<void> {
        try {
            // 同步所有微信读书书籍的进度
            await this._state.syncWechatBooks();
            this._treeDataProvider?.refresh();

            if (this._view) {
                this._view.webview.postMessage({
                    type: 'progressSynced',
                    bookId: bookId,
                    message: 'Reading progress synced successfully'
                });
            }

            vscode.window.showInformationMessage('WeChat Read progress synced successfully');
        } catch (error) {
            console.error('Failed to sync WeChat progress:', error);
            if (this._view) {
                this._view.webview.postMessage({
                    type: 'progressSyncError',
                    bookId: bookId,
                    error: 'Failed to sync reading progress'
                });
            }
            vscode.window.showErrorMessage('Failed to sync WeChat Read progress');
        }
    }

    private _getHtmlForWebview(_webview: vscode.Webview): string {
        const themeColors = ThemeUtils.getThemeColors();
        const settings = this._state.getSettings();

        if (!this._currentBook) {
            return this._getEmptyStateHtml(themeColors);
        }

        if (this._currentBook.type === 'wechat') {
            return this._getWechatHtml(this._currentBook, themeColors, settings);
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
                    </div>

                    <div id="pdf-canvas-container">
                        <div id="loading" class="loading">Loading PDF...</div>
                        <canvas id="pdf-canvas"></canvas>
                    </div>
                </div>

                <!-- 右侧控制按钮 -->
                <div style="position: fixed; right: 20px; top: 50%; transform: translateY(-50%); z-index: 1000; display: flex; flex-direction: column; gap: 10px; opacity: 0.5; transition: opacity 0.2s;">
                    <div style="padding: 10px; border: 1px solid ${themeColors.borderColor}; border-radius: 5px; background-color: ${themeColors.backgroundColor === '#1e1e1e' ? 'rgba(51, 51, 51, 0.8)' : 'rgba(240, 240, 240, 0.8)'};
                        color: ${themeColors.textColor}; font-size: 14px; text-align: center; min-width: 60px;">Page <span id="current-page-display">1</span>/<span id="total-pages-display">?</span></div>
                    <button id="prev-page" style="padding: 10px; border: 1px solid ${themeColors.borderColor}; border-radius: 5px; background-color: ${themeColors.backgroundColor === '#1e1e1e' ? 'rgba(51, 51, 51, 0.8)' : 'rgba(240, 240, 240, 0.8)'};
                        color: ${themeColors.textColor}; cursor: pointer; font-size: 14px;">←</button>
                    <button id="next-page" style="padding: 10px; border: 1px solid ${themeColors.borderColor}; border-radius: 5px; background-color: ${themeColors.backgroundColor === '#1e1e1e' ? 'rgba(51, 51, 51, 0.8)' : 'rgba(240, 240, 240, 0.8)'};
                        color: ${themeColors.textColor}; cursor: pointer; font-size: 14px;">→</button>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    const isDarkTheme = ${themeColors.backgroundColor === '#1e1e1e'};
                    const currentBookId = '${book.id}';

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
                    const currentPageDisplay = document.getElementById('current-page-display');
                    const totalPagesDisplay = document.getElementById('total-pages-display');

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

                        // 检查消息是否包含bookId，并且是否匹配当前书籍
                        if (message.bookId && message.bookId !== currentBookId) {
                            // 忽略非当前书籍的消息
                            return;
                        }

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
                                currentPageDisplay.textContent = currentPage;
                                totalPagesDisplay.textContent = totalPages;
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
                        currentPageDisplay.textContent = currentPage;

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

                            // 暗色主题反色处理
                            if (isDarkTheme) {
                                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                                const data = imageData.data;

                                for (let i = 0; i < data.length; i += 4) {
                                    // 反转RGB颜色
                                    data[i] = 255 - data[i];     // R
                                    data[i + 1] = 255 - data[i + 1]; // G
                                    data[i + 2] = 255 - data[i + 2]; // B
                                    // 保持透明度不变
                                }

                                ctx.putImageData(imageData, 0, 0);
                            }
                        } catch (error) {
                            console.error('Error rendering page:', error);
                            showError('Failed to render page ' + pageNum);
                        } finally {
                            isRendering = false;
                        }
                    }

                    function updateProgress() {
                        if (totalPages > 0) {
                            const progress = (currentPage / totalPages) * 100;
                            vscode.postMessage({ type: 'updateProgress', progress: progress, bookId: currentBookId });
                        }
                    }

                    function showError(message) {
                        loadingEl.textContent = message;
                        loadingEl.style.color = 'red';
                    }

                    // 事件监听
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

                    // 页面输入功能已移除，改为右侧按钮控制

                    // 缩放控制已移除

                </script>
            </body>
            </html>
        `;
    }

    private _getTextHtml(book: Book, themeColors: any, settings: PluginSettings): string {
        const CHUNK_SIZE = 1024 * 1024; // 1MB
        const isChunked = book.fileSize > CHUNK_SIZE;
        let content = '';
        let encoding = book.encoding || 'utf8';

        try {
            if (isChunked) {
                content = EncodingUtils.readFileWithEncoding(book.path, 0, CHUNK_SIZE, encoding);
            } else {
                content = EncodingUtils.readFileWithEncoding(book.path, 0, book.fileSize, encoding);
            }
        } catch (error) {
            console.error('Failed to read book content:', error);
            vscode.window.showErrorMessage(`Failed to read book: ${(error as Error).message}`);
            return this._getEmptyStateHtml(themeColors);
        }

        const escapedContent = SecurityUtils.escapeHtml(content);
        const fontSize = settings.fontSize;

        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${SecurityUtils.escapeHtml(book.name)}</title>
                <style>
                    body {
                        font-family: ${settings.fontFamily};
                        background-color: ${themeColors.backgroundColor};
                        color: ${themeColors.textColor};
                        padding: 20px;
                        font-size: ${fontSize}px;
                        line-height: ${settings.lineHeight};
                        transition: all 0.3s;
                        overflow-wrap: break-word;
                        white-space: pre-wrap;
                    }
                    #content {
                        height: 100vh;
                        overflow-y: auto;
                        padding-right: 15px;
                    }
                    .loading-indicator {
                        display: none;
                        text-align: center;
                        padding: 20px;
                        color: ${themeColors.mutedColor};
                    }
                </style>
            </head>
            <body>
                <div id="content">
                    <div id="text-container">${escapedContent}</div>
                    <div id="loading-indicator" class="loading-indicator">Loading more...</div>
                </div>

                <!-- 字体调节按钮 -->
                <div style="position: fixed; right: 20px; top: 50%; transform: translateY(-50%); z-index: 1000; display: flex; flex-direction: column; gap: 10px;">
                    <button onclick="decreaseFontSize()" style="padding: 10px; border: 1px solid ${themeColors.borderColor}; border-radius: 5px; background-color: ${themeColors.backgroundColor === '#1e1e1e' ? '#333' : '#f0f0f0'}; color: ${themeColors.textColor}; cursor: pointer; font-size: 14px;">A-</button>
                    <div id="fontSizeDisplay" style="padding: 10px; border: 1px solid ${themeColors.borderColor}; border-radius: 5px; background-color: ${themeColors.backgroundColor === '#1e1e1e' ? '#333' : '#f0f0f0'}; color: ${themeColors.textColor}; font-size: 14px; text-align: center; min-width: 40px;">${fontSize}px</div>
                    <button onclick="increaseFontSize()" style="padding: 10px; border: 1px solid ${themeColors.borderColor}; border-radius: 5px; background-color: ${themeColors.backgroundColor === '#1e1e1e' ? '#333' : '#f0f0f0'}; color: ${themeColors.textColor}; cursor: pointer; font-size: 14px;">A+</button>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    const contentElement = document.getElementById('content');
                    const textContainer = document.getElementById('text-container');
                    const loadingIndicator = document.getElementById('loading-indicator');

                    const currentBookId = '${book.id}';

                    // 字体调节函数
                    function decreaseFontSize() {
                        vscode.postMessage({ type: 'decreaseFontSize', bookId: currentBookId });
                    }

                    function increaseFontSize() {
                        vscode.postMessage({ type: 'increaseFontSize', bookId: currentBookId });
                    }
                    const isChunked = ${isChunked};
                    const totalSize = ${book.fileSize};
                    let loadedSize = ${isChunked ? CHUNK_SIZE : book.fileSize};
                    let isLoading = false;
                    let isScrolling = false;

                    const targetProgress = ${book.progress};
                    const targetOffset = Math.floor((targetProgress / 100) * totalSize);
                    let pendingRestore = isChunked && targetProgress > 0;

                    function calculateProgress() {
                        const scrollRange = contentElement.scrollHeight - contentElement.clientHeight;
                        const ratio = scrollRange > 0 ? contentElement.scrollTop / scrollRange : 0;
                        const estimatedOffset = Math.min(loadedSize, Math.max(0, loadedSize * ratio));
                        const progress = totalSize > 0 ? (estimatedOffset / totalSize) * 100 : 0;
                        return Math.max(0, Math.min(100, progress));
                    }

                    function updateProgress() {
                        if (!isScrolling) {
                            const progress = calculateProgress();
                            vscode.postMessage({ type: 'updateProgress', progress: progress, bookId: currentBookId });
                        }
                    }

                    function restoreScrollForNonChunked() {
                        const scrollRange = contentElement.scrollHeight - contentElement.clientHeight;
                        if (scrollRange > 0) {
                            contentElement.scrollTop = scrollRange * (targetProgress / 100);
                        }
                    }

                    function tryRestoreForChunked() {
                        if (!pendingRestore) {
                            return;
                        }
                        if (loadedSize < targetOffset && !isLoading && loadedSize < totalSize) {
                            loadMore();
                            return;
                        }
                        const scrollRange = contentElement.scrollHeight - contentElement.clientHeight;
                        if (scrollRange > 0) {
                            const ratio = loadedSize > 0 ? Math.min(1, targetOffset / loadedSize) : 0;
                            contentElement.scrollTop = scrollRange * ratio;
                            pendingRestore = false;
                        }
                    }

                    if (isChunked) {
                        setTimeout(() => {
                            tryRestoreForChunked();
                        }, 0);
                    } else {
                        restoreScrollForNonChunked();
                    }

                    // 滚动事件
                    let scrollTimeout;
                    contentElement.addEventListener('scroll', () => {
                        isScrolling = true;
                        clearTimeout(scrollTimeout);
                        scrollTimeout = setTimeout(() => {
                            isScrolling = false;
                            updateProgress();
                        }, 150);

                        if (isChunked && !isLoading && loadedSize < totalSize) {
                            if (contentElement.scrollTop + contentElement.clientHeight >= contentElement.scrollHeight - 200) {
                                loadMore();
                            }
                        }
                    });

                    function loadMore() {
                        isLoading = true;
                        loadingIndicator.style.display = 'block';
                        const start = loadedSize;
                        const end = Math.min(loadedSize + ${CHUNK_SIZE}, totalSize);

                        vscode.postMessage({
                            type: 'loadMoreContent',
                            start: start,
                            end: end,
                            encoding: '${encoding}',
                            bookId: currentBookId
                        });
                    }

                    // 字体大小和滚动位置恢复
                    window.addEventListener('message', event => {
                        const message = event.data;
                        if (message.bookId !== currentBookId) return;

                        switch (message.type) {
                            case 'updateFontSize':
                                const previousRange = contentElement.scrollHeight - contentElement.clientHeight;
                                const previousRatio = previousRange > 0 ? contentElement.scrollTop / previousRange : 0;
                                document.body.style.fontSize = message.fontSize + 'px';
                                // 更新字体大小显示
                                const fontSizeDisplay = document.getElementById('fontSizeDisplay');
                                if (fontSizeDisplay) {
                                    fontSizeDisplay.textContent = message.fontSize + 'px';
                                }
                                requestAnimationFrame(() => {
                                    const newRange = contentElement.scrollHeight - contentElement.clientHeight;
                                    contentElement.scrollTop = newRange * previousRatio;
                                    if (pendingRestore) {
                                        tryRestoreForChunked();
                                    }
                                    updateProgress();
                                });
                                break;
                            case 'restoreScrollPosition':
                                contentElement.scrollTop = message.scrollPosition;
                                updateProgress();
                                break;
                            case 'moreContent':
                                textContainer.innerHTML += message.content;
                                loadedSize = message.end;
                                isLoading = false;
                                loadingIndicator.style.display = 'none';
                                if (pendingRestore) {
                                    tryRestoreForChunked();
                                }
                                updateProgress();
                                break;
                            case 'contentError':
                                loadingIndicator.textContent = 'Error: ' + message.error;
                                isLoading = false;
                                break;
                        }
                    });

                </script>
            </body>
            </html>
        `;
    }

    private _getWechatHtml(book: Book, themeColors: any, settings: PluginSettings): string {
        const fontSize = settings.fontSize;

        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${SecurityUtils.escapeHtml(book.name)}</title>
                <style>
                    body {
                        font-family: ${settings.fontFamily};
                        background-color: ${themeColors.backgroundColor};
                        color: ${themeColors.textColor};
                        padding: 20px;
                        font-size: ${fontSize}px;
                        line-height: ${settings.lineHeight};
                        transition: all 0.3s;
                    }
                    .wechat-container {
                        text-align: center;
                        padding: 40px 20px;
                    }
                    .wechat-container h2 {
                        font-size: 22px;
                        margin-bottom: 12px;
                    }
                    .wechat-container p {
                        font-size: 16px;
                        color: ${themeColors.mutedColor};
                        margin-bottom: 24px;
                    }
                    .sync-button {
                        background-color: #07c160;
                        color: white;
                        border: none;
                        border-radius: 5px;
                        padding: 12px 24px;
                        font-size: 16px;
                        cursor: pointer;
                        transition: background-color 0.2s;
                    }
                    .sync-button:hover {
                        background-color: #06ad56;
                    }
                </style>
            </head>
            <body>
                <div class="wechat-container">
                    <h2>${SecurityUtils.escapeHtml(book.name)}</h2>
                    <p>This is a WeChat Read book. Content is not displayed here.</p>
                    <button id="sync-progress" class="sync-button">Sync Progress</button>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    const currentBookId = '${book.id}';

                    document.getElementById('sync-progress').addEventListener('click', () => {
                        vscode.postMessage({
                            type: 'syncWechatProgress',
                            bookId: currentBookId
                        });
                    });
                </script>
            </body>
            </html>
        `;
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Read Plugin is now active!');

    // 状态管理
    const state = new ReadPluginState(context);

    // 树数据提供者
    const booksTreeDataProvider = new BooksTreeDataProvider(state);
    vscode.window.registerTreeDataProvider('read-plugin-books', booksTreeDataProvider);

    // 内容视图提供者
    const bookContentViewProvider = new BookContentViewProvider(context, state);
    bookContentViewProvider.setTreeDataProvider(booksTreeDataProvider);
    vscode.window.registerWebviewViewProvider(BookContentViewProvider.viewType, bookContentViewProvider);

    // 注册命令
    context.subscriptions.push(
        vscode.commands.registerCommand('readplugin.addBook', async () => {
            const uris = await vscode.window.showOpenDialog({
                canSelectMany: true,
                openLabel: 'Add Book(s)',
                filters: {
                    'Books': ['txt', 'pdf']
                }
            });

            if (uris) {
                for (const uri of uris) {
                    try {
                        state.addBook(uri.fsPath);
                    } catch (error) {
                        // 错误已在addBook中处理
                    }
                }
                booksTreeDataProvider.refresh();
            }
        }),

        vscode.commands.registerCommand('readplugin.openBook', (book: Book) => {
            bookContentViewProvider.openBook(book);
        }),

        vscode.commands.registerCommand('readplugin.removeBook', (item: BookItem) => {
            if (item && item.book) {
                const removed = state.removeBook(item.book.id);
                if (removed) {
                    booksTreeDataProvider.refresh();
                    vscode.window.showInformationMessage(`Book removed: ${item.book.name}`);
                }
            }
        }),

        vscode.commands.registerCommand('readplugin.increaseFontSize', () => {
            state.increaseFontSize();
            bookContentViewProvider.refreshFontSize();
        }),

        vscode.commands.registerCommand('readplugin.decreaseFontSize', () => {
            state.decreaseFontSize();
            bookContentViewProvider.refreshFontSize();
        }),

        vscode.commands.registerCommand('readplugin.refreshBooks', () => {
            booksTreeDataProvider.refresh();
        }),

        vscode.commands.registerCommand('readplugin.loginWechatRead', async () => {
            const token = await vscode.window.showInputBox({
                prompt: 'Enter your WeChat Read token',
                ignoreFocusOut: true
            });
            const userId = await vscode.window.showInputBox({
                prompt: 'Enter your WeChat Read User ID (userVid)',
                ignoreFocusOut: true
            });

            if (token && userId) {
                state.updateSettings({ wechatReadToken: token, wechatReadUserId: userId });
                booksTreeDataProvider.refresh();
                vscode.window.showInformationMessage('WeChat Read credentials saved.');
            }
        }),

        vscode.commands.registerCommand('readplugin.syncWechatBooks', async () => {
            await state.syncWechatBooks();
            booksTreeDataProvider.refresh();
        })
    );

    // 插件卸载时清理
    context.subscriptions.push({
        dispose: () => {
            state.dispose();
        }
    });
}

export function deactivate() {
    console.log('Read Plugin is now deactivated.');
}
