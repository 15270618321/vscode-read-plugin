/**
 * managers/eventManager.ts
 * 事件管理器类
 * 
 * 功能说明：
 * 1. 提供事件监听器的注册功能
 * 2. 提供一次性事件监听器的注册功能
 * 3. 提供批量注册事件监听器的功能
 * 4. 提供事件监听器的清理功能
 */
import * as vscode from 'vscode';

/**
 * 事件管理器类
 * 
 * 功能：
 * 1. 管理事件监听器的生命周期
 * 2. 提供便捷的事件监听器注册方法
 * 3. 统一清理所有事件监听器
 */
export class EventManager {
    /** 事件监听器列表 */
    private listeners: vscode.Disposable[] = [];

    /**
     * 添加事件监听器
     * 
     * 功能：
     * 将事件监听器添加到管理列表中，以便后续统一清理
     * 
     * @param listener 事件监听器（Disposable对象）
     */
    register(listener: vscode.Disposable): void {
        this.listeners.push(listener);
    }

    /**
     * 注册一次性事件监听器
     * 
     * 功能：
     * 注册一个事件监听器，并将其添加到管理列表中
     * 
     * @param event VS Code事件对象
     * @param callback 事件回调函数
     */
    registerOnce(event: vscode.Event<any>, callback: () => void): void {
        const listener = event(callback);
        this.listeners.push(listener);
    }

    /**
     * 清理所有事件监听器
     * 
     * 功能：
     * 调用所有已注册监听器的dispose方法，然后清空监听器列表
     */
    dispose(): void {
        this.listeners.forEach(listener => listener.dispose());
        this.listeners = [];
    }

    /**
     * 批量注册监听器
     * 
     * 功能：
     * 一次性注册多个事件监听器
     * 
     * @param listeners 事件监听器数组
     */
    registerAll(listeners: vscode.Disposable[]): void {
        this.listeners.push(...listeners);
    }
}