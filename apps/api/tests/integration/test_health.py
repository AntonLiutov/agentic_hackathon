from fastapi.testclient import TestClient


def test_healthcheck_returns_ok(client: TestClient) -> None:
    response = client.get("/healthz")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["service"] == "Agentic Chat API"


def test_meta_endpoint_returns_basic_runtime_info(client: TestClient) -> None:
    response = client.get("/api/meta")

    assert response.status_code == 200
    payload = response.json()
    assert payload["app"] == "Agentic Chat API"
    assert "environment" in payload
    assert payload["api_port"] == 8000
