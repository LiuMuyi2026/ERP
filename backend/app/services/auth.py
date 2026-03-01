import asyncio
from datetime import datetime, timedelta
from jose import jwt
from passlib.context import CryptContext
from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


async def verify_password_async(plain: str, hashed: str) -> bool:
    return await asyncio.to_thread(pwd_context.verify, plain, hashed)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


async def get_password_hash_async(password: str) -> str:
    return await asyncio.to_thread(pwd_context.hash, password)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    to_encode["exp"] = expire
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def create_token_for_platform_admin(admin_id: str, email: str) -> str:
    return create_access_token({
        "sub": str(admin_id), "email": email, "role": "platform_admin",
        "tenant_id": None, "tenant_slug": None, "permissions": ["*"],
    })


def create_token_for_tenant_user(user_id, email, role, tenant_id, tenant_slug, permissions, full_name=None, avatar_url=None):
    return create_access_token({
        "sub": str(user_id), "email": email, "role": role,
        "tenant_id": str(tenant_id), "tenant_slug": tenant_slug,
        "permissions": permissions,
        "full_name": full_name,
        "avatar_url": avatar_url,
    })
