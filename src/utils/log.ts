/* 간단한 로깅 유틸 - 개발/디버그시에만 로그 출력 */

declare global {
  interface Window {
    APP_DEBUG?: boolean;
  }
}

export function isDebugEnabled(): boolean {
  try {
    if (typeof window !== 'undefined') {
      if (typeof window.APP_DEBUG === 'boolean') return window.APP_DEBUG;
      const saved = localStorage.getItem('DEBUG');
      if (saved != null) return saved === 'true' || saved === '1' || saved.toLowerCase() === 'on';
    }
  } catch {}
  return process.env.NODE_ENV !== 'production';
}

export const log = {
  debug: (...args: unknown[]) => { if (isDebugEnabled()) console.debug(...args as any); },
  info: (...args: unknown[]) => { if (isDebugEnabled()) console.info(...args as any); },
  warn: (...args: unknown[]) => console.warn(...args as any),
  error: (...args: unknown[]) => console.error(...args as any),
};


