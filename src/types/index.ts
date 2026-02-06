/**
 * types/index.ts
 * 类型定义文件
 *
 * 功能说明：
 * 1. 定义书籍相关接口 - 描述书籍的数据结构
 * 2. 定义插件设置接口 - 描述插件的配置选项
 * 3. 定义WebView消息接口 - 描述WebView与扩展之间的通信消息
 * 4. 定义内容块和PDF状态接口 - 描述内容块和PDF阅读状态
 * 5. 导出常量和默认设置 - 提供默认配置和常量值
 *
 * 核心概念：
 * - 接口（Interface）：TypeScript中用于定义对象结构的类型
 * - 类型定义：为代码提供类型约束，提高代码质量和可维护性
 * - 默认值：为插件提供默认配置
 * - 常量：定义固定不变的值
 */

/**
 * 书籍接口
 *
 * 功能：
 * 定义书籍的数据结构，描述书籍的各种属性
 *
 * 字段说明：
 * - id: 书籍唯一标识 - 用于在插件中唯一识别一本书
 * - name: 书籍名称 - 显示在界面上的书籍名称
 * - path: 书籍文件路径 - 本地书籍的文件位置，微信读书书籍使用特殊格式
 * - progress: 阅读进度（0-100） - 表示书籍的阅读进度百分比
 * - fileSize: 文件大小（字节） - 本地书籍的文件大小，微信读书书籍为0
 * - lastReadTime: 最后阅读时间戳 - 记录上次阅读的时间
 * - addedTime: 添加时间戳 - 记录书籍添加到插件的时间
 * - encoding: 文件编码 - 文本文件的编码格式，如utf8
 * - type: 书籍类型（本地或微信读书） - 区分本地书籍和微信读书书籍
 * - bookId: 微信读书书籍ID - 微信读书中书籍的唯一标识
 * - cover: 书籍封面URL - 书籍封面图片的网络地址
 * - author: 书籍作者 - 书籍的作者信息
 * - synckey: 微信读书同步键 - 用于微信读书书籍的增量同步
 *
 * 使用场景：
 * - 本地书籍：存储在本地文件系统的.txt或.pdf文件
 * - 微信读书书籍：从微信读书API同步的书籍
 */
export interface Book {
    /** 书籍唯一标识 - 用于在插件中唯一识别一本书，本地书籍使用时间戳，微信读书书籍使用bookId前缀 */
    id: string;
    /** 书籍名称 - 显示在界面上的书籍名称，从文件名或微信读书API获取 */
    name: string;
    /** 书籍文件路径 - 本地书籍的绝对路径，微信读书书籍使用"wechat://bookId"格式 */
    path: string;
    /** 阅读进度（0-100） - 表示书籍的阅读进度百分比，0表示未开始，100表示已完成 */
    progress: number;
    /** 文件大小（字节） - 本地书籍的文件大小，微信读书书籍为0 */
    fileSize: number;
    /** 最后阅读时间戳 - 记录上次阅读的时间，用于排序和显示 */
    lastReadTime?: number;
    /** 添加时间戳 - 记录书籍添加到插件的时间 */
    addedTime: number;
    /** 文件编码 - 文本文件的编码格式，如utf8、gbk等，PDF文件不需要 */
    encoding?: string;
    /** 书籍类型（本地或微信读书） - 区分本地书籍和微信读书书籍 */
    type?: 'local' | 'wechat';
    /** 微信读书书籍ID - 微信读书中书籍的唯一标识，本地书籍不需要 */
    bookId?: string;
    /** 书籍封面URL - 书籍封面图片的网络地址，用于显示封面 */
    cover?: string;
    /** 书籍作者 - 书籍的作者信息，用于显示作者名称 */
    author?: string;
    /** 微信读书同步键 - 用于微信读书书籍的增量同步，本地书籍不需要 */
    synckey?: number;
}

/**
 * 插件设置接口
 *
 * 功能：
 * 定义插件的配置选项，描述用户可以自定义的设置
 *
 * 字段说明：
 * - fontSize: 字体大小 - 文本阅读时的字体大小
 * - fontFamily: 字体系列 - 文本阅读时使用的字体
 * - lineHeight: 行高 - 文本阅读时的行间距
 * - theme: 主题模式 - 插件的显示主题
 * - autoSaveInterval: 自动保存间隔（毫秒） - 数据自动保存的时间间隔
 * - maxFileSize: 最大文件大小（字节） - 允许添加的最大文件大小
 * - wechatReadToken: 微信读书Token - 用于登录微信读书API
 * - wechatReadUserId: 微信读书用户ID - 微信读书用户的唯一标识
 * - wechatReadSynckey: 微信读书同步键 - 用于微信读书书籍的增量同步
 *
 * 使用场景：
 * - 用户可以通过设置调整阅读体验
 * - 插件使用这些设置来配置其行为
 * - 微信读书相关设置用于API调用和数据同步
 */
export interface PluginSettings {
    /** 字体大小 - 文本阅读时的字体大小，默认14px */
    fontSize: number;
    /** 字体系列 - 文本阅读时使用的字体，默认使用系统字体 */
    fontFamily: string;
    /** 行高 - 文本阅读时的行间距，默认1.8倍行高 */
    lineHeight: number;
    /** 主题模式 - 插件的显示主题，auto表示跟随系统，light表示亮色，dark表示暗色 */
    theme: 'auto' | 'light' | 'dark';
    /** 自动保存间隔（毫秒） - 数据自动保存的时间间隔，默认3000毫秒 */
    autoSaveInterval: number;
    /** 最大文件大小（字节） - 允许添加的最大文件大小，默认50MB */
    maxFileSize: number;
    /** 微信读书Token - 用于登录微信读书API，用户需要手动输入 */
    wechatReadToken?: string;
    /** 微信读书用户ID - 微信读书用户的唯一标识，用户需要手动输入 */
    wechatReadUserId?: string;
    /** 微信读书同步键 - 用于微信读书书籍的增量同步，自动更新 */
    wechatReadSynckey?: number;
}

/**
 * WebView消息接口
 *
 * 功能：
 * 定义WebView与扩展之间通信的消息结构
 *
 * 字段说明：
 * - type: 消息类型 - 标识消息的种类，如更新进度、调整字体大小等
 * - [key: string]: 其他任意字段 - 根据消息类型携带不同的参数
 *
 * 核心概念：
 * - 消息传递：WebView与扩展之间通过postMessage和onDidReceiveMessage方法通信
 * - 消息类型：不同的消息类型对应不同的操作
 * - 动态字段：根据消息类型的不同，携带不同的参数
 *
 * 常见消息类型：
 * - updateProgress: 更新阅读进度
 * - increaseFontSize: 增加字体大小
 * - decreaseFontSize: 减小字体大小
 * - setFontSize: 设置字体大小
 * - loadPdfFile: 加载PDF文件
 * - loadMoreContent: 加载更多内容
 * - syncWechatProgress: 同步微信读书进度
 */
export interface WebViewMessage {
    /** 消息类型 - 标识消息的种类，用于区分不同的操作 */
    type: string;
    /** 其他任意字段 - 根据消息类型携带不同的参数，如进度值、字体大小等 */
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