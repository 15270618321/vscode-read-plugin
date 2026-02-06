/**
 * extension.ts
 * 插件的主入口文件
 *
 * 功能说明：
 * 1. 注册插件命令和视图
 * 2. 管理插件状态
 * 3. 处理书籍的添加、打开、删除等操作
 * 4. 提供PDF和文本文件的阅读功能
 * 5. 集成微信读书功能
 *
 * 主要模块：
 * - ReadPluginState: 插件状态管理 - 负责管理书籍列表、设置和数据持久化
 * - BooksTreeDataProvider: 书籍树视图数据提供者 - 为侧边栏树视图提供数据
 * - BookContentViewProvider: 书籍内容视图提供者 - 显示书籍内容的WebView
 * - 各种命令处理函数 - 处理用户操作和事件响应
 *
 * 代码结构：
 * 1. 导入依赖和工具类
 * 2. 定义核心类
 * 3. 实现插件激活和命令注册
 * 4. 处理插件生命周期
 */
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

/**
 * 插件状态管理类
 *
 * 功能：
 * 1. 管理书籍列表 - 存储和操作所有添加的书籍
 * 2. 管理插件设置 - 处理字体大小、主题等配置
 * 3. 处理数据持久化 - 将数据保存到本地文件系统
 * 4. 提供书籍的增删改查操作 - 书籍的添加、删除、获取等方法
 * 5. 集成微信读书功能 - 同步微信读书书籍和进度
 *
 * 核心概念：
 * - 状态管理：集中管理插件的所有数据和状态
 * - 数据持久化：将数据保存到文件，下次启动时恢复
 * - 事件驱动：通过事件管理器处理各种事件
 */
class ReadPluginState {
    /** 书籍列表 - 存储所有添加的书籍对象 */
    private books: Book[] = [];
    /** 插件设置 - 存储字体大小、主题等配置 */
    private settings: PluginSettings;
    /** 数据存储路径 - 数据文件的保存位置 */
    private storagePath: string;
    /** 事件管理器 - 管理各种事件监听器 */
    private eventManager: EventManager;

    /**
     * 构造函数
     * @param context VS Code扩展上下文 - 包含扩展的路径、订阅等信息
     *
     * 初始化流程：
     * 1. 获取数据存储路径
     * 2. 创建事件管理器实例
     * 3. 加载插件设置
     * 4. 加载书籍列表
     * 5. 注册自动保存功能
     */
    constructor(context: vscode.ExtensionContext) {
        // 1. 获取数据存储路径 - 用于保存书籍列表和设置
        this.storagePath = this.getStoragePath(context);

        // 2. 创建事件管理器实例 - 用于管理事件监听器
        this.eventManager = new EventManager();

        // 3. 加载插件设置 - 从文件中读取设置，或使用默认设置
        this.settings = this.loadSettings();

        // 4. 加载书籍列表 - 从文件中读取书籍，验证书籍文件是否存在
        this.loadBooks();

        // 5. 注册自动保存 - 定期保存数据，避免数据丢失
        this.registerAutoSave();
    }

