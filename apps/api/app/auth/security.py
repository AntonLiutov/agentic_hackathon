from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from dataclasses import dataclass

PASSWORD_SCHEME = "pbkdf2_sha256"


def normalize_email(email: str) -> str:
    return email.strip().lower()


def normalize_username(username: str) -> str:
    return username.strip()


def hash_password(password: str, *, iterations: int) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return "$".join(
        [
            PASSWORD_SCHEME,
            str(iterations),
            base64.urlsafe_b64encode(salt).decode("ascii"),
            base64.urlsafe_b64encode(digest).decode("ascii"),
        ]
    )


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        scheme, iterations_raw, salt_raw, digest_raw = stored_hash.split("$", 3)
    except ValueError:
        return False

    if scheme != PASSWORD_SCHEME:
        return False

    iterations = int(iterations_raw)
    salt = base64.urlsafe_b64decode(salt_raw.encode("ascii"))
    expected_digest = base64.urlsafe_b64decode(digest_raw.encode("ascii"))
    candidate_digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)

    return hmac.compare_digest(candidate_digest, expected_digest)


@dataclass(frozen=True)
class SessionTokenPair:
    plain_token: str
    token_hash: str


def hash_token_value(token: str, *, secret_key: str) -> str:
    return hmac.new(secret_key.encode("utf-8"), token.encode("utf-8"), hashlib.sha256).hexdigest()


def hash_session_token(token: str, *, secret_key: str) -> str:
    return hash_token_value(token, secret_key=secret_key)


def generate_token_pair(*, secret_key: str) -> SessionTokenPair:
    plain_token = secrets.token_urlsafe(32)
    return SessionTokenPair(
        plain_token=plain_token,
        token_hash=hash_token_value(plain_token, secret_key=secret_key),
    )


def generate_session_token(*, secret_key: str) -> SessionTokenPair:
    return generate_token_pair(secret_key=secret_key)
