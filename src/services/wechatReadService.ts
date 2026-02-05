/**
 * services/wechatReadService.ts
 * 微信读书服务类
 * 
 * 功能说明：
 * 1. 提供微信读书API的访问功能
 * 2. 处理微信读书书籍的同步和解析
 * 3. 验证微信读书Token的有效性
 * 4. 封装网络请求和错误处理
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
     * @param synckey 同步键，用于增量同步
     * @returns 书籍列表数组
     * @throws 当未登录时抛出错误
     */
    async getBooks(synckey: number = 0): Promise<Book[]> {
        if (!this.token || !this.userId) {
            throw new Error('微信读书未登录');
        }

        const url = `https://i.weread.qq.com/shelf/sync?userVid=${this.userId}&synckey=${synckey}&lecture=-1`;

        const books = await this.request(url);
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
     * @param url 请求URL
     * @returns 请求响应数据
     * @throws 当网络错误或响应解析失败时抛出错误
     */
    private async request(url: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const options = {
                headers: {
                    'Cookie': `token=${this.token}; userVid=${this.userId};`,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Referer': 'https://weread.qq.com/',
                    'Accept': 'application/json, text/plain, */*'
                }
            };

            https.get(url, options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const parsedData = JSON.parse(data);
                        if (parsedData.code) {
                            reject(new Error(`API Error: ${parsedData.msg || 'Unknown error'}`));
                        } else {
                            resolve(parsedData);
                        }
                    } catch (error) {
                        reject(new Error(`Failed to parse response: ${data.substring(0, 100)}...`));
                    }
                });
            }).on('error', (error) => {
                reject(new Error(`Network error: ${error.message}`));
            });
        });
    }

    /**
     * 解析微信读书API返回的书籍数据
     * @param data API返回的数据
     * @returns 解析后的书籍列表
     */
    private parseBooks(data: any): Book[] {
        const books: Book[] = [];

        if (data && data.books) {
            data.books.forEach((item: any) => {
                const book: Book = {
                    id: `wechat_${item.bookId}`,
                    name: item.title || '未知书名',
                    path: `wechat://${item.bookId}`,
                    progress: item.finish ? 100 : (item.readInfo ? (item.readInfo.readPercentage || 0) : 0),
                    fileSize: 0,
                    addedTime: Date.now(),
                    type: 'wechat',
                    bookId: item.bookId,
                    cover: item.cover,
                    author: item.author,
                    synckey: data.synckey || 0
                };
                books.push(book);
            });
        }

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