/**
 * utils/debounce.ts
 * 防抖和节流函数工具类
 *
 * 功能说明：
 * 1. 提供防抖(debounce)函数，用于延迟执行函数，避免频繁调用
 * 2. 提供节流(throttle)函数，用于限制函数调用频率
 *
 * 核心概念：
 * - 防抖(Debounce)：当持续触发事件时，函数不会立即执行，只有当触发事件后等待一段时间不再触发事件时，函数才会执行
 * - 节流(Throttle)：当持续触发事件时，函数会按照指定的时间间隔执行，避免过于频繁的执行
 *
 * 使用场景：
 * - 防抖：搜索框输入、窗口 resize 事件、滚动事件等
 * - 节流：滚动加载、按钮点击、游戏中的技能释放等
 *
 * 技术原理：
 * - 使用 setTimeout 来延迟函数执行
 * - 使用闭包来保存状态（如定时器ID、上次执行时间等）
 * - 使用泛型来保持函数的类型信息
 */

/**
 * 防抖函数
 *
 * 功能：
 * 延迟执行函数，当持续触发事件时，函数不会立即执行，
 * 只有当触发事件后等待一段时间不再触发事件时，函数才会执行
 *
 * @param func 要执行的函数 - 需要进行防抖处理的原始函数
 * @param wait 等待时间（毫秒） - 触发事件后需要等待的时间
 * @param immediate 是否立即执行 - true表示触发事件后立即执行，false表示等待wait毫秒后执行
 * @returns 防抖处理后的函数 - 具有防抖功能的新函数
 *
 * 实现原理：
 * 1. 使用闭包保存状态：timeout（定时器ID）、lastArgs（上次调用的参数）、lastThis（上次调用的this上下文）
 * 2. 每次调用时，清除之前的定时器，重新设置新的定时器
 * 3. 如果设置了immediate且当前没有定时器，则立即执行函数
 * 4. 否则，等待wait毫秒后执行函数
 *
 * 执行流程：
 * 1. 第一次调用：设置定时器，等待wait毫秒后执行
 * 2. 在wait毫秒内再次调用：清除之前的定时器，重新设置新的定时器
 * 3. 等待wait毫秒后没有再次调用：执行函数
 *
 * 应用示例：
 * ```typescript
 * // 搜索框输入防抖
 * const debouncedSearch = debounce((keyword: string) => {
 *   console.log('Searching for:', keyword);
 *   // 发送搜索请求
 * }, 300);
 *
 * // 监听输入事件
 * inputElement.addEventListener('input', (e) => {
 *   debouncedSearch((e.target as HTMLInputElement).value);
 * });
 * ```
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