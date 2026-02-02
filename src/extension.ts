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

    // 设置字体大小
    setFontSize(size: number) {
        this.currentFontSize = Math.max(8, Math.min(48, size));
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
                    console.log('Increase font size requested');
                    this._state.increaseFontSize();
                    console.log('Font size after increase:', this._state.getFontSize());
                    this.updateFontSize(data.scrollPosition);
                    break;
                case 'decreaseFontSize':
                    console.log('Decrease font size requested');
                    this._state.decreaseFontSize();
                    console.log('Font size after decrease:', this._state.getFontSize());
                    this.updateFontSize(data.scrollPosition);
                    break;
                case 'updateFontSize':
                    console.log('Update font size requested:', data.fontSize);
                    this._state.setFontSize(data.fontSize);
                    console.log('Font size updated:', this._state.getFontSize());
                    break;
                case 'loadPdfFile':
                    console.log('Load PDF file requested for book:', data.bookId);
                    this.loadPdfFile(data.bookId);
                    break;
                case 'loadMoreContent':
                    this.loadMoreContent(data.bookId, data.start, data.end, data.scrollPosition);
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
    updateFontSize(scrollPosition?: number) {
        console.log('Update font size called, scrollPosition:', scrollPosition);
        if (this._view) {
            console.log('Current font size:', this._state.getFontSize());
            const html = this._getHtmlForWebview(this._view.webview);
            console.log('HTML generated, updating webview');
            this._view.webview.html = html;

            // 如果提供了滚动位置，恢复它
            if (scrollPosition !== undefined) {
                // 使用setTimeout确保DOM已经加载完成
                setTimeout(() => {
                    console.log('Restoring scroll position:', scrollPosition);
                    this._view?.webview.postMessage({
                        type: 'restoreScrollPosition',
                        scrollPosition: scrollPosition
                    });
                }, 100);
            }
        } else {
            console.error('View is not initialized');
        }
    }

    // 加载更多内容
    private loadMoreContent(bookId: string, start: number, end: number, scrollPosition?: number) {
        if (!this._currentBook || this._currentBook.id !== bookId) {
            return;
        }

        try {
            // 读取指定范围的内容
            const content = this.readFilePart(this._currentBook.path, start, end);

            // 发送内容到webview
            if (this._view) {
                this._view.webview.postMessage({
                    type: 'contentLoaded',
                    content: content,
                    start: start,
                    end: end,
                    scrollPosition: scrollPosition
                });
            }
        } catch (error) {
            console.error('Failed to load more content:', error);
        }
    }

    // 加载PDF文件
    private loadPdfFile(bookId: string) {
        if (!this._currentBook || this._currentBook.id !== bookId) {
            return;
        }

        try {
            console.log('Reading PDF file:', this._currentBook.path);

            // 读取整个PDF文件
            const pdfData = fs.readFileSync(this._currentBook.path);
            console.log('PDF file read successfully, size:', pdfData.length, 'bytes');

            // 转换为Base64
            const base64Data = pdfData.toString('base64');
            console.log('PDF data converted to Base64, length:', base64Data.length);

            // 发送给webview
            if (this._view) {
                this._view.webview.postMessage({
                    type: 'pdfData',
                    data: base64Data
                });
                console.log('PDF data sent to webview');
            }
        } catch (error) {
            console.error('Failed to load PDF file:', error);
            if (this._view) {
                this._view.webview.postMessage({
                    type: 'pdfError',
                    error: (error as Error).message || String(error)
                });
            }
        }
    }

    // 获取当前主题是否为暗色
    private isDarkTheme(): boolean {
        return vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;
    }

    // 读取文件的部分内容
    private readFilePart(filePath: string, start: number, end: number): string {
        try {
            const buffer = Buffer.alloc(end - start);
            const fd = fs.openSync(filePath, 'r');
            fs.readSync(fd, buffer, 0, end - start, start);
            fs.closeSync(fd);
            return buffer.toString('utf8');
        } catch (error) {
            console.error('Failed to read file part:', error);
            return 'Failed to load content';
        }
    }

    // 获取文件大小
    private getFileSize(filePath: string): number {
        try {
            const stats = fs.statSync(filePath);
            return stats.size;
        } catch (error) {
            console.error('Failed to get file size:', error);
            return 0;
        }
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
                        <p>Use the "Add Book" command to add a .txt or .pdf file</p>
                    </div>
                </body>
                </html>
            `;
        }

        // 检查文件类型
        const ext = path.extname(this._currentBook.path).toLowerCase();

        // 对于PDF文件
        if (ext === '.pdf') {
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
                            transition: background-color 0.3s, color 0.3s;
                        }
                        .book-content {
                            max-width: 800px;
                            margin: 0 auto;
                            background-color: ${isDark ? '#252526' : '#ffffff'};
                            padding: 20px;
                            border-radius: 8px;
                            box-shadow: 0 2px 4px ${isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)'};
                            transition: background-color 0.3s;
                        }
                        #pdf-container {
                            width: 100%;
                            min-height: 800px;
                            background-color: ${isDark ? '#1e1e1e' : '#f0f0f0'};
                            border-radius: 4px;
                            padding: 10px;
                        }
                        #pdf-canvas {
                            display: block;
                            margin: 0 auto;
                            max-width: 100%;
                            background-color: ${isDark ? '#000000' : '#ffffff'};
                            border-radius: 2px;
                        }
                        .pdf-controls {
                            display: flex;
                            justify-content: center;
                            gap: 10px;
                            margin: 20px 0;
                        }
                        .pdf-btn {
                            background-color: ${isDark ? '#333' : '#f0f0f0'};
                            color: ${isDark ? '#d4d4d4' : '#333'};
                            border: none;
                            border-radius: 4px;
                            padding: 8px 12px;
                            font-size: 14px;
                            cursor: pointer;
                            transition: background-color 0.2s;
                        }
                        .pdf-btn:hover {
                            background-color: ${isDark ? '#444' : '#e0e0e0'};
                        }
                        .loading-indicator {
                            text-align: center;
                            padding: 20px;
                            color: ${isDark ? '#999' : '#666'};
                            font-style: italic;
                        }
                        .page-info {
                            text-align: center;
                            margin: 10px 0;
                            color: ${isDark ? '#999' : '#666'};
                        }
                    </style>
                    <!-- 引入PDF.js库 -->
                    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
                </head>
                <body>
                    <div class="book-content">
                        <div id="pdf-container">
                            <div id="loading" class="loading-indicator">Loading PDF...</div>
                            <canvas id="pdf-canvas"></canvas>
                            <div class="page-info" id="page-info"></div>
                            <div class="pdf-controls">
                                <button id="prev-page" class="pdf-btn">Previous</button>
                                <button id="next-page" class="pdf-btn">Next</button>
                                <button id="zoom-in" class="pdf-btn">Zoom In</button>
                                <button id="zoom-out" class="pdf-btn">Zoom Out</button>
                            </div>
                        </div>
                    </div>
                    <script>
                        console.log('PDF reader script loaded');
                        const vscode = acquireVsCodeApi();

                        // PDF相关变量
                        let pdfDoc = null;
                        let currentPage = 1;
                        let zoom = 1.5; // 增大默认缩放级别，使PDF显示更大
                        let totalPages = 0;

                        // 加载PDF文件
                        async function loadPDF() {
                            try {
                                console.log('Starting to load PDF...');
                                console.log('Current theme from extension:', '${isDark ? 'dark' : 'light'}');

                                // 请求扩展读取PDF文件内容
                                vscode.postMessage({
                                    type: 'loadPdfFile',
                                    bookId: '${this._currentBook.id}'
                                });
                            } catch (error) {
                                console.error('Error starting PDF load:', error);
                                document.getElementById('loading').textContent = 'Error loading PDF: ' + error.message;
                            }
                        }

                        // 监听来自扩展的PDF数据
                        window.addEventListener('message', event => {
                            const message = event.data;
                            if (message.type === 'pdfData') {
                                try {
                                    console.log('Received PDF data, length:', message.data.length);

                                    // 将Base64数据转换为ArrayBuffer
                                    const binaryString = atob(message.data);
                                    const len = binaryString.length;
                                    const bytes = new Uint8Array(len);
                                    for (let i = 0; i < len; i++) {
                                        bytes[i] = binaryString.charCodeAt(i);
                                    }
                                    const arrayBuffer = bytes.buffer;

                                    // 使用扩展传递的主题信息
                                    const isDarkTheme = '${isDark}';
                                    console.log('Current theme from extension:', isDarkTheme ? 'dark' : 'light');

                                    // 使用ArrayBuffer加载PDF
                                    const loadingTask = pdfjsLib.getDocument({
                                        data: arrayBuffer,
                                        cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
                                        cMapPacked: true
                                    });

                                    loadingTask.promise.then(pdf => {
                                        pdfDoc = pdf;
                                        totalPages = pdf.numPages;
                                        document.getElementById('page-info').textContent = 'Page ' + currentPage + ' of ' + totalPages;
                                        document.getElementById('loading').style.display = 'none';
                                        console.log('PDF loaded successfully, total pages:', totalPages);

                                        // 渲染第一页
                                        renderPage(currentPage);

                                        // 更新阅读进度
                                        updateProgress();
                                    }).catch(error => {
                                        console.error('Error loading PDF from data:', error);
                                        document.getElementById('loading').textContent = 'Error loading PDF: ' + error.message;
                                    });
                                } catch (error) {
                                    console.error('Error processing PDF data:', error);
                                    document.getElementById('loading').textContent = 'Error processing PDF data: ' + error.message;
                                }
                            }
                        });

                        // 渲染页面
                        async function renderPage(pageNum) {
                            const page = await pdfDoc.getPage(pageNum);
                            const canvas = document.getElementById('pdf-canvas');
                            const ctx = canvas.getContext('2d');

                            // 使用扩展传递的主题信息
                            const isDarkTheme = ${isDark};
                            console.log('Rendering page with theme:', isDarkTheme ? 'dark' : 'light');

                            // 设置画布大小
                            const viewport = page.getViewport({ scale: zoom });
                            canvas.width = viewport.width;
                            canvas.height = viewport.height;

                            // 清空画布并设置背景色
                            ctx.fillStyle = isDarkTheme ? '#000000' : '#ffffff';
                            ctx.fillRect(0, 0, canvas.width, canvas.height);

                            // 渲染PDF页面
                            const renderContext = {
                                canvasContext: ctx,
                                viewport: viewport
                            };

                            await page.render(renderContext).promise;

                            // 如果是暗色主题，对画布进行处理，将白色背景转换为黑色
                            if (isDarkTheme) {
                                console.log('Applying dark mode filter to PDF');
                                // 使用CSS滤镜实现暗色模式
                                canvas.style.filter = 'invert(1) hue-rotate(180deg)';
                                // 设置画布背景为黑色
                                canvas.style.backgroundColor = '#000000';
                                // 同时设置容器背景为黑色
                                document.getElementById('pdf-container').style.backgroundColor = '#000000';
                            } else {
                                // 亮色主题，重置滤镜
                                canvas.style.filter = 'none';
                                canvas.style.backgroundColor = '#ffffff';
                                // 同时设置容器背景为亮色
                                document.getElementById('pdf-container').style.backgroundColor = '#f0f0f0';
                            }

                            document.getElementById('page-info').textContent = 'Page ' + pageNum + ' of ' + totalPages;
                            currentPage = pageNum;

                            // 更新阅读进度
                            updateProgress();
                        }

                        // 更新阅读进度
                        function updateProgress() {
                            const progress = (currentPage / totalPages) * 100;
                            const formattedProgress = Math.round(progress * 100) / 100;
                            vscode.postMessage({
                                type: 'updateProgress',
                                progress: formattedProgress
                            });
                        }

                        // 绑定事件
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
                            zoom /= 1.2;
                            renderPage(currentPage);
                        });

                        // 初始加载
                        loadPDF();
                    </script>
                </body>
                </html>
            `;
        }

        // 获取文件大小
        const fileSize = this.getFileSize(this._currentBook.path);
        // 计算初始加载位置（基于阅读进度）
        const initialStart = Math.floor((this._currentBook.progress / 100) * fileSize);
        // 每次加载的字节数（约50KB）
        const chunkSize = 50 * 1024;
        // 计算加载范围，向前和向后各加载一些内容
        const start = Math.max(0, initialStart - chunkSize);
        const end = Math.min(fileSize, initialStart + chunkSize * 2);

        // 读取部分内容
        let content = 'Failed to load book';
        try {
            content = this.readFilePart(this._currentBook.path, start, end);
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
                    .loading-indicator {
                        text-align: center;
                        padding: 20px;
                        color: ${isDark ? '#999' : '#666'};
                        font-style: italic;
                    }
                    .content-wrapper {
                        position: relative;
                    }
                    .font-controls-fixed {
                        position: fixed;
                        top: 50%;
                        right: 20px;
                        transform: translateY(-50%);
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                        z-index: 1000;
                        background-color: ${isDark ? 'rgba(30, 30, 30, 0.9)' : 'rgba(255, 255, 255, 0.9)'};
                        padding: 10px;
                        border-radius: 8px;
                        box-shadow: 0 2px 8px ${isDark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.1)'};
                    }
                    .font-btn {
                        background-color: ${isDark ? '#333' : '#f0f0f0'};
                        color: ${isDark ? '#d4d4d4' : '#333'};
                        border: none;
                        border-radius: 4px;
                        padding: 8px 12px;
                        font-size: 14px;
                        cursor: pointer;
                        transition: background-color 0.2s, transform 0.1s;
                    }
                    .font-btn:hover {
                        background-color: ${isDark ? '#444' : '#e0e0e0'};
                    }
                    .font-btn:active {
                        background-color: ${isDark ? '#555' : '#d0d0d0'};
                        transform: scale(0.95);
                    }
                    .content {
                        font-size: ${this._state.getFontSize()}px;
                        transition: font-size 0.3s;
                    }
                </style>
            </head>
            <body>
                <div class="book-content">
                    <div class="content-wrapper">
                        <div id="content" class="content">${content}</div>
                        <div id="loading" class="loading-indicator" style="display: none;">Loading more content...</div>
                    </div>
                </div>
                <div class="font-controls-fixed">
                    <button id="decrease-font" class="font-btn">A-</button>
                    <button id="increase-font" class="font-btn">A+</button>
                </div>
                <script>
                    console.log('Book reader script loaded');
                    const vscode = acquireVsCodeApi();
                    console.log('VSCode API acquired');

                    // 立即执行的调试代码
                    setTimeout(() => {
                        console.log('=== Debug Info ===');
                        console.log('Document ready');
                        console.log('Increase button:', document.getElementById('increase-font'));
                        console.log('Decrease button:', document.getElementById('decrease-font'));
                        console.log('Content element:', document.getElementById('content'));
                        console.log('Font controls element:', document.querySelector('.font-controls-fixed'));
                        console.log('Body:', document.body);
                        console.log('=== End Debug Info ===');
                    }, 100);

                    // 书籍信息
                    const bookInfo = {
                        id: '${this._currentBook.id}',
                        filePath: '${this._currentBook.path}',
                        fileSize: ${fileSize},
                        chunkSize: ${chunkSize}
                    };

                    // 保存当前滚动位置
                    function saveScrollPosition() {
                        return window.scrollY;
                    }

                    // 恢复滚动位置
                    function restoreScrollPosition(position) {
                        window.scrollTo(0, position);
                    }

                    // 字体调节功能
                    const increaseBtn = document.getElementById('increase-font');
                    const decreaseBtn = document.getElementById('decrease-font');
                    const contentElement = document.getElementById('content');

                    console.log('Font controls initialized');
                    console.log('Increase button:', increaseBtn);
                    console.log('Decrease button:', decreaseBtn);
                    console.log('Content element:', contentElement);

                    // 获取当前字体大小
                    let currentFontSize = ${this._state.getFontSize()};
                    console.log('Initial font size:', currentFontSize);

                    // 更新字体大小的函数
                    function updateFontSize(size) {
                        if (contentElement) {
                            contentElement.style.fontSize = size + 'px';
                            console.log('Font size updated to:', size);
                            // 保存到localStorage
                            localStorage.setItem('readplugin-fontsize', size.toString());
                        }
                    }

                    if (increaseBtn) {
                        increaseBtn.addEventListener('click', () => {
                            console.log('Increase font size clicked');
                            currentFontSize += 2;
                            updateFontSize(currentFontSize);
                            // 同时通知扩展更新
                            vscode.postMessage({
                                type: 'updateFontSize',
                                fontSize: currentFontSize
                            });
                        });
                    } else {
                        console.error('Increase font button not found');
                    }

                    if (decreaseBtn) {
                        decreaseBtn.addEventListener('click', () => {
                            console.log('Decrease font size clicked');
                            currentFontSize = Math.max(8, currentFontSize - 2);
                            updateFontSize(currentFontSize);
                            // 同时通知扩展更新
                            vscode.postMessage({
                                type: 'updateFontSize',
                                fontSize: currentFontSize
                            });
                        });
                    } else {
                        console.error('Decrease font button not found');
                    }

                    // 从localStorage加载保存的字体大小
                    const savedFontSize = localStorage.getItem('readplugin-fontsize');
                    if (savedFontSize) {
                        const size = parseInt(savedFontSize);
                        if (!isNaN(size)) {
                            currentFontSize = size;
                            updateFontSize(currentFontSize);
                            console.log('Loaded saved font size:', size);
                        }
                    }

                    // 加载更多内容
                    function loadMoreContent(direction) {
                        const contentElement = document.getElementById('content');
                        const loadingElement = document.getElementById('loading');

                        if (!contentElement || !loadingElement) return;

                        // 显示加载指示器
                        loadingElement.style.display = 'block';

                        // 计算当前内容的范围
                        const currentTop = contentElement.getAttribute('data-start') || 0;
                        const currentBottom = contentElement.getAttribute('data-end') || bookInfo.fileSize;

                        // 计算新的加载范围
                        let newStart = parseInt(currentTop);
                        let newEnd = parseInt(currentBottom);

                        if (direction === 'up') {
                            newStart = Math.max(0, newStart - bookInfo.chunkSize);
                        } else if (direction === 'down') {
                            newEnd = Math.min(bookInfo.fileSize, newEnd + bookInfo.chunkSize);
                        }

                        // 请求加载更多内容
                        vscode.postMessage({
                            type: 'loadMoreContent',
                            bookId: bookInfo.id,
                            start: newStart,
                            end: newEnd,
                            direction: direction
                        });
                    }

                    // 监听滚动事件
                    window.addEventListener('scroll', () => {
                        const scrollTop = window.scrollY;
                        const scrollHeight = document.documentElement.scrollHeight;
                        const clientHeight = window.innerHeight;

                        // 更新进度
                        const progress = scrollHeight > clientHeight ? (scrollTop / (scrollHeight - clientHeight)) * 100 : 0;
                        const formattedProgress = Math.round(progress * 100) / 100;
                        vscode.postMessage({ type: 'updateProgress', progress: formattedProgress });

                        // 检测是否需要加载更多内容
                        const threshold = 300; // 阈值，当距离顶部或底部小于此值时加载

                        if (scrollTop < threshold) {
                            // 接近顶部，加载上面的内容
                            loadMoreContent('up');
                        } else if (scrollTop > scrollHeight - clientHeight - threshold) {
                            // 接近底部，加载下面的内容
                            loadMoreContent('down');
                        }
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

                    // 监听来自扩展的消息
                    window.addEventListener('message', event => {
                        const message = event.data;

                        if (message.type === 'restoreScrollPosition') {
                            restoreScrollPosition(message.scrollPosition);
                        } else if (message.type === 'contentLoaded') {
                            // 更新内容
                            const contentElement = document.getElementById('content');
                            const loadingElement = document.getElementById('loading');

                            if (contentElement && loadingElement) {
                                contentElement.innerHTML = message.content;
                                contentElement.setAttribute('data-start', message.start);
                                contentElement.setAttribute('data-end', message.end);
                                loadingElement.style.display = 'none';

                                // 恢复滚动位置
                                if (message.scrollPosition !== undefined) {
                                    restoreScrollPosition(message.scrollPosition);
                                }
                            }
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
                    'Books': ['txt', 'pdf'],
                    'Text Files': ['txt'],
                    'PDF Files': ['pdf']
                }
            });

            if (fileUri && fileUri[0]) {
                const filePath = fileUri[0].fsPath;
                const ext = path.extname(filePath).toLowerCase();

                // 校验文件类型
                if (ext !== '.txt' && ext !== '.pdf') {
                    vscode.window.showErrorMessage('Please select a .txt or .pdf file');
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