    /**
     * 同步微信读书书籍
     * @returns 同步的微信读书书籍列表
     *
     * 功能：
     * 1. 创建微信读书服务实例
     * 2. 调用API获取微信读书书籍
     * 3. 更新本地存储的微信读书书籍
     * 4. 更新同步键
     * 5. 保存数据
     *
     * 同步流程：
     * 1. 使用当前的synckey调用微信读书API
     * 2. 过滤出本地书籍（非微信读书书籍）
     * 3. 合并本地书籍和微信读书书籍
     * 4. 如果有新的synckey，更新设置
     * 5. 保存书籍列表和设置
     */
    async syncWechatBooks(): Promise<Book[]> {
        // 创建微信读书服务实例 - 用于调用微信读书API
        const service = new WechatReadService(this.settings);

        try {
            // 调用API获取微信读书书籍 - 使用synckey实现增量同步
            const wechatBooks = await service.getBooks(this.settings.wechatReadSynckey || 0);

            // 更新本地存储的微信读书书籍
            // 1. 过滤出本地书籍（非微信读书书籍）
            const localBooks = this.books.filter(book => book.type !== 'wechat');
            // 2. 合并本地书籍和微信读书书籍
            this.books = [...localBooks, ...wechatBooks];

            // 更新synckey - 用于下次增量同步
            if (wechatBooks.length > 0 && wechatBooks[0].synckey) {
                this.settings.wechatReadSynckey = wechatBooks[0].synckey;
                this.saveSettings();
            }

            // 保存书籍列表
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

    /**
     * 获取数据存储路径
     * @param context VS Code扩展上下文
     * @returns 存储路径字符串
     */
    private getStoragePath(context: vscode.ExtensionContext): string {
        if (context.storagePath) {
            return context.storagePath;
        }
        return path.join(os.homedir(), '.vscode-reader');
    }

    /**
     * 加载插件设置
     * @returns 插件设置对象
     */
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

    /**
     * 加载书籍列表
     */
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

    /**
     * 保存书籍列表
     */
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

    /**
     * 保存插件设置
     */
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

    /**
     * 注册自动保存功能
     */
    private registerAutoSave(): void {
        // 使用防抖函数优化保存操作
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

    /**
     * 添加书籍
     * @param bookPath 书籍文件路径
     * @returns 添加的书籍对象
     *
     * 功能：
     * 1. 安全验证 - 防止路径遍历攻击
     * 2. 文件扩展名验证 - 确保只支持.txt和.pdf文件
     * 3. 文件大小验证 - 确保文件不超过最大限制
     * 4. 检查是否已存在 - 避免重复添加
     * 5. 创建书籍对象 - 设置书籍的各种属性
     * 6. 添加到书籍列表 - 更新内存中的书籍列表
     * 7. 保存书籍列表 - 将数据持久化
     *
     * 添加流程：
     * 1. 安全验证路径
     * 2. 验证文件扩展名
     * 3. 检查文件大小
     * 4. 检查是否已存在
     * 5. 创建书籍对象
     * 6. 添加到列表
     * 7. 保存数据
     * 8. 返回书籍对象
     */
    addBook(bookPath: string): Book {
        try {
            // 安全验证 - 防止路径遍历攻击
            SecurityUtils.sanitizePath(bookPath);

            // 文件扩展名验证 - 确保只支持.txt和.pdf文件
            if (!SecurityUtils.validateFileExtension(bookPath, ALLOWED_EXTENSIONS)) {
                throw new Error('Only .txt and .pdf files are supported');
            }

            // 文件大小验证 - 确保文件不超过最大限制
            const fileSize = FileUtils.getFileSize(bookPath);
            if (fileSize > this.settings.maxFileSize) {
                throw new Error(`File too large (max ${this.settings.maxFileSize / 1024 / 1024}MB)`);
            }

            // 获取书籍名称 - 从文件路径中提取
            const bookName = path.basename(bookPath);

            // 检查是否已存在 - 避免重复添加
            const existingBook = this.books.find(b => b.path === bookPath);

            if (existingBook) {
                vscode.window.showInformationMessage(`Book already exists: ${bookName}`);
                return existingBook;
            }

            // 创建书籍对象 - 设置书籍的各种属性
            const book: Book = {
                id: Date.now().toString(), // 使用时间戳作为唯一ID
                name: bookName, // 书籍名称
                path: bookPath, // 书籍文件路径
                progress: 0, // 初始阅读进度为0
                fileSize: fileSize, // 文件大小
                addedTime: Date.now(), // 添加时间
                encoding: EncodingUtils.detectEncoding(bookPath) // 检测文件编码
            };

            // 添加到书籍列表 - 更新内存中的书籍列表
            this.books.push(book);

            // 保存书籍列表 - 将数据持久化到文件
            this.saveBooks();

            // 返回添加的书籍对象
            return book;
        } catch (error) {
            // 处理错误 - 显示错误信息并抛出错误
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to add book: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * 获取所有书籍
     * @returns 书籍列表数组
     */
    getBooks(): Book[] {
        return [...this.books];
    }

    /**
     * 根据ID获取书籍
     * @param bookId 书籍ID
     * @returns 书籍对象或undefined
     */
    getBook(bookId: string): Book | undefined {
        return this.books.find(b => b.id === bookId);
    }

    /**
     * 更新书籍阅读进度
     * @param bookId 书籍ID
     * @param progress 阅读进度（0-100）
     */
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

    /**
     * 删除书籍
     * @param bookId 书籍ID
     * @returns 是否删除成功
     */
    removeBook(bookId: string): boolean {
        const initialLength = this.books.length;
        this.books = this.books.filter(b => b.id !== bookId);

        if (this.books.length < initialLength) {
            this.saveBooks();
            return true;
        }
        return false;
    }

    /**
     * 获取插件设置
     * @returns 插件设置对象
     */
    getSettings(): PluginSettings {
        return { ...this.settings };
    }

    /**
     * 更新插件设置
     * @param newSettings 新的设置对象（部分更新）
     */
    updateSettings(newSettings: Partial<PluginSettings>): void {
        this.settings = { ...this.settings, ...newSettings };
        this.saveSettings();
    }

    /**
     * 获取字体大小
     * @returns 字体大小值
     */
    getFontSize(): number {
        return this.settings.fontSize;
    }

    /**
     * 设置字体大小
     * @param size 字体大小
     * @returns 设置后的字体大小（限制在8-48之间）
     */
    setFontSize(size: number): number {
        this.settings.fontSize = Math.max(8, Math.min(48, Math.round(size)));
        this.saveSettings();
        return this.settings.fontSize;
    }

    /**
     * 增加字体大小
     * @returns 增加后的字体大小
     */
    increaseFontSize(): number {
        return this.setFontSize(this.settings.fontSize + 2);
    }

    /**
     * 减小字体大小
     * @returns 减小后的字体大小
     */
    decreaseFontSize(): number {
        return this.setFontSize(this.settings.fontSize - 2);
    }

    /**
     * 释放资源
     */
    dispose(): void {
        this.eventManager.dispose();
        // 最后一次保存
        this.saveBooks();
        this.saveSettings();
    }
}

/**
 * 书籍树项类
 *
 * 功能：
 * 1. 在VS Code树视图中显示书籍项
 * 2. 根据书籍类型显示不同的图标
 * 3. 提供书籍的详细信息 tooltip
 * 4. 设置点击书籍时的打开命令
 */
class BookItem extends vscode.TreeItem {
    /**
     * 构造函数
     * @param book 书籍对象
     */
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

    /**
     * 获取书籍的详细信息 tooltip
     * @returns tooltip 文本
     */
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

    /**
     * 格式化文件大小
     * @param bytes 字节数
     * @returns 格式化后的文件大小字符串
     */
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

/**
 * 添加书籍项类
 *
 * 功能：
 * 在VS Code树视图中显示添加书籍的按钮
 */
class AddBookItem extends vscode.TreeItem {
    /**
     * 构造函数
     */
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

/**
 * 微信读书登录项类
 *
 * 功能：
 * 在VS Code树视图中显示微信读书登录按钮
 */
class WechatLoginItem extends vscode.TreeItem {
    /**
     * 构造函数
     */
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

/**
 * 微信读书同步项类
 *
 * 功能：
 * 在VS Code树视图中显示微信读书同步按钮
 */
class WechatSyncItem extends vscode.TreeItem {
    /**
     * 构造函数
     */
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

/**
 * 微信读书状态项类
 *
 * 功能：
 * 在VS Code树视图中显示微信读书登录状态
 */
class WechatStatusItem extends vscode.TreeItem {
    /**
     * 构造函数
     * @param status 登录状态字符串
     */
    constructor(status: string) {
        super(`📱 WeChat Read: ${status}`, vscode.TreeItemCollapsibleState.None);
        this.tooltip = `WeChat Read status: ${status}`;
        this.iconPath = new vscode.ThemeIcon('info');
        this.contextValue = 'wechatStatusItem';
    }
}

/**
 * 书籍树数据提供者类
 *
 * 功能：
 * 1. 为VS Code树视图提供数据
 * 2. 管理树视图的刷新
 * 3. 组织书籍和操作项的显示顺序
 * 4. 根据登录状态显示不同的微信读书操作项
 */
class BooksTreeDataProvider implements vscode.TreeDataProvider<BookItem | AddBookItem | WechatLoginItem | WechatSyncItem | WechatStatusItem> {
    /** 树数据变化事件发射器 */
    private _onDidChangeTreeData: vscode.EventEmitter<BookItem | AddBookItem | WechatLoginItem | WechatSyncItem | WechatStatusItem | undefined | null | void> =
        new vscode.EventEmitter<BookItem | AddBookItem | WechatLoginItem | WechatSyncItem | WechatStatusItem | undefined | null | void>();
    /** 树数据变化事件 */
    readonly onDidChangeTreeData: vscode.Event<BookItem | AddBookItem | WechatLoginItem | WechatSyncItem | WechatStatusItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    /**
     * 构造函数
     * @param state 插件状态管理对象
     */
    constructor(private state: ReadPluginState) {}

    /**
     * 刷新树视图
     */
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    /**
     * 刷新指定书籍项
     * @param _bookId 书籍ID
     */
    refreshBook(_bookId: string): void {
        this._onDidChangeTreeData.fire();
    }

    /**
     * 获取树项
     * @param element 树项元素
     * @returns 树项对象
     */
    getTreeItem(element: BookItem | AddBookItem | WechatLoginItem | WechatSyncItem | WechatStatusItem): vscode.TreeItem {
        return element;
    }

    /**
     * 获取子项
     * @param element 父元素
     * @returns 子项数组
     */
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

/**
 * 书籍内容视图提供者类
 *
 * 功能：
 * 1. 提供书籍内容的WebView视图
 * 2. 处理WebView的创建和配置
 * 3. 管理WebView与扩展之间的通信
 * 4. 根据书籍类型渲染不同的内容
 * 5. 处理字体大小调整、进度更新等操作
 *
 * 核心概念：
 * - WebView: VS Code中显示网页内容的组件
 * - 消息传递: WebView与扩展之间通过postMessage和onDidReceiveMessage通信
 * - 内容渲染: 根据书籍类型（PDF、文本、微信读书）渲染不同的内容
 */
class BookContentViewProvider implements vscode.WebviewViewProvider {
    /** 视图类型ID - 用于注册和识别视图 */
    public static readonly viewType = 'read-plugin.bookContent';
    /** WebView视图实例 - 用于显示书籍内容 */
    private _view?: vscode.WebviewView;
    /** 当前打开的书籍 - 存储当前正在阅读的书籍 */
    private _currentBook?: Book;
    /** 插件状态 - 用于访问书籍列表和设置 */
    private _state: ReadPluginState;
    /** 书籍树数据提供者 - 用于刷新树视图 */
    private _treeDataProvider?: BooksTreeDataProvider;
    /** 事件管理器 - 用于管理事件监听器 */
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
                console.log('Loading more content request:', {bookId: this._currentBook?.id, start: data.start, end: data.end, encoding: data.encoding});
                if (this._currentBook && data.start !== undefined && data.end !== undefined) {
                    console.log('Loading more content:', { bookId: this._currentBook.id, start: data.start, end: data.end });
                    try {
                        const encoding = data.encoding || this._currentBook.encoding || 'utf8';
                        const content = EncodingUtils.readFileWithEncoding(this._currentBook.path, data.start, data.end, encoding);
                        const escapedContent = SecurityUtils.escapeHtml(content);

                        console.log(`Sending ${escapedContent.length} characters to webview`)

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

    /**
     * 打开书籍
     * @param book 要打开的书籍对象
     *
     * 功能：
     * 1. 设置当前书籍 - 更新内存中的当前书籍
     * 2. 检查视图是否可用 - 确保WebView已创建
     * 3. 生成HTML内容 - 根据书籍类型生成不同的HTML
     * 4. 显示视图 - 确保视图可见
     * 5. 更新WebView内容 - 将生成的HTML设置到WebView
     *
     * 打开流程：
     * 1. 设置当前书籍
     * 2. 检查视图是否存在
     * 3. 生成对应书籍类型的HTML
     * 4. 显示视图
     * 5. 更新WebView内容
     */
    openBook(book: Book): void {
        // 记录日志 - 方便调试
        console.log('Opening book:', { id: book.id, name: book.name, size: book.fileSize });

        // 设置当前书籍 - 更新内存中的当前书籍
        this._currentBook = book;

        // 检查视图是否可用 - 确保WebView已创建
        if (this._view) {
            console.log('View available, updating HTML');
            try {
                // 生成HTML内容 - 根据书籍类型生成不同的HTML
                const html = this._getHtmlForWebview(this._view.webview);
                console.log('Generated HTML length:', html.length);

                // 显示视图 - 确保视图可见
                this._view.show?.(true);

                // 更新WebView内容 - 将生成的HTML设置到WebView
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

    /**
     * 获取WebView的HTML内容
     * @param _webview WebView实例
     * @returns 生成的HTML字符串
     *
     * 功能：
     * 1. 获取主题颜色 - 用于适配不同主题
     * 2. 获取插件设置 - 用于应用字体大小等设置
     * 3. 根据当前书籍类型生成对应HTML
     *
     * 生成逻辑：
     * 1. 如果没有当前书籍，返回空状态HTML
     * 2. 如果是微信读书书籍，返回微信读书HTML
     * 3. 如果是PDF文件，返回PDF阅读HTML
     * 4. 否则，返回文本阅读HTML
     */
    private _getHtmlForWebview(_webview: vscode.Webview): string {
        // 获取主题颜色 - 用于适配不同主题
        const themeColors = ThemeUtils.getThemeColors();
        // 获取插件设置 - 用于应用字体大小等设置
        const settings = this._state.getSettings();

        // 如果没有当前书籍，返回空状态HTML
        if (!this._currentBook) {
            return this._getEmptyStateHtml(themeColors);
        }

        // 如果是微信读书书籍，返回微信读书HTML
        if (this._currentBook.type === 'wechat') {
            return this._getWechatHtml(this._currentBook, themeColors, settings);
        }

        // 获取文件扩展名 - 用于判断文件类型
        const ext = path.extname(this._currentBook.path).toLowerCase();

        // 如果是PDF文件，返回PDF阅读HTML
        if (ext === '.pdf') {
            return this._getPdfHtml(this._currentBook, themeColors, settings);
        } else {
            // 否则，返回文本阅读HTML
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
        const CHUNK_SIZE = 10 * 1024; // 10KB
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
                <div style="
                    position: fixed;
                    right: 20px;
                    top: 50%;
                    transform: translateY(-50%);
                    z-index: 1000;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    opacity: 0.4;
                    transition: opacity 0.3s ease;
                "
                onmouseover="this.style.opacity='0.9'"
                onmouseout="this.style.opacity='0.4'">
                    <button onclick="decreaseFontSize()" style="
                        padding: 10px;
                        border: 1px solid ${themeColors.borderColor};
                        border-radius: 5px;
                        background-color: ${themeColors.backgroundColor === '#1e1e1e' ? '#333' : '#f0f0f0'};
                        color: ${themeColors.textColor};
                        cursor: pointer;
                        font-size: 14px;
                    ">A-</button>

                    <div id="fontSizeDisplay" style="
                        padding: 10px;
                        border: 1px solid ${themeColors.borderColor};
                        border-radius: 5px;
                        background-color: ${themeColors.backgroundColor === '#1e1e1e' ? '#333' : '#f0f0f0'};
                        color: ${themeColors.textColor};
                        font-size: 14px;
                        text-align: center;
                        min-width: 40px;
                    ">${fontSize}px</div>

                    <button onclick="increaseFontSize()" style="
                        padding: 10px;
                        border: 1px solid ${themeColors.borderColor};
                        border-radius: 5px;
                        background-color: ${themeColors.backgroundColor === '#1e1e1e' ? '#333' : '#f0f0f0'};
                        color: ${themeColors.textColor};
                        cursor: pointer;
                        font-size: 14px;
                    ">A+</button>
                </div>

            <script>
                // === 关键修复：立即执行函数，确保事件监听器在页面加载时就被绑定 ===
                (function() {
                    const vscode = acquireVsCodeApi();
                    const contentElement = document.getElementById('content');
                    const textContainer = document.getElementById('text-container');
                    const loadingIndicator = document.getElementById('loading-indicator');
                    const currentBookId = '${book.id}';

                    // 状态变量
                    const isChunked = ${isChunked};
                    const totalSize = ${book.fileSize};
                    const CHUNK_SIZE = ${CHUNK_SIZE};
                    let loadedSize = ${isChunked ? CHUNK_SIZE : book.fileSize};
                    let isLoading = false;

                    console.log('=== 页面初始化 ===');
                    console.log('当前书籍ID:', currentBookId);
                    console.log('是否分块加载:', isChunked);
                    console.log('总大小:', totalSize);
                    console.log('已加载大小:', loadedSize);

                    // === 立即绑定消息监听器 ===
                    window.addEventListener('message', handleMessage);

                    function handleMessage(event) {
                        const message = event.data;

                        console.log('收到消息:', message.type);

                        // 检查消息是否属于当前书籍
                        if (message.bookId && message.bookId !== currentBookId) {
                            console.log('忽略其他书籍的消息，当前ID:', currentBookId, '消息ID:', message.bookId);
                            return;
                        }

                        switch (message.type) {
                            case 'moreContent':
                                console.log('收到更多内容:', {
                                    start: message.start,
                                    end: message.end,
                                    contentLength: message.content ? message.content.length : 0
                                });

                                if (message.content && message.content.length > 0) {
                                    // 追加内容
                                    textContainer.innerHTML += message.content;
                                    loadedSize = message.end;
                                    isLoading = false;
                                    loadingIndicator.style.display = 'none';

                                    console.log('内容已追加，loadedSize:', loadedSize);

                                    // 如果正在恢复位置，尝试重新恢复
                                    if (isRestoringPosition) {
                                        console.log('内容加载完成，尝试重新恢复位置');
                                        setTimeout(restorePosition, 300); // 减少延迟时间
                                    }
                                }
                                break;

                            case 'contentError':
                                console.error('加载错误:', message.error);
                                loadingIndicator.textContent = '加载失败: ' + message.error;
                                loadingIndicator.style.color = 'red';
                                isLoading = false;
                                break;

                            case 'updateFontSize':
                                document.body.style.fontSize = message.fontSize + 'px';
                                const fontSizeDisplay = document.getElementById('fontSizeDisplay');
                                if (fontSizeDisplay) {
                                    fontSizeDisplay.textContent = message.fontSize + 'px';
                                }
                                break;

                            case 'restoreScrollPosition':
                                contentElement.scrollTop = message.scrollPosition;
                                break;
                        }
                    }

                    let scrollTimeout;
                    let isRestoringPosition = false;  // 新增：正在恢复位置的标志

                    contentElement.addEventListener('scroll', () => {
                        if (isRestoringPosition) return;  // 新增：如果正在恢复位置，跳过

                        clearTimeout(scrollTimeout);
                        scrollTimeout = setTimeout(() => {
                            updateProgress();
                        }, 100);

                        if (isChunked && !isLoading && loadedSize < totalSize) {
                            const distanceToBottom = contentElement.scrollHeight -
                                                    contentElement.scrollTop -
                                                    contentElement.clientHeight;

                            if (distanceToBottom < 100) {
                                loadMore();
                            }
                        }
                    });

                    function loadMore() {
                        if (isLoading) return;

                        isLoading = true;
                        loadingIndicator.style.display = 'block';

                        const start = loadedSize;
                        const end = Math.min(loadedSize + CHUNK_SIZE, totalSize);

                        console.log('发送加载请求:', { start: start, end: end });

                        vscode.postMessage({
                            type: 'loadMoreContent',
                            start: start,
                            end: end,
                            encoding: '${encoding}',
                            bookId: currentBookId
                        });
                    }

                    // 初始化进度更新
                    function updateProgress() {
                        if (isRestoringPosition) {
                            console.log('正在恢复位置，跳过进度更新');
                            return;
                        }

                        if (totalSize <= 0) return;

                        let progress;

                        if (!isChunked || loadedSize >= totalSize) {
                            // 全部加载完成，使用正常滚动比例
                            const scrollRange = contentElement.scrollHeight - contentElement.clientHeight;
                            if (scrollRange <= 0) return;

                            const scrollRatio = contentElement.scrollTop / scrollRange;
                            progress = scrollRatio * 100;
                        } else {
                            // 分块加载中 - 改进的进度计算
                            const scrollRange = contentElement.scrollHeight - contentElement.clientHeight;
                            if (scrollRange <= 0) return;

                            // 计算当前已加载内容的百分比
                            const loadedPercentage = (loadedSize / totalSize) * 100;
                            // 计算当前滚动位置在已加载内容中的百分比
                            const scrollRatio = Math.min(1, contentElement.scrollTop / scrollRange);
                            // 计算实际进度
                            progress = scrollRatio * loadedPercentage;
                        }

                        // 确保进度值在合理范围内
                        const roundedProgress = Math.max(0, Math.min(100, Math.round(progress * 100) / 100));

                        console.log('更新进度:', {
                            progress: roundedProgress,
                            scrollTop: contentElement.scrollTop,
                            scrollHeight: contentElement.scrollHeight,
                            clientHeight: contentElement.clientHeight,
                            loadedSize: loadedSize,
                            totalSize: totalSize
                        });

                        vscode.postMessage({
                            type: 'updateProgress',
                            progress: roundedProgress,
                            bookId: currentBookId
                        });
                    }

                    // 初始恢复阅读位置
                    const targetProgress = ${book.progress};
                    if (targetProgress > 0) {
                        isRestoringPosition = true;  // 新增：开始恢复位置

                        function restorePosition() {
                            // 直接计算和设置滚动位置，不使用requestAnimationFrame以减少延迟
                            const scrollRange = contentElement.scrollHeight - contentElement.clientHeight;
                            console.log('计算滚动范围:', {
                                scrollHeight: contentElement.scrollHeight,
                                clientHeight: contentElement.clientHeight,
                                scrollRange: scrollRange,
                                targetProgress: targetProgress
                            });

                            if (scrollRange > 0) {
                                if (!isChunked || loadedSize >= totalSize) {
                                    // 全部加载完成，直接滚动
                                    const targetScrollTop = scrollRange * (targetProgress / 100);
                                    contentElement.scrollTop = targetScrollTop;
                                    console.log('恢复位置到:', targetScrollTop, '进度:', targetProgress + '%');

                                    // 恢复完成后，立即允许进度更新
                                    isRestoringPosition = false;
                                    console.log('位置恢复完成，启用进度更新');
                                } else {
                                    // 分块加载，检查目标进度是否在已加载范围内
                                    const loadedRatio = loadedSize / totalSize;
                                    const loadedPercentage = loadedRatio * 100;

                                    console.log('分块恢复检查:', {
                                        targetProgress: targetProgress,
                                        loadedPercentage: loadedPercentage,
                                        loadedSize: loadedSize,
                                        totalSize: totalSize
                                    });

                                    if (targetProgress <= loadedPercentage) {
                                        // 目标在已加载范围内
                                        const scrollRatio = (targetProgress / 100) / loadedRatio;
                                        const targetScrollTop = scrollRange * scrollRatio;
                                        contentElement.scrollTop = targetScrollTop;
                                        console.log('分块恢复位置:', targetScrollTop, '进度:', targetProgress + '%');

                                        // 恢复完成后，立即允许进度更新
                                        isRestoringPosition = false;
                                        console.log('位置恢复完成，启用进度更新');
                                    } else {
                                        // 目标超过已加载范围，需要加载更多内容
                                        console.log('目标进度超过已加载范围，需要加载更多内容');
                                        loadMoreForRestore();
                                    }
                                }
                            } else {
                                // 滚动范围为0，可能内容还没加载完成，稍后重试
                                console.log('滚动范围为0，稍后重试恢复位置');
                                setTimeout(restorePosition, 100); // 减少重试延迟
                            }
                        }

                        function loadMoreForRestore() {
                            if (isLoading || loadedSize >= totalSize) {
                                // 加载完成或正在加载，尝试恢复位置
                                setTimeout(restorePosition, 300);
                                return;
                            }

                            // 检查当前已加载内容是否足够覆盖目标进度
                            const loadedRatio = loadedSize / totalSize;
                            const loadedPercentage = loadedRatio * 100;

                            if (targetProgress <= loadedPercentage) {
                                // 已加载足够内容，尝试恢复位置
                                restorePosition();
                                return;
                            }

                            isLoading = true;
                            loadingIndicator.style.display = 'block';

                            const start = loadedSize;
                            const end = Math.min(loadedSize + CHUNK_SIZE, totalSize);

                            console.log('为恢复位置加载更多内容:', { start: start, end: end });

                            vscode.postMessage({
                                type: 'loadMoreContent',
                                start: start,
                                end: end,
                                encoding: '${encoding}',
                                bookId: currentBookId
                            });

                            // 注意：不再在这里设置isLoading = false，而是由handleMessage函数处理
                            // 当收到moreContent消息时，handleMessage会设置isLoading = false并尝试恢复位置
                        }

                        // 开始恢复位置
                        setTimeout(restorePosition, 300);
                    } else {
                        isRestoringPosition = false;
                    }

                // 页面卸载时保存最后位置
                window.addEventListener('beforeunload', () => {
                    updateProgress();
                });

                // 定期保存位置(每30秒)
                setInterval(() => {
                    updateProgress();
                }, 30000);

                // 初始更新一次进度
                setTimeout(() => {
                    updateProgress();
                }, 500);

                })(); // 立即执行
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
