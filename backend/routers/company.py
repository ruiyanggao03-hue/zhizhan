import time
import requests
from fastapi import APIRouter, Depends

from auth.auth_middleware import get_current_user

router = APIRouter(prefix="/api/company", tags=["公司概况"], dependencies=[Depends(get_current_user)])

# Simple in-memory cache: {stock_code: (timestamp, data)}
_cache = {}
CACHE_TTL = 60 * 60 * 24  # 24 hours


@router.get("/{stock_code}")
def get_company_profile(stock_code: str):
    now = time.time()
    if stock_code in _cache:
        ts, data = _cache[stock_code]
        if now - ts < CACHE_TTL:
            return data

    prefix = "SH" if stock_code.startswith(("6", "9")) else "SZ"
    tencent_prefix = "sh" if stock_code.startswith(("6", "9")) else "sz"
    result = {
        "status": "success",
        "company_name": "",
        "stock_code": stock_code,
        "industry": "",
        "short_description": "",
        "business_scope": "",
        "employees": "",
        "headquarters": "",
        "website": "",
        "founded": "",
        "listing_date": "",
        "market_cap": "",          # 总市值（亿元）
        "market_cap_category": "",
    }

    # 1. 获取公司基本资料（东方财富 F10）
    try:
        url = f"https://emweb.securities.eastmoney.com/PC_HSF10/CompanySurvey/CompanySurveyAjax?code={prefix}{stock_code}"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://emweb.securities.eastmoney.com/",
        }
        resp = requests.get(url, headers=headers, timeout=10)
        data = resp.json()

        jbzl = data.get("jbzl", {})
        fxxg = data.get("fxxg", {})

        result["company_name"] = jbzl.get("gsmc", "")
        result["industry"] = jbzl.get("sshy", "")
        result["short_description"] = jbzl.get("gsjj", "").strip()
        result["business_scope"] = jbzl.get("jyfw", "")
        result["employees"] = jbzl.get("gyrs", "")
        result["headquarters"] = jbzl.get("bgdz", "")
        result["website"] = jbzl.get("gswz", "")
        result["founded"] = fxxg.get("clrq", "")
        result["listing_date"] = fxxg.get("ssrq", "")
    except Exception:
        pass  # profile fetch failed, continue with market cap

    # 2. 获取实时市值（腾讯行情 API，字段[44]=总市值(亿元)）
    try:
        qt_url = f"http://qt.gtimg.cn/q={tencent_prefix}{stock_code}"
        qt_resp = requests.get(qt_url, headers={"Connection": "close"}, timeout=5)
        qt_data = qt_resp.text.split("~")
        if len(qt_data) > 45 and qt_data[44]:
            market_cap = float(qt_data[44])
            result["market_cap"] = f"{market_cap:.2f} 亿元"
            if market_cap > 200:
                result["market_cap_category"] = "大盘股"
            elif market_cap > 50:
                result["market_cap_category"] = "中盘股"
            else:
                result["market_cap_category"] = "小盘股"
    except Exception:
        # 无法获取市值时不展示分类
        pass

    _cache[stock_code] = (now, result)
    return result
