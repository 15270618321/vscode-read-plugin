/**
 * utils/fileUtils.ts
 * 文件处理工具类
 * 
 * 功能说明：
 * 1. 提供目录管理功能
 * 2. 提供JSON文件的安全读写功能
 * 3. 提供文件大小获取功能
 * 4. 提供文件部分内容读取功能
 */
import * as fs from 'fs';
import * as path from 'path';

/**
 * 文件处理工具类
 * 
 * 功能：
 * 1. 确保目录存在
 * 2. 安全读取JSON文件
 * 3. 安全写入JSON文件
 * 4. 获取文件大小
 * 5. 读取文件部分内容
 */
export class FileUtils {
    /**
     * 确保目录存在
     * 
     * 功能：
     * 检查指定目录是否存在，如果不存在则创建
     * 
     * @param dirPath 目录路径
     */
    static ensureDirectory(dirPath: string): void {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }

    /**
     * 安全读取JSON文件
     * 
     * 功能：
     * 读取JSON文件内容，如果文件不存在或读取失败则返回默认值
     * 
     * @param filePath 文件路径
     * @param defaultValue 默认值
     * @returns 读取的JSON数据或默认值
     */
    static readJsonFile<T>(filePath: string, defaultValue: T): T {
        try {
            if (!fs.existsSync(filePath)) {
                return defaultValue;
            }

            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error(`Failed to read JSON file ${filePath}:`, error);
            return defaultValue;
        }
    }

    /**
     * 安全写入JSON文件
     * 
     * 功能：
     * 将数据写入JSON文件，自动创建目录
     * 
     * @param filePath 文件路径
     * @param data 要写入的数据
     * @throws 当写入失败时抛出错误
     */
    static writeJsonFile(filePath: string, data: any): void {
        try {
            const dirPath = path.dirname(filePath);
            this.ensureDirectory(dirPath);

            const jsonData = JSON.stringify(data, null, 2);
            fs.writeFileSync(filePath, jsonData, 'utf8');
        } catch (error) {
            console.error(`Failed to write JSON file ${filePath}:`, error);
            throw error;
        }
    }

    /**
     * 获取文件大小
     * 
     * 功能：
     * 获取指定文件的大小（字节）
     * 
     * @param filePath 文件路径
     * @returns 文件大小（字节）
     */
    static getFileSize(filePath: string): number {
        try {
            const stats = fs.statSync(filePath);
            return stats.size;
        } catch (error) {
            console.error('Failed to get file size:', error);
            return 0;
        }
    }

    /**
     * 读取文件的部分内容
     * 
     * 功能：
     * 读取文件的指定范围内容，返回Buffer
     * 
     * @param filePath 文件路径
     * @param start 起始位置
     * @param end 结束位置
     * @returns 读取的文件内容Buffer
     * @throws 当读取失败时抛出错误
     */
    static readFilePart(filePath: string, start: number, end: number): Buffer {
        try {
            const buffer = Buffer.alloc(end - start);
            const fd = fs.openSync(filePath, 'r');
            fs.readSync(fd, buffer, 0, end - start, start);
            fs.closeSync(fd);
            return buffer;
        } catch (error) {
            console.error('Failed to read file part:', error);
            throw error;
        }
    }
}