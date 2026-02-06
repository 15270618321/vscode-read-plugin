/**
 * services/wechatReadService.ts
 * 微信读书服务类
 *
 * 功能说明：
 * 1. 提供微信读书API的访问功能 - 调用微信读书的接口获取数据
 * 2. 处理微信读书书籍的同步和解析 - 将API返回的数据转换为插件可用的格式
 * 3. 验证微信读书Token的有效性 - 检查用户的登录状态
 * 4. 封装网络请求和错误处理 - 处理API调用过程中的各种情况
 *
 * 核心概念：
 * - API调用：通过HTTPS请求访问微信读书的接口
 * - Token认证：使用用户的Token和用户ID进行身份验证
 * - 数据解析：将API返回的JSON数据转换为插件内部的Book对象
 * - 错误处理：处理网络错误、API错误等各种异常情况
 *
 * 技术要点：
 * - Promise异步操作：处理网络请求的异步特性
 * - HTTPS请求：使用Node.js的https模块发送请求
 * - JSON解析：处理API返回的JSON数据
 * - 错误处理：捕获和处理各种可能的错误
 */
import * as https from 'https';
import { Book, PluginSettings } from '../types';

/**
 * 微信读书服务类
 *
 * 功能：
 * 1. 获取微信读书书籍列表
 * 2. 获取微信读书书籍内容
 * 3. 验证微信读书Token有效性
 * 4. 解析微信读书API返回的数据
 */
export class WechatReadService {
    /** 微信读书Token */
    private token: string;
    /** 微信读书用户ID */
    private userId: string;

    /**
     * 构造函数
     * @param settings 插件设置对象
     */
    constructor(settings: PluginSettings) {
        this.token = settings.wechatReadToken || '';
        this.userId = settings.wechatReadUserId || '';
    }

    /**
     * 获取微信读书书籍列表
     * @param synckey 同步键，用于增量同步 - 0表示全量同步
     * @returns 书籍列表数组 - 包含所有微信读书书籍
     * @throws 当未登录时抛出错误 - 提示用户需要登录微信读书
     *
     * 功能：
     * 1. 检查登录状态 - 确保用户已登录微信读书
     * 2. 构建API请求URL - 包含用户ID和同步键
     * 3. 发送API请求 - 获取微信读书书架数据
     * 4. 解析返回数据 - 将API数据转换为Book对象
     *
     * API调用流程：
     * 1. 构建请求URL：https://i.weread.qq.com/shelf/sync
     * 2. 添加查询参数：userVid（用户ID）、synckey（同步键）、lecture（讲座标志）
     * 3. 发送HTTPS请求，携带Cookie中的Token和用户ID
     * 4. 接收API返回的JSON数据
     * 5. 解析数据，转换为Book对象数组
     *
     * 增量同步原理：
     * - synckey为0时，返回所有书籍
     * - synckey不为0时，只返回 synckey 之后更新的书籍
     * - API返回新的synckey，用于下次同步
     */
    async getBooks(synckey: number = 0): Promise<Book[]> {
        // 检查登录状态 - 确保用户已登录微信读书
        if (!this.token || !this.userId) {
            throw new Error('微信读书未登录');
        }

        // 构建API请求URL - 包含用户ID和同步键
        // userVid: 用户ID
        // synckey: 同步键，用于增量同步
        // lecture: 讲座标志，-1表示不包含讲座
        const url = `https://i.weread.qq.com/shelf/sync?userVid=${this.userId}&synckey=${synckey}&lecture=-1`;

        // 发送API请求 - 获取微信读书书架数据
        const books = await this.request(url);

        // 解析返回数据 - 将API数据转换为Book对象
        return this.parseBooks(books);
    }

    /**
     * 获取微信读书书籍内容
     * @param bookId 书籍ID
     * @returns 书籍内容字符串
     * @throws 当未登录时抛出错误
     */
    async getBookContent(bookId: string): Promise<string> {
        if (!this.token || !this.userId) {
            throw new Error('微信读书未登录');
        }

        const url = `https://i.weread.qq.com/book/read?bookId=${bookId}`;
        return await this.request(url);
    }

