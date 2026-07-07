import os
from dotenv import load_dotenv

load_dotenv()

os.environ['NO_PROXY'] = '*'
os.environ['no_proxy'] = '*'

import json
import logging
import traceback
import requests
import httpx
import akshare as ak
from bs4 import BeautifulSoup
from concurrent.futures import ThreadPoolExecutor, as_completed
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from openai import OpenAI
import urllib3
from duckduckgo_search import DDGS
from auth.auth_middleware import get_current_user
from auth.memory import get_memory_context
from utils import safe_float

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

router = APIRouter(prefix="/api/sentiment", tags=["sentiment"], dependencies=[Depends(get_current_user)])
logger = logging.getLogger(__name__)

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")

if not DEEPSEEK_API_KEY:
    raise ValueError("DEEPSEEK_API_KEY not set")

http_client = httpx.Client(proxy=None, trust_env=False)
client = OpenAI(api_key=DEEPSEEK_API_KEY, base_url="https://api.deepseek.com", http_client=http_client)


class ChatRequest(BaseModel):
    stock_code: str
    stock_name: str
    message: str
    history: list = []
    displayed_news: list = []
    realtime: dict = {}
    ai_analysis: dict = {}
    conversation_id: str = ""


def fetch_article_content(url: str) -> str:
    if not url or url == '#':
        return ''
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        }
        resp = requests.get(url, headers=headers, timeout=8, verify=False)
        resp.encoding = resp.apparent_encoding or 'utf-8'
        soup = BeautifulSoup(resp.text, 'html.parser')

        selectors = [
            '#ContentBody',
            'div.contentbox',
            'div.article-content',
            'div.article-body',
            'div.newsContent',
            'article',
            'div.article',
        ]
        for sel in selectors:
            el = soup.select_one(sel)
            if el:
                text = el.get_text(separator='\n', strip=True)
                if len(text) > 80:
                    return text

        paragraphs = soup.find_all('p')
        if paragraphs:
            text = '\n'.join(p.get_text(strip=True) for p in paragraphs if len(p.get_text(strip=True)) > 20)
            if len(text) > 80:
                return text

        return ''
    except Exception:
        return ''


INTENT_OFF_TOPIC = "off_topic"
INTENT_ANALYSIS = "analysis"


def classify_intent(message: str, stock_name: str) -> str:
    msg = message.strip()
    off_patterns = [
        "讲个笑话", "写首诗", "写代码", "天气怎么样",
        "你是谁", "播放音乐", "唱首歌", "讲故事"
    ]
    if any(p in msg for p in off_patterns):
        return INTENT_OFF_TOPIC

    try:
        prompt = f"Classify this user message. Output only OFF_TOPIC or ANALYSIS.\nMessage: {msg}\nLabel:"
        res = client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=10
        )
        label = res.choices[0].message.content.strip().upper()
        if "OFF_TOPIC" in label:
            return INTENT_OFF_TOPIC
    except Exception:
        pass
    return INTENT_ANALYSIS


def build_system_prompt(intent: str, req: ChatRequest, search_context: str, memory_ctx: dict = None) -> str:
    if intent == INTENT_OFF_TOPIC:
        return f"""你是【智瞻首席AI投顾 Ruiyang】。
用户当前的提问与金融投资、宏观生态或【{req.stock_name}】完全无关。
请用 1-2 句话，极其礼貌、专业且有温度地婉拒用户的题外话（不要生硬），并自然引导用户向你询问关于【{req.stock_name} ({req.stock_code})】的最新盘面走势或资讯解读。"""

    # 对话记忆
    memory_block = ""
    if memory_ctx:
        parts = []
        if memory_ctx.get("key_facts_text"):
            parts.append(f"【本对话已提炼的关键事实】\n{memory_ctx['key_facts_text']}")
        if memory_ctx.get("summary_text"):
            parts.append(f"【早期对话摘要】\n{memory_ctx['summary_text']}")
        if parts:
            memory_block = "【对话记忆】（这是你与用户之前的对话要点，请在回答中主动引用这些信息）\n" + "\n\n".join(parts) + "\n"

    # 实时盘口
    rt = req.realtime or {}
    rt_block = ""
    if rt:
        rt_block = f"""【当前实时盘口】
- 最新价：{rt.get('price', 'N/A')} 元
- 涨跌额：{rt.get('change', 'N/A')}（{rt.get('change_pct', 'N/A')}%）
- 今开：{rt.get('open', 'N/A')}
- 最高：{rt.get('high', 'N/A')}
- 最低：{rt.get('low', 'N/A')}
"""

    # 情绪分析
    an = req.ai_analysis or {}
    an_block = ""
    if an:
        insights_str = "\n".join([f"  · {i.get('logic', '')} — {i.get('comment', '')}" for i in an.get('insights', [])])
        an_block = f"""【智瞻情绪分析结果】（已展示给用户）
- 情绪得分：{an.get('score', 'N/A')} / 100
- 策略建议：{an.get('advice', 'N/A')}
- 核心洞察：
{insights_str if insights_str else '  暂无'}
"""

    news_list_str = "\n\n".join([
        f"- 标题：{n.get('title')}\n  详细内容：{n.get('content', '无摘要')}\n  链接：{n.get('url')}"
        for n in req.displayed_news
    ])

    return f"""你是【智瞻首席AI投顾 Ruiyang】。你专业、理性且充满人情味，像资深分析师一样耐心倾听用户。
当前服务标的：【{req.stock_name} ({req.stock_code})】。

{memory_block}
{rt_block}
{an_block}
【前端页面已展示给用户的新闻】（用户可能直接指代这些内容）：
{news_list_str if news_list_str else '暂无前端新闻数据'}

【全网最新实时检索资讯】（系统刚为你补充的外部活水数据）：
{search_context}

工作准则：
1. 结合以上两块信息，深度且通俗地解答用户的提问。
2. 若【对话记忆】中有相关信息，请主动引用。
3. 切勿使用冷冰冰的机器口吻，表现出投顾的专业与亲和力。
"""

