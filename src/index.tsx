import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// 콘솔 경고/오류 필터: 외부 라이브러리/라우터의 개발 경고를 숨겨 UX를 깨끗하게 유지
const originalWarn = console.warn;
const originalError = console.error;

function shouldSuppressLog(args: unknown[]): boolean {
  try {
    const msg = String(args[0] ?? '');
    return (
      // avataaars2 / legacy context 경고
      msg.includes('Legacy context API') ||
      msg.includes('legacy childContextTypes') ||
      msg.includes('legacy contextTypes') ||
      msg.includes('AvatarComponent uses the legacy') ||
      msg.includes('Selector uses the legacy') ||
      // React Router 미래 플래그 경고
      msg.includes('React Router Future Flag Warning')
    );
  } catch {
    return false;
  }
}

console.warn = function (...args) {
  if (shouldSuppressLog(args)) return;
  return originalWarn.apply(console, args as any);
};

console.error = function (...args) {
  if (shouldSuppressLog(args)) return;
  return originalError.apply(console, args as any);
};

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <App />
);

