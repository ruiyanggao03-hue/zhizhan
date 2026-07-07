"""Conversation memory engine — summary + key facts + dynamic window."""
import json
import os
import httpx
from openai import OpenAI
from auth.models import SessionLocal, Conversation, Message

MAX_RECENT_MESSAGES = 15
SUMMARY_TRIGGER_COUNT = 20        # Trigger first summary at 20 messages
SUMMARY_INCREMENTAL = 10          # Re-trigger every 10 new messages after first

# Shared DeepSeek client
_deepseek_client = None


def _get_client():
    global _deepseek_client
    if _deepseek_client is None:
        key = os.getenv("DEEPSEEK_API_KEY")
        if not key:
            raise ValueError("DEEPSEEK_API_KEY not set")
        http_client = httpx.Client(proxy=None, trust_env=False)
        _deepseek_client = OpenAI(api_key=key, base_url="https://api.deepseek.com", http_client=http_client)
    return _deepseek_client


def get_memory_context(conv_id: str) -> dict:
    """Build the memory context block for injection into the AI system prompt.

    Returns dict with:
      - summary_text: early conversation summary (for long convos)
      - key_facts_text: formatted key facts
      - recent_messages: list of {sender, text} — last N messages
      - total_tokens_estimate: rough token count of all context
    """
    db = SessionLocal()
    try:
        conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
        if not conv:
            db.close()
            return _empty_context()

        total = db.query(Message).filter(Message.conversation_id == conv_id).count()
        recent = (
            db.query(Message)
            .filter(Message.conversation_id == conv_id)
            .order_by(Message.created_at.asc())
            .all()
        )

        # Split: early history → summary; recent n → full text
        recent_msgs = []
        if len(recent) <= MAX_RECENT_MESSAGES:
            recent_msgs = [{"sender": m.sender, "text": m.text} for m in recent]
        else:
            recent_msgs = [{"sender": m.sender, "text": m.text} for m in recent[-MAX_RECENT_MESSAGES:]]

        # Summary
        summary_text = ""
        if conv.summary:
            summary_text = conv.summary

        # Key facts
        key_facts_text = ""
        if conv.key_facts:
            try:
                facts = json.loads(conv.key_facts)
                key_facts_text = "  ".join([f"· {f.get('k', '')}: {f.get('v', '')}" for f in facts[:10]])
            except Exception:
                key_facts_text = ""

        # Rough token estimate (Chinese chars ~1.5 tokens each)
        recent_chars = sum(len(m["text"]) for m in recent_msgs)
        summary_chars = len(summary_text) + len(key_facts_text)
        estimate = int((recent_chars + summary_chars) * 1.2)

        db.close()
        return {
            "summary_text": summary_text,
            "key_facts_text": key_facts_text,
            "recent_messages": recent_msgs,
            "total_count": total,
            "total_tokens_estimate": estimate,
        }
    except Exception:
        db.close()
        return _empty_context()


def _empty_context():
    return {"summary_text": "", "key_facts_text": "", "recent_messages": [], "total_count": 0, "total_tokens_estimate": 0}


def trigger_summary_check(conv_id: str) -> dict:
    """Check if this conversation needs summarization, and generate if so.

    Called after saving messages. Returns {triggered, summary, key_facts} or {triggered: False}.
    """
    db = SessionLocal()
    try:
        conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
        if not conv:
            db.close()
            return {"triggered": False}

        total = db.query(Message).filter(Message.conversation_id == conv_id).count()

        # Determine if we should summarize
        existing_summary = bool(conv.summary)
        should_summarize = False

        if not existing_summary and total >= SUMMARY_TRIGGER_COUNT:
            should_summarize = True
        elif existing_summary and total % SUMMARY_INCREMENTAL == 0:
            should_summarize = True

        if not should_summarize:
            conv.message_count = total
            db.commit()
            db.close()
            return {"triggered": False}

        # Collect messages for summarization
        # If first time: summarize first (total - MAX_RECENT_MESSAGES) messages
        # If incremental: merge old summary + new messages since last summary
        messages = (
            db.query(Message)
            .filter(Message.conversation_id == conv_id)
            .order_by(Message.created_at.asc())
            .all()
        )

        # Build summarization input
        if not existing_summary:
            # First summarization: compress early messages
            early_msgs = messages[:-MAX_RECENT_MESSAGES] if len(messages) > MAX_RECENT_MESSAGES else messages
            input_text = _format_messages_for_summary(early_msgs)
            prompt = _SUMMARY_PROMPT_FIRST.format(input_text=input_text)
        else:
            # Incremental: merge
            new_msgs = messages[-(SUMMARY_INCREMENTAL):] if len(messages) >= SUMMARY_INCREMENTAL else messages[-10:]
            input_text = _format_messages_for_summary(new_msgs)
            prompt = _SUMMARY_PROMPT_INCREMENTAL.format(
                existing_summary=conv.summary,
                existing_facts=conv.key_facts or "[]",
                input_text=input_text,
            )

        # Call DeepSeek
        try:
            client = _get_client()
            response = client.chat.completions.create(
                model="deepseek-chat",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0.1,
                max_tokens=800,
            )
            result = json.loads(response.choices[0].message.content)

            conv.summary = result.get("summary", "")
            conv.key_facts = json.dumps(result.get("key_facts", []), ensure_ascii=False)
            conv.message_count = total
            db.commit()

            db.close()
            return {
                "triggered": True,
                "summary": conv.summary,
                "key_facts": result.get("key_facts", []),
            }
        except Exception as e:
            db.close()
            return {"triggered": False, "error": str(e)}
    except Exception:
        db.close()
        return {"triggered": False}


def _format_messages_for_summary(msgs):
    lines = []
    for m in msgs:
        role = "用户" if m.sender == "user" else "AI"
        text = m.text[:300] if len(m.text) > 300 else m.text
        lines.append(f"[{role}]: {text}")
    return "\n\n".join(lines)


_SUMMARY_PROMPT_FIRST = """你是对话摘要引擎。请将以下对话内容压缩为结构化的记忆摘要和关键事实。

对话内容：
{input_text}

要求：
1. summary：用 200 字以内概括核心讨论内容，重点记录：
   - 用户关注的核心问题
   - 已讨论的关键数据点
   - AI 给出的核心结论和建议
2. key_facts：提取 3-8 条关键事实，每条包含 k（简短标签）和 v（具体值）
   - 例如：{{"k": "标的", "v": "贵州茅台 600519"}}、{{"k": "AI评分", "v": "73分/建议观望"}}
3. 输出严格的 JSON 格式：{{"summary": "...", "key_facts": [{{"k": "...", "v": "..."}}]}}"""

_SUMMARY_PROMPT_INCREMENTAL = """你是对话摘要引擎。请将已有的摘要、关键事实和新增对话合并更新。

已有摘要：
{existing_summary}

已有关键事实（JSON）：
{existing_facts}

新增对话：
{input_text}

要求：
1. summary：合并已有摘要和新增内容，保持 300 字以内
2. key_facts：合并更新关键事实，最多 10 条，去掉过时的、保留最新的
3. 输出严格的 JSON 格式：{{"summary": "...", "key_facts": [{{"k": "...", "v": "..."}}]}}"""
