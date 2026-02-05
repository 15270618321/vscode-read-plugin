/**
 * types/index.ts
 * 类型定义文件
 *
 * 功能说明：
 * 1. 定义书籍相关接口
 * 2. 定义插件设置接口
 * 3. 定义WebView消息接口
 * 4. 定义内容块和PDF状态接口
 * 5. 导出常量和默认设置
 */

/**
 * 书籍接口
 *
 * 字段说明：
 * - id: 书籍唯一标识
 * - name: 书籍名称
 * - path: 书籍文件路径
 * - progress: 阅读进度（0-100）
 * - fileSize: 文件大小（字节）
 * - lastReadTime: 最后阅读时间戳
 * - addedTime: 添加时间戳
 * - encoding: 文件编码
 * - type: 书籍类型（本地或微信读书）
 * - bookId: 微信读书书籍ID
 * - cover: 书籍封面URL
 * - author: 书籍作者
 * - synckey: 微信读书同步键
 */
export interface Book {
    /** 书籍唯一标识 */
    id: string;
    /** 书籍名称 */
    name: string;
    /** 书籍文件路径 */
    path: string;
    /** 阅读进度（0-100） */
    progress: number;
    /** 文件大小（字节） */
    fileSize: number;
    /** 最后阅读时间戳 */
    lastReadTime?: number;
    /** 添加时间戳 */
    addedTime: number;
    /** 文件编码 */
    encoding?: string;
    /** 书籍类型（本地或微信读书） */
    type?: 'local' | 'wechat';
    /** 微信读书书籍ID */
    bookId?: string;
    /** 书籍封面URL */
    cover?: string;
    /** 书籍作者 */
    author?: string;
    /** 微信读书同步键 */
    synckey?: number;
}

/**
 * 插件设置接口
 *
 * 字段说明：
 * - fontSize: 字体大小
 * - fontFamily: 字体系列
 * - lineHeight: 行高
 * - theme: 主题模式
 * - autoSaveInterval: 自动保存间隔（毫秒）
 * - maxFileSize: 最大文件大小（字节）
 * - wechatReadToken: 微信读书Token
 * - wechatReadUserId: 微信读书用户ID
 * - wechatReadSynckey: 微信读书同步键
 */
export interface PluginSettings {
    /** 字体大小 */
    fontSize: number;
    /** 字体系列 */
    fontFamily: string;
    /** 行高 */
    lineHeight: number;
    /** 主题模式 */
    theme: 'auto' | 'light' | 'dark';
    /** 自动保存间隔（毫秒） */
    autoSaveInterval: number;
    /** 最大文件大小（字节） */
    maxFileSize: number;
    /** 微信读书Token */
    wechatReadToken?: string;
    /** 微信读书用户ID */
    wechatReadUserId?: string;
    /** 微信读书同步键 */
    wechatReadSynckey?: number;
}

/**
 * WebView消息接口
 *
 * 字段说明：
 * - type: 消息类型
 * - [key: string]: 其他任意字段
 */
export interface WebViewMessage {
    /** 消息类型 */
    type: string;
    /** 其他任意字段 */
    [key: string]: any;
}

/**
 * 内容块接口
 *
 * 字段说明：
 * - content: 内容文本
 * - start: 起始位置
 * - end: 结束位置
 * - totalSize: 总大小
 */
export interface ContentChunk {
    /** 内容文本 */
    content: string;
    /** 起始位置 */
    start: number;
    /** 结束位置 */
    end: number;
    /** 总大小 */
    totalSize: number;
}

/**
 * PDF状态接口
 *
 * 字段说明：
 * - currentPage: 当前页码
 * - totalPages: 总页数
 * - zoom: 缩放比例
 * - rotation: 旋转角度
 */
export interface PdfState {
    /** 当前页码 */
    currentPage: number;
    /** 总页数 */
    totalPages: number;
    /** 缩放比例 */
    zoom: number;
    /** 旋转角度 */
    rotation: number;
}

/**
 * 允许的文件扩展名列表
 */
export const ALLOWED_EXTENSIONS = ['.txt', '.pdf'];

/**
 * 默认插件设置
 */
export const DEFAULT_SETTINGS: PluginSettings = {
    /** 默认字体大小：14px */
    fontSize: 14,
    /** 默认字体系列：系统默认字体 */
    fontFamily: "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    /** 默认行高：1.8 */
    lineHeight: 1.8,
    /** 默认主题：自动（跟随系统） */
    theme: 'auto',
    /** 默认自动保存间隔：3000毫秒 */
    autoSaveInterval: 3000,
    /** 默认最大文件大小：50MB */
    maxFileSize: 50 * 1024 * 1024, // 50MB
    /** 默认微信读书Token：未设置 */
    wechatReadToken: undefined,
    /** 默认微信读书用户ID：未设置 */
    wechatReadUserId: undefined,
    /** 默认微信读书同步键：0 */
    wechatReadSynckey: 0
};