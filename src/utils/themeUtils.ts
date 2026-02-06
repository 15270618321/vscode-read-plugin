/**
 * utils/themeUtils.ts
 * 主题处理工具类
 *
 * 功能说明：
 * 1. 提供主题判断功能 - 判断当前是否为暗色主题
 * 2. 提供主题颜色获取功能 - 获取当前主题的颜色变量
 * 3. 提供主题变化监听功能 - 监听主题变化，触发回调函数
 *
 * 核心概念：
 * - VS Code主题：VS Code的颜色主题，如亮色主题、暗色主题
 * - 主题类型：VS Code中主题的类型，使用ColorThemeKind枚举表示
 * - 主题颜色：不同主题下的颜色值，如背景色、文本色等
 * - 主题变化事件：当用户切换主题时触发的事件
 *
 * 使用场景：
 * - WebView主题适配：根据VS Code主题调整WebView的颜色
 * - UI元素主题适配：根据VS Code主题调整插件UI元素的颜色
 * - 动态主题切换：当用户切换主题时，自动更新插件的外观
 *
 * 技术原理：
 * - 主题判断：使用vscode.window.activeColorTheme.kind判断当前主题类型
 * - 颜色获取：根据主题类型返回对应的颜色变量
 * - 事件监听：使用vscode.window.onDidChangeActiveColorTheme监听主题变化
 *
 * 主题类型：
 * - ColorThemeKind.Light：亮色主题
 * - ColorThemeKind.Dark：暗色主题
 * - ColorThemeKind.HighContrast：高对比度主题
 * - ColorThemeKind.HighContrastLight：高对比度亮色主题
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