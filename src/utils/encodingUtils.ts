/**
 * utils/encodingUtils.ts
 * 编码处理工具类
 *
 * 功能说明：
 * 1. 提供文件编码检测功能 - 自动识别文件的编码格式
 * 2. 提供以指定编码读取文件内容的功能 - 支持多种编码格式
 * 3. 处理编码解码失败的情况，提供回退机制 - 当指定编码解码失败时，尝试其他编码
 *
 * 核心概念：
 * - 文件编码：文件中字符的存储格式，如UTF-8、GBK、Latin1等
 * - BOM (Byte Order Mark)：文件开头的特殊字节序列，用于标识文件编码
 * - 编码检测：通过读取文件开头的字节来判断文件编码
 * - 解码：将字节序列转换为字符串的过程
 *
 * 使用场景：
 * - 文本文件读取：需要以正确的编码读取文本文件，避免乱码
 * - 编码转换：将不同编码的文件转换为统一编码
 * - 大文件处理：读取大文件的部分内容，避免内存溢出
 *
 * 技术原理：
 * - BOM检测：通过文件开头的字节序列识别编码
 * - 字节读取：使用Node.js的文件系统API读取文件字节
 * - 编码尝试：当指定编码失败时，尝试常见编码
 * - 错误处理：捕获解码错误，提供回退方案
 */
