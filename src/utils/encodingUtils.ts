// utils/encodingUtils.ts
import * as fs from 'fs';

export class EncodingUtils {
    /**
     * 检测文件编码（简化版）
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