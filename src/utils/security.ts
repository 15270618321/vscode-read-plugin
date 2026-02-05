/**
 * utils/security.ts
 * 安全处理工具类
 * 
 * 功能说明：
 * 1. 提供HTML转义功能，防止XSS攻击
 * 2. 提供路径清理功能，防止目录遍历攻击
 * 3. 提供文件扩展名验证功能
 */
import * as path from 'path';

/**
 * 安全处理工具类
 * 
 * 功能：
 * 1. 转义HTML特殊字符，防止XSS攻击
 * 2. 清理路径，防止目录遍历攻击
 * 3. 验证文件扩展名
 */
export class SecurityUtils {
    /**
     * 转义HTML特殊字符，防止XSS攻击
     * 
     * 功能：
     * 将HTML特殊字符转换为对应的HTML实体，防止XSS攻击
     * 
     * @param text 要转义的文本
     * @returns 转义后的文本
     */
    static escapeHtml(text: string): string {
        if (!text) {
            return '';
        }

        const map: {[key: string]: string} = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;',
            '`': '&#x60;',
            '=': '&#x3D;',
            '/': '&#x2F;'
        };

        return text.replace(/[&<>"'`=\/]/g, (m) => map[m] || m);
    }

    /**
     * 清理路径，防止目录遍历攻击
     * 
     * 功能：
     * 规范化和解析路径，检查是否为安全路径，防止目录遍历攻击
     * 
     * @param filePath 要清理的文件路径
     * @returns 清理后的安全路径
     * @throws 当路径为系统目录时抛出错误
     */
    static sanitizePath(filePath: string): string {
        // 移除可能的目录遍历攻击
        const normalized = path.normalize(filePath);
        const resolved = path.resolve(normalized);

        // 检查是否为安全路径（非系统目录）
        const forbiddenPatterns = [
            /\/etc\//i,
            /\/bin\//i,
            /\/sbin\//i,
            /\/usr\/bin\//i,
            /\/usr\/sbin\//i,
            /\/root\//i,
            /\/boot\//i,
            /\/proc\//i,
            /\/sys\//i,
            /\/dev\//i
        ];

        for (const pattern of forbiddenPatterns) {
            if (pattern.test(resolved)) {
                throw new Error('Access to system directory is not allowed');
            }
        }

        return resolved;
    }

    /**
     * 验证文件扩展名
     * 
     * 功能：
     * 检查文件扩展名是否在允许的列表中
     * 
     * @param filePath 文件路径
     * @param allowedExtensions 允许的扩展名列表
     * @returns 文件扩展名是否在允许的列表中
     */
    static validateFileExtension(filePath: string, allowedExtensions: string[]): boolean {
        const ext = path.extname(filePath).toLowerCase();
        return allowedExtensions.includes(ext);
    }
}