import * as fs from 'fs';
import * as iconv from 'iconv-lite';

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
     * 检测文件编码（增强版）
     *
     * 功能：
     * 通过读取文件的前几个字节（BOM标记）和统计字节分布来判断文件编码
     * 特别增强了对中文编码（GBK/GB2312）的检测
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

            // 尝试检测中文编码（GBK/GB2312/GB18030）
            // 读取更多样本来进行更准确的分析
            const sampleBuffer = Buffer.alloc(2048);
            const sampleFd = fs.openSync(filePath, 'r');
            const bytesRead = fs.readSync(sampleFd, sampleBuffer, 0, 2048, 0);
            fs.closeSync(sampleFd);

            if (bytesRead > 0) {
                // 统计分析
                let highByteCount = 0; // >= 0x80的字节数
                let possibleChinesePairs = 0; // 可能的中文双字节对
                let totalBytes = bytesRead;

                for (let i = 0; i < bytesRead; i++) {
                    const byte = sampleBuffer[i];
                    if (byte >= 0x80) {
                        highByteCount++;
                        // 检查是否可能是中文编码的双字节序列
                        if (i + 1 < bytesRead) {
                            const nextByte = sampleBuffer[i + 1];
                            // GBK/GB2312的特点：高字节在0x81-0xFE之间，低字节在0x40-0xFE之间
                            if ((byte >= 0x81 && byte <= 0xFE) && (nextByte >= 0x40 && nextByte <= 0xFE)) {
                                possibleChinesePairs++;
                                i++; // 跳过下一个字节
                            }
                        }
                    }
                }

                // 计算统计指标
                const highByteRatio = highByteCount / totalBytes;
                const chinesePairRatio = possibleChinesePairs / Math.max(1, Math.floor(totalBytes / 2));

                // 更准确的中文编码检测
                // 降低阈值，提高对中文编码的识别率
                if (highByteRatio > 0.15 && chinesePairRatio > 0.08) {
                    return 'gbk'; // GBK兼容GB2312和GB18030
                }

                // 特殊处理：如果有较多高字节，即使双字节对比例不高，也尝试中文编码
                if (highByteRatio > 0.25) {
                    return 'gbk';
                }

                // 尝试直接用不同编码解码并评估结果
                const encodingsToTry = ['utf8', 'gbk', 'gb18030'];
                let bestEncoding = 'utf8';
                let bestScore = 0;

                encodingsToTry.forEach(enc => {
                    try {
                        const content = sampleBuffer.toString(enc as BufferEncoding);
                        const score = this.evaluateDecodingQuality(content);
                        if (score > bestScore) {
                            bestScore = score;
                            bestEncoding = enc;
                        }
                    } catch (e) {
                        // 解码失败，跳过
                    }
                });

                if (bestEncoding !== 'utf8' && bestScore > 0.3) {
                    return bestEncoding;
                }
            }

            // 默认尝试UTF-8
            return 'utf8';
        } catch (error) {
            console.error('Failed to detect encoding:', error);
            return 'utf8';
        }
    }

    /**
     * 评估解码质量
     *
     * 功能：
     * 通过分析解码后的字符串来评估编码的正确性
     *
     * @param content 解码后的内容
     * @returns 质量评分（0-1），越高越好
     */
    private static evaluateDecodingQuality(content: string): number {
        if (!content || content.length === 0) {
            return 0;
        }

        let score = 0;
        let validChars = 0;
        let controlChars = 0;
        let chineseChars = 0;

        for (let i = 0; i < content.length; i++) {
            const char = content[i];
            const code = char.charCodeAt(0);

            if (code === 0) {
                // 空字符，可能是编码错误
                continue;
            } else if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
                // 控制字符，可能是编码错误
                controlChars++;
            } else if (code >= 0x4E00 && code <= 0x9FFF) {
                // 中文字符，加分
                chineseChars++;
                validChars++;
            } else if ((code >= 32 && code <= 126) || (code >= 128 && code <= 255)) {
                // 可打印字符
                validChars++;
            }
        }

        // 计算评分
        const totalChars = content.length;
        const validRatio = validChars / totalChars;
        const chineseRatio = chineseChars / totalChars;
        const controlRatio = controlChars / totalChars;

        // 基本分数：有效字符比例
        score = validRatio;

        // 中文字符加分
        score += chineseRatio * 0.5;

        // 控制字符减分
        score -= controlRatio * 0.8;

        // 确保分数在0-1之间
        return Math.max(0, Math.min(1, score));
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

            // 尝试解码，如果失败则回退到其他编码
            try {
                // 使用iconv-lite进行解码，提供更好的编码支持
                let content: string;
                if (iconv.encodingExists(encoding)) {
                    content = iconv.decode(buffer, encoding);
                } else {
                    content = buffer.toString(encoding as BufferEncoding);
                }

                // 评估解码质量，如果质量太低则尝试其他编码
                const quality = this.evaluateDecodingQuality(content);
                if (quality > 0.5) {
                    return content;
                } else {
                    console.warn(`Low decoding quality with ${encoding} (${quality}), trying other encodings`);
                    return this.tryOtherEncodings(buffer, encoding);
                }
            } catch (decodeError) {
                console.warn(`Failed to decode with ${encoding}, trying other encodings`);
                return this.tryOtherEncodings(buffer, encoding);
            }
        } catch (error) {
            console.error('Failed to read file:', error);
            throw error;
        }
    }

    /**
     * 尝试其他编码解码
     *
     * 功能：
     * 当指定编码解码失败或质量较低时，尝试其他常见编码
     *
     * @param buffer 文件内容缓冲区
     * @param originalEncoding 原始尝试的编码
     * @returns 解码后的内容字符串
     */
    private static tryOtherEncodings(buffer: Buffer, originalEncoding: string): string {
        // 优先尝试中文编码，因为用户反馈GB2312文件有问题
        const encodings = [
            'gb2312', 'gbk', 'gb18030', // 优先尝试中文编码，特别是GB2312
            'utf8', 'utf16le', 'utf16be', 'latin1',
            'ascii', 'utf8mb4'
        ];

        let bestContent = buffer.toString('hex');
        let bestScore = 0;
        let bestEncoding = 'hex';

        encodings.forEach(enc => {
            if (enc === originalEncoding) return; // 跳过已经尝试过的编码

            try {
                let content: string;
                // 使用iconv-lite进行解码，提供更好的编码支持
                if (iconv.encodingExists(enc)) {
                    content = iconv.decode(buffer, enc);
                } else {
                    content = buffer.toString(enc as BufferEncoding);
                }

                const score = this.evaluateDecodingQuality(content);

                if (score > bestScore) {
                    bestScore = score;
                    bestContent = content;
                    bestEncoding = enc;
                }
            } catch (e) {
                // 解码失败，跳过
            }
        });

        if (bestEncoding !== 'hex') {
            console.log(`Successfully decoded with ${bestEncoding} (quality: ${bestScore})`);
        }

        return bestContent;
    }
}