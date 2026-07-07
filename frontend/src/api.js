// 部署时在 Vercel 环境变量里设置 VITE_API_BASE=https://你的后端.onrender.com
// 本地开发自动回退到 localhost
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';
