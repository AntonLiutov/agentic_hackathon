from app.auth.security import (
    generate_session_token,
    hash_password,
    hash_session_token,
    verify_password,
)


def test_password_hash_round_trip() -> None:
    password_hash = hash_password("correct-horse-battery-staple", iterations=10_000)

    assert verify_password("correct-horse-battery-staple", password_hash)
    assert not verify_password("wrong-password", password_hash)


def test_session_token_hash_is_consistent() -> None:
    token_pair = generate_session_token(secret_key="test-secret")

    assert token_pair.plain_token
    assert token_pair.token_hash == hash_session_token(
        token_pair.plain_token,
        secret_key="test-secret",
    )
