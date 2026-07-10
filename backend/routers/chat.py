import json
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from auth.models import SessionLocal, Conversation, Message
from auth.auth_middleware import get_current_user
from auth.memory import trigger_summary_check

router = APIRouter(prefix="/api/chat", tags=["聊天记录"], dependencies=[Depends(get_current_user)])


class CreateConversationRequest(BaseModel):
    module: str  # "sentiment" or "report"
    stock_code: str
    stock_name: str


class SaveMessagesRequest(BaseModel):
    messages: list  # [{sender, text, intent?, exportable?}]


class UpdateConversationRequest(BaseModel):
    title: str | None = None
    selected_docs: list | None = None


@router.post("/conversations")
def create_conversation(req: CreateConversationRequest, user=Depends(get_current_user)):
    db = SessionLocal()
    try:
        conv = Conversation(
            user_id=user.id,
            module=req.module,
            stock_code=req.stock_code,
            stock_name=req.stock_name,
        )
        db.add(conv)
        db.commit()
        db.refresh(conv)
        return {
            "id": conv.id,
            "module": conv.module,
            "stock_code": conv.stock_code,
            "stock_name": conv.stock_name,
            "title": conv.title,
            "selected_docs": json.loads(conv.selected_docs) if conv.selected_docs else [],
            "created_at": conv.created_at.isoformat() + 'Z',
            "updated_at": conv.updated_at.isoformat() + 'Z',
        }
    finally:
        db.close()


@router.get("/conversations")
def list_conversations(module: str = None, user=Depends(get_current_user)):
    db = SessionLocal()
    try:
        q = db.query(Conversation).filter(Conversation.user_id == user.id)
        if module:
            q = q.filter(Conversation.module == module)
        q = q.order_by(Conversation.updated_at.desc())
        convs = q.all()
        return [
            {
                "id": c.id,
                "module": c.module,
                "stock_code": c.stock_code,
                "stock_name": c.stock_name,
                "title": c.title,
                "selected_docs": json.loads(c.selected_docs) if c.selected_docs else [],
                "created_at": c.created_at.isoformat() + 'Z',
                "updated_at": c.updated_at.isoformat() + 'Z',
            }
            for c in convs
        ]
    finally:
        db.close()


@router.get("/conversations/{conv_id}/messages")
def get_messages(conv_id: str, limit: int = 50, offset: int = 0, user=Depends(get_current_user)):
    db = SessionLocal()
    try:
        conv = db.query(Conversation).filter(
            Conversation.id == conv_id,
            Conversation.user_id == user.id,
        ).first()
        if not conv:
            raise HTTPException(status_code=404, detail="对话不存在")
        total = db.query(Message).filter(Message.conversation_id == conv_id).count()
        msgs = db.query(Message).filter(Message.conversation_id == conv_id)\
            .order_by(Message.created_at.asc())\
            .offset(offset).limit(limit).all()
        return {
            "total": total,
            "messages": [
                {
                    "id": m.id,
                    "sender": m.sender,
                    "text": m.text,
                    "intent": m.intent,
                    "exportable": m.exportable,
                    "created_at": m.created_at.isoformat() + 'Z',
                }
                for m in msgs
            ],
        }
    finally:
        db.close()


@router.post("/conversations/{conv_id}/messages")
def save_messages(conv_id: str, req: SaveMessagesRequest, user=Depends(get_current_user)):
    db = SessionLocal()
    try:
        conv = db.query(Conversation).filter(
            Conversation.id == conv_id,
            Conversation.user_id == user.id,
        ).first()
        if not conv:
            raise HTTPException(status_code=404, detail="对话不存在")

        for m in req.messages:
            msg = Message(
                conversation_id=conv_id,
                sender=m.get("sender", "user"),
                text=m.get("text", ""),
                intent=m.get("intent"),
                exportable=m.get("exportable", False),
            )
            db.add(msg)

        # Auto-title from first user message if not yet set
        if not conv.title:
            first_user = next((m for m in req.messages if m.get("sender") == "user"), None)
            if first_user:
                title = first_user.get("text", "")[:50]
                conv.title = title

        # Update selected_docs from first message if provided
        for m in req.messages:
            if m.get("selected_docs") is not None:
                conv.selected_docs = json.dumps(m["selected_docs"])

        db.commit()

        # Trigger summary check asynchronously (fire-and-forget)
        import threading
        t = threading.Thread(target=trigger_summary_check, args=(conv_id,), daemon=True)
        t.start()

        return {"status": "ok", "count": len(req.messages)}
    finally:
        db.close()


@router.put("/conversations/{conv_id}")
def update_conversation(conv_id: str, req: UpdateConversationRequest, user=Depends(get_current_user)):
    db = SessionLocal()
    try:
        conv = db.query(Conversation).filter(
            Conversation.id == conv_id,
            Conversation.user_id == user.id,
        ).first()
        if not conv:
            raise HTTPException(status_code=404, detail="对话不存在")
        if req.title is not None:
            conv.title = req.title
        if req.selected_docs is not None:
            conv.selected_docs = json.dumps(req.selected_docs)
        db.commit()
        return {"status": "ok"}
    finally:
        db.close()


@router.delete("/conversations/{conv_id}")
def delete_conversation(conv_id: str, user=Depends(get_current_user)):
    db = SessionLocal()
    try:
        conv = db.query(Conversation).filter(
            Conversation.id == conv_id,
            Conversation.user_id == user.id,
        ).first()
        if not conv:
            raise HTTPException(status_code=404, detail="对话不存在")
        db.query(Message).filter(Message.conversation_id == conv_id).delete()
        db.delete(conv)
        db.commit()
        return {"status": "ok"}
    finally:
        db.close()
