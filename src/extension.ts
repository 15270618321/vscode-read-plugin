import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// 定义书籍类型
interface Book {
    id: string;
    name: string;
    path: string;
    progress: number;
}

// 定义插件状态
class ReadPluginState {
    private books: Book[] = [];
    private currentFontSize: number = 14;
    private storagePath: string;

    constructor(context: vscode.ExtensionContext) {
        this.storagePath = context.storagePath || path.join(require('os').homedir(), 'AppData', 'Roaming', 'Code', 'User', 'globalStorage', 'readplugin');
        this.loadState();
    }

    // 加载状态
    private loadState() {
        try {
            if (!fs.existsSync(this.storagePath)) {
                fs.mkdirSync(this.storagePath, { recursive: true });
            }

            const booksPath = path.join(this.storagePath, 'books.json');
            if (fs.existsSync(booksPath)) {
                const data = fs.readFileSync(booksPath, 'utf8');
                this.books = JSON.parse(data);
            }

            const settingsPath = path.join(this.storagePath, 'settings.json');
            if (fs.existsSync(settingsPath)) {
                const data = fs.readFileSync(settingsPath, 'utf8');
                const settings = JSON.parse(data);
                this.currentFontSize = settings.fontSize || 14;
            }
        } catch (error) {
            console.error('Failed to load state:', error);
        }
    }

    // 保存状态
    private saveState() {
        try {
            if (!fs.existsSync(this.storagePath)) {
                fs.mkdirSync(this.storagePath, { recursive: true });
            }

            const booksPath = path.join(this.storagePath, 'books.json');
            fs.writeFileSync(booksPath, JSON.stringify(this.books, null, 2));

            const settingsPath = path.join(this.storagePath, 'settings.json');
            fs.writeFileSync(settingsPath, JSON.stringify({ fontSize: this.currentFontSize }, null, 2));
        } catch (error) {
            console.error('Failed to save state:', error);
        }
    }

    // 添加书籍
    addBook(bookPath: string): Book {
        const bookName = path.basename(bookPath);
        const book: Book = {
            id: Date.now().toString(),
            name: bookName,
            path: bookPath,
            progress: 0
        };

        this.books.push(book);
        this.saveState();
        return book;
    }

    // 获取所有书籍
    getBooks(): Book[] {
        return this.books;
    }

    // 更新书籍进度
    updateBookProgress(bookId: string, progress: number) {
        const book = this.books.find(b => b.id === bookId);
        if (book) {
            // 保留2位小数并限制范围
            const formattedProgress = Math.max(0, Math.min(100, Math.round(progress * 100) / 100));
            book.progress = formattedProgress;
            this.saveState();
        }
    }

    // 删除书籍
    removeBook(bookId: string) {
        this.books = this.books.filter(b => b.id !== bookId);
        this.saveState();
    }

    // 获取字体大小
    getFontSize(): number {
        return this.currentFontSize;
    }

    // 增加字体大小
    increaseFontSize() {
        this.currentFontSize += 2;
        this.saveState();
        return this.currentFontSize;
    }

    // 减小字体大小
    decreaseFontSize() {
        this.currentFontSize = Math.max(8, this.currentFontSize - 2);
        this.saveState();
        return this.currentFontSize;
    }
}

// 书籍视图提供者
class BooksTreeDataProvider implements vscode.TreeDataProvider<BookItem | AddBookItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<BookItem | AddBookItem | undefined | null | void> = new vscode.EventEmitter<BookItem | AddBookItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<BookItem | AddBookItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private state: ReadPluginState) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    // 刷新单个书籍项
    refreshBook(bookId: string): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: BookItem | AddBookItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: any): Thenable<(BookItem | AddBookItem)[]> {
        if (!element) {
            const books = this.state.getBooks().map(book => new BookItem(book));
            return Promise.resolve([new AddBookItem(), ...books]);
        }
        return Promise.resolve([]);
    }
}

// 添加书籍项
class AddBookItem extends vscode.TreeItem {
    constructor() {
        super('+ Add Book', vscode.TreeItemCollapsibleState.None);
        this.tooltip = 'Add a new book';
        this.command = {
            command: 'readplugin.addBook',
            title: 'Add Book'
        };
        this.iconPath = new vscode.ThemeIcon('plus');
    }

    contextValue: string = 'addBookItem';
}

// 书籍树项
class BookItem extends vscode.TreeItem {
    constructor(public readonly book: Book) {
        super(book.name, vscode.TreeItemCollapsibleState.None);
        // 保留2位小数显示进度
        const formattedProgress = Math.round(book.progress * 100) / 100;
        this.tooltip = `${book.name}\nProgress: ${formattedProgress}%`;
        this.description = `${formattedProgress}%`;
        this.command = {
            command: 'readplugin.openBook',
            title: 'Open Book',
            arguments: [book]
        };
    }

