// 自动判断：如果是本地开发就用 localhost，否则用生产域名
const isLocal = typeof window !== 'undefined' && (
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1'
);
export const API_BASE = isLocal
  ? 'http://localhost:8000'
  : 'https://zhizhantzzs.cn';
