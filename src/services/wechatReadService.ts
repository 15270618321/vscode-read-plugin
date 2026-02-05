// services/wechatReadService.ts
import * as https from 'https';
import { Book, PluginSettings } from '../types';

export class WechatReadService {
    private token: string;
    private userId: string;

    constructor(settings: PluginSettings) {
        this.token = settings.wechatReadToken || '';
        this.userId = settings.wechatReadUserId || '';
    }

    async getBooks(synckey: number = 0): Promise<Book[]> {
        if (!this.token || !this.userId) {
            throw new Error('微信读书未登录');
        }

        const url = `https://i.weread.qq.com/shelf/sync?userVid=${this.userId}&synckey=${synckey}&lecture=-1`;

        const books = await this.request(url);
        return this.parseBooks(books);
    }

    async getBookContent(bookId: string): Promise<string> {
        if (!this.token || !this.userId) {
            throw new Error('微信读书未登录');
        }

        const url = `https://i.weread.qq.com/book/read?bookId=${bookId}`;
        return await this.request(url);
    }

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

    validateToken(): Promise<boolean> {
        if (!this.token || !this.userId) {
            return Promise.resolve(false);
        }

        return this.getBooks(0)
            .then(() => true)
            .catch(() => false);
    }
}