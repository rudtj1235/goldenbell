/**
 * 프로덕션 환경 로거
 * 개발 환경에서만 로그 출력
 */

const isDev = process.env.NODE_ENV === 'development';

export const logger = {
  log: (...args: any[]) => {
    if (isDev) console.log(...args);
  },
  
  info: (...args: any[]) => {
    if (isDev) console.info(...args);
  },
  
  warn: (...args: any[]) => {
    console.warn(...args); // warning은 항상 출력
  },
  
  error: (...args: any[]) => {
    console.error(...args); // error는 항상 출력
  },
  
  debug: (...args: any[]) => {
    if (isDev) console.debug(...args);
  }
};

export default logger;