@router.get("/realtime/{stock_code}")
def get_realtime_price(stock_code: str):
    try:
        prefix_tx = "sh" if str(stock_code).startswith("6") else "sz"
        kpi_res = requests.get(
            f"http://qt.gtimg.cn/q={prefix_tx}{stock_code}",
            headers={"Connection": "close"},
            proxies={"http": None, "https": None},
            timeout=3
        )
        data = kpi_res.text.split('~')
        if len(data) > 45:
            return {
                "status": "success",
                "price": safe_float(data[3]),
                "change": safe_float(data[31]),
                "change_pct": safe_float(data[32]),
                "open": safe_float(data[5]),
                "high": safe_float(data[33]),
                "low": safe_float(data[34])
            }
        return {"status": "error"}
    except Exception:
        return {"status": "error"}


@router.get("/data/{stock_code}")
def get_sentiment_data(stock_code: str):
    try:
        news_full, news_for_frontend = [], []
        try:
            news_df = ak.stock_news_em(symbol=stock_code)
            rows = list(news_df.head(8).iterrows())

            url_to_content = {}
            with ThreadPoolExecutor(max_workers=min(8, len(rows))) as executor:
                futures = {
                    executor.submit(fetch_article_content, str(row.get('新闻链接', '#'))): idx
                    for idx, (_, row) in enumerate(rows)
                }
                for future in as_completed(futures):
                    idx = futures[future]
                    try:
                        url_to_content[idx] = future.result()
                    except Exception:
                        url_to_content[idx] = ''

            for idx, (_, row) in enumerate(rows):
                title = str(row.get('新闻标题', ''))
                url = str(row.get('新闻链接', '#'))
                time_str = str(row.get('发布时间', ''))
                content = url_to_content.get(idx, '')
                if not content:
                    content = title

                news_full.append({"title": title, "content": content})
                news_for_frontend.append({
                    "title": title,
                    "content": content,
                    "time": time_str,
                    "url": url
                })
        except Exception:
            fallback = "智瞻系统监测：近期盘面平稳，暂无重大特异性资讯"
            news_full = [{"title": fallback, "content": "无"}]
            news_for_frontend = [{"title": fallback, "time": "系统研判", "url": "#"}]

        news_text_blocks = [
            f"[{n['title']}]\n{n['content'] if n['content'] else 'No content'}"
            for n in news_full
        ]
        combined_news = "\n\n".join(news_text_blocks)

        system_prompt = """你是一个名为"智瞻AI"的顶级智能量化风控系统。请根据个股新闻评估情绪得分(0-100)。
极其严格的打分和建议规则：
- 85-100分: 必须建议"买入"
- 40-84分: 必须建议"观望"
- 0-39分: 必须建议"卖出"

你必须返回JSON格式，包含一个 insights 数组（生成2-3条不同的深度逻辑，用于前端滚动展示）：
{
  "score": 整数分,
  "advice": "买入/观望/卖出",
  "insights": [
     {"logic": "提取的一条核心逻辑(40字左右)", "comment": "对该逻辑的投顾简评(80字左右)"},
     {"logic": "提取的另一条核心逻辑", "comment": "相应的投顾简评"}
  ]
}"""

        user_prompt = f"股票代码：{stock_code}\n近期重要新闻详情：\n{combined_news}"

        ai_response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.1
        )
        return {
            "status": "success",
            "news": news_for_frontend,
            "ai_analysis": json.loads(ai_response.choices[0].message.content)
        }
    except Exception as e:
        logger.error(traceback.format_exc())
        return {"status": "error", "message": "Data fetch failed."}


@router.post("/chat")
async def chat_with_ruiyang(req: ChatRequest):
    def generate_stream():
        intent = classify_intent(req.message, req.stock_name)

        search_context = ""
        if intent == INTENT_ANALYSIS:
            try:
                with DDGS() as ddgs:
                    results = ddgs.text(f"{req.stock_name} {req.stock_code} 最新行情 市场情绪 突发资讯", max_results=4)
                    search_context = "\n".join([f"- {r['title']}: {r['body']}" for r in results])
            except Exception:
                search_context = "暂无最新联网检索数据。"

        memory_ctx = None
        if req.conversation_id:
            try:
                memory_ctx = get_memory_context(req.conversation_id)
            except Exception:
                pass

        system_setup = build_system_prompt(intent, req, search_context, memory_ctx)

        messages = [{"role": "system", "content": system_setup}]
        for m in req.history:
            role = "user" if m['sender'] == 'user' else "assistant"
            messages.append({"role": role, "content": m['text']})
        messages.append({"role": "user", "content": req.message})

        try:
            response = client.chat.completions.create(
                model="deepseek-chat",
                messages=messages,
                stream=True
            )
            for chunk in response:
                delta = chunk.choices[0].delta
                if hasattr(delta, 'content') and delta.content:
                    yield f"data: {json.dumps({'type': 'answer', 'content': delta.content})}\n\n"
        except Exception:
            yield f"data: {json.dumps({'type': 'error', 'content': 'Connection error.'})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate_stream(), media_type="text/event-stream")
