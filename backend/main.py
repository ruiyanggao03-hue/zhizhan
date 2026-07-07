# backend/main.py
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import akshare as ak
from routers import fundamentals, sentiment, report
from routers.auth import router as auth_router
from routers.company import router as company_router
from routers.chat import router as chat_router
from auth.models import init_db

# 初始化 FastAPI 应用
app = FastAPI(title="智瞻系统 API", version="2.0")

# 配置跨域 — 生产环境通过 CORS_ORIGINS 指定域名，本地开发默认 localhost
_cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _cors_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 静态文件服务（用户头像）
os.makedirs("static/avatars", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

# 公开路由（无需认证）
app.include_router(auth_router)

# 受保护路由（需要认证）
app.include_router(fundamentals.router)
app.include_router(sentiment.router)
app.include_router(report.router)
app.include_router(company_router)
app.include_router(chat_router)

# 🌟 核心缓存：用于存储全市场 5000+ A 股代码与名称
a_stock_list = []

# 在 FastAPI 启动时自动拉取全市场股票字典
@app.on_event("startup")
def load_stock_data():
    global a_stock_list
    init_db()  # 初始化用户数据库
    try:
        print("正在加载全市场 A 股代码库，请稍候...")
        df = ak.stock_info_a_code_name()
        for _, row in df.iterrows():
            a_stock_list.append({
                "value": str(row['code']),
                "label": f"{row['code']} - {row['name']}",
                "name": str(row['name'])
            })
        print(f"✅ 成功加载 {len(a_stock_list)} 只 A 股数据作为智能搜索库！")
    except Exception as e:
        print(f"❌ 加载 A 股数据失败，使用备用库。错误: {e}")
        # 兜底备用库
        a_stock_list = [
            {"value": "600519", "label": "600519 - 贵州茅台", "name": "贵州茅台"},
            {"value": "300750", "label": "300750 - 宁德时代", "name": "宁德时代"},
            {"value": "601318", "label": "601318 - 中国平安", "name": "中国平安"}
        ]

@app.get("/")
def read_root():
    return {"message": "智瞻系统后端引擎已成功启动！"}

# 🌟 全新商业级搜索补全接口：前缀优先匹配
@app.get("/api/search")
def search_stock(keyword: str = ""):
    if not keyword:
        return []

    keyword = keyword.lower().strip()
    starts_with_matches = []
    contains_matches = []

    # 遍历缓存的全市场字典
    for item in a_stock_list:
        code = item['value']
        name = item['name'].lower()

        # 优先级 1：代码或拼音以输入值【开头】（例如输入 300，立刻出 300750）
        if code.startswith(keyword) or name.startswith(keyword):
            starts_with_matches.append({"value": code, "label": item["label"]})
        # 优先级 2：包含该关键词
        elif keyword in code or keyword in name:
            contains_matches.append({"value": code, "label": item["label"]})

        # 性能保护：一旦精准匹配够了 10 个，立刻停止
        if len(starts_with_matches) >= 10:
            break

    # 合并结果，把绝对精准的放在最前面
    results = (starts_with_matches + contains_matches)[:10]
    return results
