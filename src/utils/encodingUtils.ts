/**
 * utils/encodingUtils.ts
 * 编码处理工具类
 * 
 * 功能说明：
 * 1. 提供文件编码检测功能
 * 2. 提供以指定编码读取文件内容的功能
 * 3. 处理编码解码失败的情况，提供回退机制
 */
import * as fs from 'fs';

/**
 * 编码处理工具类
 * 
 * 功能：
 * 1. 检测文件编码格式
 * 2. 以指定编码读取文件内容
 * 3. 处理编码解码异常
 */
export class EncodingUtils {
    /**
     * 检测文件编码（简化版）
     * 
     * 功能：
     * 通过读取文件的前几个字节（BOM标记）来判断文件编码
     * 
     * @param filePath 文件路径
     * @returns 检测到的编码格式字符串
     */
    static detectEncoding(filePath: string): string {
        try {
            // 读取文件前几个字节来判断编码
            const buffer = Buffer.alloc(4);
            const fd = fs.openSync(filePath, 'r');
            fs.readSync(fd, buffer, 0, 4, 0);
            fs.closeSync(fd);

            // 检查UTF-8 BOM
            if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
                return 'utf8';
            }

            // 检查UTF-16 LE BOM
            if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
                return 'utf16le';
            }

            // 检查UTF-16 BE BOM
            if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
                return 'utf16be';
            }

            // 默认尝试UTF-8，失败则使用本地编码
            return 'utf8';
        } catch (error) {
            console.error('Failed to detect encoding:', error);
            return 'utf8';
        }
    }

    /**
     * 以指定编码读取文件内容
     * 
     * 功能：
     * 读取文件的指定范围内容，并以指定编码解码
     * 如果解码失败，尝试其他常见编码
     * 
     * @param filePath 文件路径
     * @param start 起始位置
     * @param end 结束位置
     * @param encoding 编码格式，默认为utf8
     * @returns 解码后的文件内容字符串
     * @throws 当文件读取失败时抛出错误
     */
    static readFileWithEncoding(filePath: string, start: number, end: number, encoding: string = 'utf8'): string {
        try {
            const buffer = Buffer.alloc(end - start);
            const fd = fs.openSync(filePath, 'r');
            fs.readSync(fd, buffer, 0, end - start, start);
            fs.closeSync(fd);

            // 尝试解码，如果失败则回退到二进制
            try {
                return buffer.toString(encoding as BufferEncoding);
            } catch (decodeError) {
                console.warn(`Failed to decode with ${encoding}, falling back to binary`);
                // 尝试常见编码
                const encodings = ['utf8', 'latin1'];
                for (const enc of encodings) {
                    try {
                        return buffer.toString(enc as BufferEncoding);
                    } catch (e) {
                        // 继续尝试下一个编码
                    }
                }
                // 如果所有编码都失败，返回原始二进制数据的可读表示
                return buffer.toString('hex');
            }
        } catch (error) {
            console.error('Failed to read file:', error);
            throw error;
        }
    }
}