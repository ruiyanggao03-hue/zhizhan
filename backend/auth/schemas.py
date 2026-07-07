from pydantic import BaseModel, Field, field_validator
import re


class RegisterRequest(BaseModel):
    phone: str = Field(..., min_length=11, max_length=11, pattern=r"^1[3-9]\d{9}$")
    password: str = Field(..., min_length=8, max_length=64)
    sms_code: str | None = None  # 可选：上线后去掉短信验证

    @field_validator("password")
    @classmethod
    def password_strength(cls, v):
        if not re.search(r"[A-Za-z]", v) or not re.search(r"\d", v):
            raise ValueError("密码必须包含字母和数字")
        if len(v) < 8:
            raise ValueError("密码长度至少8位")
        common_passwords = ["12345678", "password", "88888888", "11111111", "00000000"]
        if v.lower() in common_passwords:
            raise ValueError("密码过于简单，请使用更复杂的密码")
        return v

    @field_validator("phone")
    @classmethod
    def phone_format(cls, v):
        if not re.match(r"^1[3-9]\d{9}$", v):
            raise ValueError("请输入正确的11位手机号")
        return v


class LoginRequest(BaseModel):
    phone: str = Field(..., min_length=11, max_length=11)
    password: str = Field(..., min_length=1)


class SendSmsRequest(BaseModel):
    phone: str = Field(..., min_length=11, max_length=11, pattern=r"^1[3-9]\d{9}$")


class UpdateUsernameRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=30)


class ResetPasswordRequest(BaseModel):
    phone: str = Field(..., min_length=11, max_length=11, pattern=r"^1[3-9]\d{9}$")
    old_password: str = Field(..., min_length=1)  # 用旧密码验证身份
    new_password: str = Field(..., min_length=8, max_length=64)

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v):
        if not re.search(r"[A-Za-z]", v) or not re.search(r"\d", v):
            raise ValueError("密码必须包含字母和数字")
        if len(v) < 8:
            raise ValueError("密码长度至少8位")
        common_passwords = ["12345678", "password", "88888888", "11111111", "00000000"]
        if v.lower() in common_passwords:
            raise ValueError("密码过于简单，请使用更复杂的密码")
        return v


class UserInfoResponse(BaseModel):
    id: str
    phone: str
    username: str
    avatar_url: str | None = None
