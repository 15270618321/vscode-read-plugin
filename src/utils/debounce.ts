// utils/debounce.ts
export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number,
    immediate: boolean = false
): T {
    let timeout: NodeJS.Timeout | null = null;
    let lastArgs: any[] | null = null;
    let lastThis: any;

    return function(this: any, ...args: any[]) {
        const context = this;
        lastArgs = args;
        lastThis = context;

        const later = function() {
            timeout = null;
            if (!immediate) {
                func.apply(lastThis, lastArgs!);
            }
        };

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

export function throttle<T extends (...args: any[]) => any>(
    func: T,
    limit: number
): T {
    let inThrottle: boolean;
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