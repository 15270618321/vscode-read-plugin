/**
 * utils/security.ts
 * 安全处理工具类
 * 
 * 功能说明：
 * 1. 提供HTML转义功能，防止XSS攻击 - 将HTML特殊字符转换为HTML实体
 * 2. 提供路径清理功能，防止目录遍历攻击 - 规范化路径，防止访问系统目录
 * 3. 提供文件扩展名验证功能 - 确保只处理允许的文件类型
 * 
 * 核心概念：
 * - XSS攻击 (Cross-Site Scripting)：攻击者在网页中注入恶意脚本，当用户浏览网页时执行
 * - 目录遍历攻击：攻击者通过操纵文件路径，访问系统中受保护的目录
 * - 输入验证：验证用户输入是否符合预期格式和范围
 * - 安全编码：将特殊字符转换为安全的表示形式
 * 
 * 使用场景：
 * - WebView内容生成：在生成HTML内容时，转义用户输入，防止XSS攻击
 * - 文件路径处理：处理用户提供的文件路径，防止目录遍历攻击
 * - 文件上传验证：验证上传文件的扩展名，确保只接受安全的文件类型
 * 
 * 技术原理：
 * - HTML转义：使用正则表达式匹配HTML特殊字符，替换为对应的HTML实体
 * - 路径清理：使用path.normalize和path.resolve规范化路径，检查路径是否在允许的范围内
 * - 扩展名验证：使用path.extname获取文件扩展名，检查是否在允许的列表中
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