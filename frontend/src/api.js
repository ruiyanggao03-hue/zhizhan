// 优先用环境变量，未设置时自动根据域名判断
export const API_BASE =
  import.meta.env.VITE_API_BASE ||
  (typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:8000'
    : 'https://zhizhantzzs.cn');
