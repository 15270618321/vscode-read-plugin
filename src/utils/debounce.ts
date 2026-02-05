/**
 * utils/debounce.ts
 * 防抖和节流函数工具类
 * 
 * 功能说明：
 * 1. 提供防抖(debounce)函数，用于延迟执行函数，避免频繁调用
 * 2. 提供节流(throttle)函数，用于限制函数调用频率
 */

/**
 * 防抖函数
 * 
 * 功能：
 * 延迟执行函数，当持续触发事件时，函数不会立即执行，
 * 只有当触发事件后等待一段时间不再触发事件时，函数才会执行
 * 
 * @param func 要执行的函数
 * @param wait 等待时间（毫秒）
 * @param immediate 是否立即执行
 * @returns 防抖处理后的函数
 */
export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number,
    immediate: boolean = false
): T {
    /** 定时器ID */
    let timeout: NodeJS.Timeout | null = null;
    /** 上次调用的参数 */
    let lastArgs: any[] | null = null;
    /** 上次调用的this上下文 */
    let lastThis: any;

    return function(this: any, ...args: any[]) {
        const context = this;
        lastArgs = args;
        lastThis = context;

        /** 延迟执行函数 */
        const later = function() {
            timeout = null;
            if (!immediate) {
                func.apply(lastThis, lastArgs!);
            }
        };

        /** 是否立即执行 */
        const callNow = immediate && !timeout;

        if (timeout) {
            clearTimeout(timeout);
        }

        timeout = setTimeout(later, wait);

        if (callNow) {
            func.apply(context, args);
        }
    } as T;
}

/**
 * 节流函数
 * 
 * 功能：
 * 限制函数的执行频率，当持续触发事件时，函数会按照指定的时间间隔执行
 * 
 * @param func 要执行的函数
 * @param limit 时间限制（毫秒）
 * @returns 节流处理后的函数
 */
export function throttle<T extends (...args: any[]) => any>(
    func: T,
    limit: number
): T {
    /** 是否在节流中 */
    let inThrottle: boolean;
    /** 上次执行的结果 */
    let lastResult: ReturnType<T>;

    return function(this: any, ...args: any[]) {
        const context = this;

        if (!inThrottle) {
            inThrottle = true;
            lastResult = func.apply(context, args);

            setTimeout(() => {
                inThrottle = false;
            }, limit);
        }

        return lastResult;
    } as T;
}