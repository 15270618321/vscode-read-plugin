// utils/fileUtils.ts
import * as fs from 'fs';
import * as path from 'path';

export class FileUtils {
    /**
     * 确保目录存在
     */
    static ensureDirectory(dirPath: string): void {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }

    /**
     * 安全读取JSON文件
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