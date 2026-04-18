import asyncio
from collections.abc import Iterator
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

import app.db.models  # noqa: F401
from app.db import Base
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


async def _prepare_test_schema(manager: DatabaseManager) -> None:
    tables = [
        table
        for name, table in Base.metadata.tables.items()
        if name not in {"security_events", "moderation_events"}
    ]

    async with manager.engine.begin() as connection:
        await connection.run_sync(
            lambda sync_connection: Base.metadata.create_all(
                sync_connection,
                tables=tables,
            )
        )


@pytest.fixture
def auth_client(tmp_path: pytest.TempPathFactory) -> Iterator[TestClient]:
    database_path = tmp_path / "auth-test.sqlite3"
    manager = DatabaseManager(f"sqlite+aiosqlite:///{database_path}")
    _run(_prepare_test_schema(manager))

    with TestClient(app) as test_client:
        original_database = test_client.app.state.database
        test_client.app.state.database = manager
        test_client.app.state.redis.ping = AsyncMock(return_value=True)

        try:
            yield test_client
        finally:
            test_client.app.state.database = original_database

    _run(manager.dispose())
