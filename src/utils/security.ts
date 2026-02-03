// utils/security.ts
export class SecurityUtils {
    /**
     * 转义HTML特殊字符，防止XSS攻击
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
     */
    static validateFileExtension(filePath: string, allowedExtensions: string[]): boolean {
        const ext = path.extname(filePath).toLowerCase();
        return allowedExtensions.includes(ext);
    }
}

import * as path from 'path';