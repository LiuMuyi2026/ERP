"""Fernet-based encryption for API keys stored per-tenant."""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


def _derive_fernet_key() -> bytes:
    """Derive a Fernet-compatible key from settings.secret_key via SHA-256."""
    digest = hashlib.sha256(settings.secret_key.encode()).digest()
    return base64.urlsafe_b64encode(digest)


_fernet = Fernet(_derive_fernet_key())


def encrypt_api_key(plaintext: str) -> str:
    """Encrypt an API key and return the ciphertext as a UTF-8 string."""
    return _fernet.encrypt(plaintext.encode()).decode()


def decrypt_api_key(ciphertext: str) -> str:
    """Decrypt a previously encrypted API key."""
    try:
        return _fernet.decrypt(ciphertext.encode()).decode()
    except InvalidToken:
        raise ValueError("Failed to decrypt API key – SECRET_KEY may have changed")


def mask_api_key(plaintext: str) -> str:
    """Return a masked version like 'sk-a****xyz9' for display."""
    if not plaintext:
        return ""
    if len(plaintext) <= 8:
        return plaintext[:2] + "****" + plaintext[-2:]
    return plaintext[:4] + "****" + plaintext[-4:]
