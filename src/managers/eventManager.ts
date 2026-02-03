// managers/eventManager.ts
import * as vscode from 'vscode';

export class EventManager {
    private listeners: vscode.Disposable[] = [];

    /**
     * 添加事件监听器
     */
    register(listener: vscode.Disposable): void {
        this.listeners.push(listener);
    }

    /**
     * 注册一次性事件监听器
     */
    registerOnce(event: vscode.Event<any>, callback: () => void): void {
        const listener = event(callback);
        this.listeners.push(listener);
    }

    /**
     * 清理所有事件监听器
     */
    dispose(): void {
        this.listeners.forEach(listener => listener.dispose());
        this.listeners = [];
    }

    /**
     * 批量注册监听器
     */
    registerAll(listeners: vscode.Disposable[]): void {
        this.listeners.push(...listeners);
    }
}