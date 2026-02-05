/**
 * utils/themeUtils.ts
 * 主题处理工具类
 * 
 * 功能说明：
 * 1. 提供主题判断功能
 * 2. 提供主题颜色获取功能
 * 3. 提供主题变化监听功能
 */
import * as vscode from 'vscode';

/**
 * 主题处理工具类
 * 
 * 功能：
 * 1. 判断当前是否为暗色主题
 * 2. 获取当前主题的CSS变量
 * 3. 监听主题变化
 */
export class ThemeUtils {
    /**
     * 判断当前是否为暗色主题
     * 
     * 功能：
     * 检查VS Code当前激活的主题是否为暗色主题
     * 
     * @returns 是否为暗色主题
     */
    static isDarkTheme(): boolean {
        return vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;
    }

    /**
     * 获取当前主题的CSS变量
     * 
     * 功能：
     * 根据当前主题（亮色/暗色）返回对应的颜色变量
     * 
     * @returns 包含主题颜色的对象
     */
    static getThemeColors(): {
        /** 背景颜色 */
        backgroundColor: string;
        /** 文本颜色 */
        textColor: string;
        /** 边框颜色 */
        borderColor: string;
        /** 静音颜色（用于次要文本） */
        mutedColor: string;
    } {
        const isDark = this.isDarkTheme();

        if (isDark) {
            return {
                backgroundColor: '#1e1e1e',
                textColor: '#d4d4d4',
                borderColor: '#333',
                mutedColor: '#999'
            };
        } else {
            return {
                backgroundColor: '#f5f5f5',
                textColor: '#333',
                borderColor: '#f0f0f0',
                mutedColor: '#666'
            };
        }
    }

    /**
     * 监听主题变化
     * 
     * 功能：
     * 注册一个回调函数，当VS Code主题变化时触发
     * 
     * @param callback 主题变化时的回调函数
     * @returns 可用于取消监听的Disposable对象
     */
    static onThemeChange(callback: () => void): vscode.Disposable {
        return vscode.window.onDidChangeActiveColorTheme(callback);
    }
}