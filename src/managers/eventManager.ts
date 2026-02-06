/**
 * managers/eventManager.ts
 * 事件管理器类
 *
 * 功能说明：
 * 1. 提供事件监听器的注册功能 - 注册单个事件监听器
 * 2. 提供一次性事件监听器的注册功能 - 注册只执行一次的事件监听器
 * 3. 提供批量注册事件监听器的功能 - 一次注册多个事件监听器
 * 4. 提供事件监听器的清理功能 - 清理所有已注册的事件监听器
 *
 * 核心概念：
 * - 事件监听器：监听特定事件并在事件触发时执行的函数
 * - Disposable：VS Code中用于清理资源的接口，包含dispose方法
 * - 事件管理：集中管理所有事件监听器，方便统一清理
 * - 内存泄漏：如果不清理事件监听器，可能导致内存泄漏
 *
 * 使用场景：
 * - 插件激活时：注册各种事件监听器
 * - 插件失活时：清理所有事件监听器，防止内存泄漏
 * - 组件生命周期管理：在组件创建时注册监听器，销毁时清理监听器
 *
 * 技术原理：
 * - 监听器存储：使用数组存储所有已注册的Disposable对象
 * - 注册方法：提供不同的注册方法，适应不同的使用场景
 * - 清理方法：遍历数组，调用每个Disposable对象的dispose方法
 * - 内存管理：清理后清空数组，释放内存
 *
 * VS Code事件系统：
 * - VS Code使用事件发射器(EventEmitter)模式
 * - 事件监听器通过调用事件对象来注册，返回Disposable对象
 * - 调用Disposable.dispose()来取消监听
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