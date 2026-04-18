import asyncio
from collections.abc import Iterator
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.db.models.identity import User, UserCredential, UserSession
from app.db.session import DatabaseManager
from app.main import app


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        test_client.app.state.database.ping = AsyncMock(return_value=True)
        test_client.app.state.redis.ping = AsyncMock(return_value=True)
        yield test_client


def _run(coro: object) -> object:
    return asyncio.run(coro)  # type: ignore[arg-type]


async def _prepare_identity_schema(manager: DatabaseManager) -> None:
    async with manager.engine.begin() as connection:
        await connection.run_sync(
            lambda sync_connection: User.metadata.create_all(
                sync_connection,
                tables=[User.__table__, UserCredential.__table__, UserSession.__table__],
            )
        )


@pytest.fixture
def auth_client(tmp_path: pytest.TempPathFactory) -> Iterator[TestClient]:
    database_path = tmp_path / "auth-test.sqlite3"
    manager = DatabaseManager(f"sqlite+aiosqlite:///{database_path}")
    _run(_prepare_identity_schema(manager))

    with TestClient(app) as test_client:
        original_database = test_client.app.state.database
        test_client.app.state.database = manager
        test_client.app.state.redis.ping = AsyncMock(return_value=True)

        try:
            yield test_client
        finally:
            test_client.app.state.database = original_database

    _run(manager.dispose())