    /**
     * 发送网络请求
     * @param url 请求URL - 微信读书API的地址
     * @returns 请求响应数据 - API返回的JSON数据
     * @throws 当网络错误或响应解析失败时抛出错误 - 包含详细的错误信息
     *
     * 功能：
     * 1. 构建请求选项 - 设置请求头，包含认证信息
     * 2. 发送HTTPS请求 - 使用Node.js的https模块
     * 3. 接收响应数据 - 处理数据 chunks
     * 4. 解析响应数据 - 将JSON字符串转换为JavaScript对象
     * 5. 处理错误情况 - 网络错误、API错误、解析错误
     *
     * 请求头说明：
     * - Cookie: 包含token和userVid，用于身份认证
     * - User-Agent: 模拟浏览器请求，避免被API拒绝
     * - Referer: 模拟从微信读书网站发起的请求
     * - Accept: 指定接受的响应格式为JSON
     *
     * 错误处理：
     * 1. 网络错误：如DNS解析失败、连接超时等
     * 2. API错误：API返回错误码和错误信息
     * 3. 解析错误：API返回的不是有效的JSON数据
     *
     * Promise使用说明：
     * - resolve: 请求成功时，返回解析后的数据
     * - reject: 请求失败时，抛出错误
     */
    private async request(url: string): Promise<any> {
        // 返回Promise，处理异步操作
        return new Promise((resolve, reject) => {
            // 构建请求选项 - 设置请求头，包含认证信息
            const options = {
                headers: {
                    // Cookie: 包含token和userVid，用于身份认证
                    'Cookie': `token=${this.token}; userVid=${this.userId};`,
                    // User-Agent: 模拟浏览器请求，避免被API拒绝
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    // Referer: 模拟从微信读书网站发起的请求
                    'Referer': 'https://weread.qq.com/',
                    // Accept: 指定接受的响应格式为JSON
                    'Accept': 'application/json, text/plain, */*'
                }
            };

            // 发送HTTPS请求 - 使用Node.js的https模块
            https.get(url, options, (res) => {
                let data = '';

                // 接收响应数据 - 处理数据 chunks
                res.on('data', (chunk) => {
                    data += chunk;
                });

                // 响应结束时处理数据
                res.on('end', () => {
                    try {
                        // 解析响应数据 - 将JSON字符串转换为JavaScript对象
                        const parsedData = JSON.parse(data);

                        // 检查API返回的错误码
                        if (parsedData.code) {
                            // API返回错误，抛出错误信息
                            reject(new Error(`API Error: ${parsedData.msg || 'Unknown error'}`));
                        } else {
                            // API返回成功，解析数据并返回
                            resolve(parsedData);
                        }
                    } catch (error) {
                        // 解析错误，抛出错误信息
                        reject(new Error(`Failed to parse response: ${data.substring(0, 100)}...`));
                    }
                });
            }).on('error', (error) => {
                // 网络错误，抛出错误信息
                reject(new Error(`Network error: ${error.message}`));
            });
        });
    }

    /**
     * 解析微信读书API返回的书籍数据
     * @param data API返回的数据 - 包含书籍列表和同步键
     * @returns 解析后的书籍列表 - 转换为Book对象的数组
     *
     * 功能：
     * 1. 初始化书籍数组 - 准备存储解析后的书籍
     * 2. 检查数据有效性 - 确保数据包含书籍列表
     * 3. 遍历书籍数据 - 处理每一本书籍
     * 4. 转换数据格式 - 将API数据转换为Book对象
     * 5. 添加到书籍数组 - 收集所有解析后的书籍
     *
     * 数据转换说明：
     * - id: 构建唯一标识，格式为"wechat_bookId"
     * - name: 使用API返回的title，默认为"未知书名"
     * - path: 构建特殊格式的路径，格式为"wechat://bookId"
     * - progress: 计算阅读进度，已完成则为100，否则使用readPercentage
     * - fileSize: 微信读书书籍没有本地文件，设为0
     * - addedTime: 设置为当前时间戳
     * - type: 设置为"wechat"，标识为微信读书书籍
     * - bookId: 使用API返回的bookId
     * - cover: 使用API返回的cover（封面URL）
     * - author: 使用API返回的author（作者）
     * - synckey: 使用API返回的synckey（同步键）
     *
     * 数据结构示例：
     * API返回的数据结构：
     * {
     *   "books": [
     *     {
     *       "bookId": "123456",
     *       "title": "示例书名",
     *       "author": "示例作者",
     *       "cover": "https://example.com/cover.jpg",
     *       "finish": false,
     *       "readInfo": {
     *         "readPercentage": 25
     *       }
     *     }
     *   ],
     *   "synckey": 1234567890
     * }
     *
     * 转换后的Book对象：
     * {
     *   "id": "wechat_123456",
     *   "name": "示例书名",
     *   "path": "wechat://123456",
     *   "progress": 25,
     *   "fileSize": 0,
     *   "addedTime": 1620000000000,
     *   "type": "wechat",
     *   "bookId": "123456",
     *   "cover": "https://example.com/cover.jpg",
     *   "author": "示例作者",
     *   "synckey": 1234567890
     * }
     */
    private parseBooks(data: any): Book[] {
        // 初始化书籍数组 - 准备存储解析后的书籍
        const books: Book[] = [];

        // 检查数据有效性 - 确保数据包含书籍列表
        if (data && data.books) {
            // 遍历书籍数据 - 处理每一本书籍
            data.books.forEach((item: any) => {
                // 转换数据格式 - 将API数据转换为Book对象
                const book: Book = {
                    // 构建唯一标识，格式为"wechat_bookId"
                    id: `wechat_${item.bookId}`,
                    // 使用API返回的title，默认为"未知书名"
                    name: item.title || '未知书名',
                    // 构建特殊格式的路径，格式为"wechat://bookId"
                    path: `wechat://${item.bookId}`,
                    // 计算阅读进度，已完成则为100，否则使用readPercentage
                    progress: item.finish ? 100 : (item.readInfo ? (item.readInfo.readPercentage || 0) : 0),
                    // 微信读书书籍没有本地文件，设为0
                    fileSize: 0,
                    // 设置为当前时间戳
                    addedTime: Date.now(),
                    // 设置为"wechat"，标识为微信读书书籍
                    type: 'wechat',
                    // 使用API返回的bookId
                    bookId: item.bookId,
                    // 使用API返回的cover（封面URL）
                    cover: item.cover,
                    // 使用API返回的author（作者）
                    author: item.author,
                    // 使用API返回的synckey（同步键）
                    synckey: data.synckey || 0
                };
                // 添加到书籍数组 - 收集所有解析后的书籍
                books.push(book);
            });
        }

        // 返回解析后的书籍列表
        return books;
    }

    /**
     * 验证微信读书Token的有效性
     * @returns Token是否有效
     */
    validateToken(): Promise<boolean> {
        if (!this.token || !this.userId) {
            return Promise.resolve(false);
        }

        return this.getBooks(0)
            .then(() => true)
            .catch(() => false);
    }
}