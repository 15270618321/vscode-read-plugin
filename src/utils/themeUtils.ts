// utils/themeUtils.ts
import * as vscode from 'vscode';

export class ThemeUtils {
    /**
     * 判断当前是否为暗色主题
     */
    static isDarkTheme(): boolean {
        return vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;
    }

    /**
     * 获取当前主题的CSS变量
     */
    static getThemeColors(): {
        backgroundColor: string;
        textColor: string;
        borderColor: string;
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
     */
    static onThemeChange(callback: () => void): vscode.Disposable {
        return vscode.window.onDidChangeActiveColorTheme(callback);
    }
}