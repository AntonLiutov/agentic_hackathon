from collections.abc import Iterator
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        test_client.app.state.database.ping = AsyncMock(return_value=True)
        test_client.app.state.redis.ping = AsyncMock(return_value=True)
        yield test_client
