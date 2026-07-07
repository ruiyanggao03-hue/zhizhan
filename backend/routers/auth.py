import os
import time
import bcrypt
from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from sqlalchemy.exc import IntegrityError

from auth.models import SessionLocal, User
from auth.schemas import (
    RegisterRequest,
    LoginRequest,
    SendSmsRequest,
    UpdateUsernameRequest,
    ResetPasswordRequest,
    UserInfoResponse,
)
from auth.auth_middleware import create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["用户认证"])

AVATAR_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static", "avatars")
# ⚠️ 上线前务必: 设置环境变量 DEV_MODE=false 并接入真实短信服务
DEV_MODE = os.getenv("DEV_MODE", "true").lower() == "true"
SMS_DEV_CODE = os.getenv("SMS_DEV_CODE", "888888")
SMS_COOLDOWN = {}  # phone -> timestamp


def user_to_response(user: User) -> dict:
    avatar_url = None
    if user.avatar_path:
        avatar_url = f"/static/avatars/{user.avatar_path}"
    return {
        "id": user.id,
        "phone": user.phone,
        "username": user.username,
        "avatar_url": avatar_url,
    }


@router.post("/send-sms")
def send_sms(req: SendSmsRequest):
    phone = req.phone

    # Cooldown check
    if phone in SMS_COOLDOWN:
        elapsed = time.time() - SMS_COOLDOWN[phone]
        if elapsed < 60:
            raise HTTPException(status_code=429, detail=f"请 {60 - int(elapsed)} 秒后再试")

    SMS_COOLDOWN[phone] = time.time()

    if DEV_MODE:
        return {"dev_mode": True, "code": SMS_DEV_CODE, "message": f"开发模式：验证码为 {SMS_DEV_CODE}"}

    # Production: integrate with real SMS provider here
    raise HTTPException(status_code=501, detail="短信服务未配置，请联系管理员")


@router.post("/register")
def register(req: RegisterRequest):
    # 密码强度已由 Pydantic schema 校验，此处直接注册
    hashed = bcrypt.hashpw(req.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    db = SessionLocal()
    try:
        user = User(
            phone=req.phone,
            hashed_password=hashed,
            username=f"用户{req.phone[-4:]}",
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        token = create_access_token(user.id)
        return {"access_token": token, "user": user_to_response(user)}
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="该手机号已注册，请直接登录")
    finally:
        db.close()


@router.post("/login")
def login(req: LoginRequest):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.phone == req.phone).first()
        if user is None:
            raise HTTPException(status_code=401, detail="手机号未注册")

        if not bcrypt.checkpw(req.password.encode("utf-8"), user.hashed_password.encode("utf-8")):
            raise HTTPException(status_code=401, detail="密码错误")

        token = create_access_token(user.id)
        return {"access_token": token, "user": user_to_response(user)}
    finally:
        db.close()


@router.post("/reset-password")
def reset_password(req: ResetPasswordRequest):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.phone == req.phone).first()
        if user is None:
            raise HTTPException(status_code=404, detail="该手机号未注册")

        # 用旧密码验证身份（替代短信验证码）
        if not bcrypt.checkpw(req.old_password.encode("utf-8"), user.hashed_password.encode("utf-8")):
            raise HTTPException(status_code=401, detail="旧密码错误")

        hashed = bcrypt.hashpw(req.new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        user.hashed_password = hashed
        db.commit()
        return {"message": "密码重置成功，请使用新密码登录"}
    finally:
        db.close()


@router.get("/me")
def get_me(user: User = Depends(get_current_user)):
    return user_to_response(user)


@router.put("/update-username")
def update_username(req: UpdateUsernameRequest, user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        db_user = db.query(User).filter(User.id == user.id).first()
        db_user.username = req.username
        db.commit()
        return user_to_response(db_user)
    finally:
        db.close()


@router.post("/upload-avatar")
async def upload_avatar(file: UploadFile = File(...), user: User = Depends(get_current_user)):
    # Validate file type
    allowed_types = ["image/png", "image/jpeg", "image/gif", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="仅支持 PNG、JPEG、GIF、WebP 格式的图片")

    # Read and validate size (max 2MB)
    content = await file.read()
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="图片大小不能超过 2MB")

    # Save file (guard against None filename)
    fname = file.filename or "avatar.png"
    ext = fname.split(".")[-1] if "." in fname else "png"
    safe_ext = ext.lower() if ext.lower() in ["png", "jpg", "jpeg", "gif", "webp"] else "png"
    filename = f"{user.id}.{safe_ext}"

    os.makedirs(AVATAR_DIR, exist_ok=True)
    avatar_path = os.path.join(AVATAR_DIR, filename)
    with open(avatar_path, "wb") as f:
        f.write(content)

    # Update DB
    db = SessionLocal()
    try:
        db_user = db.query(User).filter(User.id == user.id).first()
        db_user.avatar_path = filename
        db.commit()
    finally:
        db.close()

    return {"avatar_url": f"/static/avatars/{filename}"}