    contextValue: string = 'bookItem';
}

// 书籍内容视图
class BookContentViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'read-plugin.bookContent';

    private _view?: vscode.WebviewView;
    private _currentBook?: Book;
    private _state: ReadPluginState;
    private _treeDataProvider?: BooksTreeDataProvider;

    constructor(private readonly _extensionContext: vscode.ExtensionContext, state: ReadPluginState) {
        this._state = state;
    }

    // 设置树数据提供者
    setTreeDataProvider(provider: BooksTreeDataProvider) {
        this._treeDataProvider = provider;
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionContext.extensionUri]
        };

        // 监听主题变化
        const themeChangeListener = vscode.window.onDidChangeActiveColorTheme(() => {
            if (this._view) {
                this._view.webview.html = this._getHtmlForWebview(this._view.webview);
            }
        });

        // 清理监听器
        webviewView.onDidDispose(() => {
            themeChangeListener.dispose();
        });

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // 监听来自webview的消息
        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.type) {
                case 'updateProgress':
                    if (this._currentBook) {
                        this._state.updateBookProgress(this._currentBook.id, data.progress);
                        // 实时刷新树视图
                        if (this._treeDataProvider) {
                            this._treeDataProvider.refreshBook(this._currentBook.id);
                        }
                    }
                    break;
                case 'increaseFontSize':
                    this._state.increaseFontSize();
                    this.updateFontSize();
                    break;
                case 'decreaseFontSize':
                    this._state.decreaseFontSize();
                    this.updateFontSize();
                    break;
            }
        });
    }

    // 打开书籍
    openBook(book: Book) {
        this._currentBook = book;
        if (this._view) {
            this._view.show?.(true);
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        }
    }

    // 更新字体大小
    updateFontSize() {
        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        }
    }

    // 获取当前主题是否为暗色
    private isDarkTheme(): boolean {
        return vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;
    }

    // 获取webview HTML
    private _getHtmlForWebview(webview: vscode.Webview) {
        const isDark = this.isDarkTheme();

        if (!this._currentBook) {
            return `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Book Reader</title>
                    <style>
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                            padding: 20px;
                            line-height: 1.6;
                            background-color: ${isDark ? '#1e1e1e' : '#f5f5f5'};
                            color: ${isDark ? '#d4d4d4' : '#333'};
                            transition: background-color 0.3s, color 0.3s;
                        }
                        .empty-state {
                            text-align: center;
                            margin-top: 50px;
                            color: ${isDark ? '#999' : '#666'};
                        }
                    </style>
                </head>
                <body>
                    <div class="empty-state">
                        <h2>Select a book to read</h2>
                        <p>Use the "Add Book" command to add a .txt file</p>
                    </div>
                </body>
                </html>
            `;
        }

        let content = 'Failed to load book';
        try {
            content = fs.readFileSync(this._currentBook.path, 'utf8');
        } catch (error) {
            console.error('Failed to read book:', error);
        }

        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${this._currentBook.name}</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                        padding: 20px;
                        line-height: 1.8;
                        background-color: ${isDark ? '#1e1e1e' : '#f0f0f0'};
                        color: ${isDark ? '#d4d4d4' : '#333'};
                        font-size: ${this._state.getFontSize()}px;
                        transition: background-color 0.3s, color 0.3s;
                    }
                    .book-content {
                        max-width: 800px;
                        margin: 0 auto;
                        background-color: ${isDark ? '#252526' : '#ffffff'};
                        padding: 40px;
                        border-radius: 8px;
                        box-shadow: 0 2px 4px ${isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)'};
                        white-space: pre-wrap;
                        transition: background-color 0.3s;
                    }
                    .book-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 20px;
                        padding-bottom: 10px;
                        border-bottom: 1px solid ${isDark ? '#333' : '#f0f0f0'};
                    }
                    .book-title {
                        font-size: 20px;
                        font-weight: bold;
                        color: ${isDark ? '#999' : '#666'};
                        flex: 1;
                    }
                    .font-controls {
                        display: flex;
                        gap: 8px;
                    }
                    .font-btn {
                        background-color: ${isDark ? '#333' : '#f0f0f0'};
                        color: ${isDark ? '#d4d4d4' : '#333'};
                        border: none;
                        border-radius: 4px;
                        padding: 4px 8px;
                        font-size: 14px;
                        cursor: pointer;
                        transition: background-color 0.2s;
                    }
                    .font-btn:hover {
                        background-color: ${isDark ? '#444' : '#e0e0e0'};
                    }
                    .font-btn:active {
                        background-color: ${isDark ? '#555' : '#d0d0d0'};
                    }
                </style>
            </head>
            <body>
                <div class="book-content">
                    <div class="book-header">
                        <div class="book-title">${this._currentBook.name}</div>
                        <div class="font-controls">
                            <button id="decrease-font" class="font-btn">A-</button>
                            <button id="increase-font" class="font-btn">A+</button>
                        </div>
                    </div>
                    <div class="content">${content}</div>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();

                    // 字体调节功能
                    document.getElementById('increase-font').addEventListener('click', () => {
                        vscode.postMessage({ type: 'increaseFontSize' });
                    });

                    document.getElementById('decrease-font').addEventListener('click', () => {
                        vscode.postMessage({ type: 'decreaseFontSize' });
                    });

                    // 监听滚动事件更新进度
                    window.addEventListener('scroll', () => {
                        const scrollTop = window.scrollY;
                        const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
                        const progress = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
                        // 保留2位小数
                        const formattedProgress = Math.round(progress * 100) / 100;
                        vscode.postMessage({ type: 'updateProgress', progress: formattedProgress });
                    });

                    // 初始滚动到上次阅读位置
                    window.addEventListener('load', () => {
                        const progress = ${this._currentBook.progress};
                        if (progress > 0) {
                            const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
                            const scrollTop = (progress / 100) * scrollHeight;
                            window.scrollTo(0, scrollTop);
                        }
                    });
                </script>
            </body>
            </html>
        `;
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Read Plugin is now active!');

    // 初始化状态
    const state = new ReadPluginState(context);

    // 注册书籍视图
    const booksTreeDataProvider = new BooksTreeDataProvider(state);
    vscode.window.registerTreeDataProvider('read-plugin-books', booksTreeDataProvider);

    // 注册书籍内容视图
    const bookContentProvider = new BookContentViewProvider(context, state);
    // 设置树数据提供者，用于实时刷新
    bookContentProvider.setTreeDataProvider(booksTreeDataProvider);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(BookContentViewProvider.viewType, bookContentProvider)
    );

    // 注册添加书籍命令
    context.subscriptions.push(
        vscode.commands.registerCommand('readplugin.addBook', async () => {
            const fileUri = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: {
                    'Text Files': ['txt']
                }
            });

            if (fileUri && fileUri[0]) {
                const filePath = fileUri[0].fsPath;
                // 增加.txt文件校验
                if (path.extname(filePath).toLowerCase() !== '.txt') {
                    vscode.window.showErrorMessage('Please select a .txt file');
                    return;
                }

                const book = state.addBook(filePath);
                booksTreeDataProvider.refresh();
                vscode.window.showInformationMessage(`Added book: ${book.name}`);
            }
        })
    );

    // 注册打开书籍命令
    context.subscriptions.push(
        vscode.commands.registerCommand('readplugin.openBook', (book: Book) => {
            bookContentProvider.openBook(book);
        })
    );

    // 注册增加字体大小命令
    context.subscriptions.push(
        vscode.commands.registerCommand('readplugin.increaseFontSize', () => {
            state.increaseFontSize();
            bookContentProvider.updateFontSize();
        })
    );

    // 注册减小字体大小命令
    context.subscriptions.push(
        vscode.commands.registerCommand('readplugin.decreaseFontSize', () => {
            state.decreaseFontSize();
            bookContentProvider.updateFontSize();
        })
    );

    // 注册删除书籍命令
    context.subscriptions.push(
        vscode.commands.registerCommand('readplugin.removeBook', (bookItem: BookItem) => {
            // 确认删除
            vscode.window.showInformationMessage(
                `Are you sure you want to remove "${bookItem.book.name}"?`,
                { modal: true },
                'Yes', 'No'
            ).then(choice => {
                if (choice === 'Yes') {
                    // 检查是否是当前正在阅读的书籍
                    if (bookContentProvider && bookContentProvider['_currentBook'] &&
                        bookContentProvider['_currentBook'].id === bookItem.book.id) {
                        // 清除当前阅读的书籍
                        (bookContentProvider as any)._currentBook = undefined;
                        // 重新渲染内容视图
                        if (bookContentProvider['_view']) {
                            bookContentProvider['_view'].webview.html =
                                (bookContentProvider as any)._getHtmlForWebview(bookContentProvider['_view'].webview);
                        }
                    }

                    state.removeBook(bookItem.book.id);
                    booksTreeDataProvider.refresh();
                    vscode.window.showInformationMessage(`Removed book: ${bookItem.book.name}`);
                }
            });
        })
    );
}

export function deactivate() {
    console.log('Read Plugin is now deactivated!');
}
