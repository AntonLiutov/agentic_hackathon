from fastapi.testclient import TestClient


def _register_user(
    client: TestClient,
    *,
    email: str,
    username: str,
    password: str = "correct-horse-battery-staple",
) -> None:
    response = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "username": username,
            "password": password,
        },
    )
    assert response.status_code == 201


def _login_user(
    client: TestClient,
    *,
    email: str,
    password: str = "correct-horse-battery-staple",
) -> None:
    response = client.post(
        "/api/auth/login",
        json={
            "email": email,
            "password": password,
        },
    )
    assert response.status_code == 200


def test_friend_request_accept_reject_and_remove_flow(auth_client: TestClient) -> None:
    _register_user(auth_client, email="friends-alpha@example.com", username="friends.alpha")
    auth_client.post("/api/auth/logout")
    _register_user(auth_client, email="friends-beta@example.com", username="friends.beta")
    auth_client.post("/api/auth/logout")
    _register_user(auth_client, email="friends-gamma@example.com", username="friends.gamma")
    auth_client.post("/api/auth/logout")

    _login_user(auth_client, email="friends-alpha@example.com")

    send_request_response = auth_client.post(
        "/api/friends/requests",
        json={
            "username": "friends.beta",
            "message": "Let's connect for the launch work.",
        },
    )
    assert send_request_response.status_code == 201
    request_payload = send_request_response.json()
    assert request_payload["recipient_username"] == "friends.beta"
    assert request_payload["status"] == "pending"

    duplicate_request_response = auth_client.post(
        "/api/friends/requests",
        json={"username": "friends.beta"},
    )
    assert duplicate_request_response.status_code == 409
    assert (
        duplicate_request_response.json()["detail"]
        == "You already sent a friend request to this user."
    )

    auth_client.post("/api/auth/logout")
    _login_user(auth_client, email="friends-beta@example.com")

    incoming_requests_response = auth_client.get("/api/friends/requests")
    assert incoming_requests_response.status_code == 200
    incoming_requests = incoming_requests_response.json()["incoming_requests"]
    assert len(incoming_requests) == 1
    assert incoming_requests[0]["requester_username"] == "friends.alpha"

    accept_request_response = auth_client.post(
        f"/api/friends/requests/{request_payload['id']}/accept"
    )
    assert accept_request_response.status_code == 200
    accepted_friend = accept_request_response.json()
    assert accepted_friend["username"] == "friends.alpha"

    beta_friends_response = auth_client.get("/api/friends")
    assert beta_friends_response.status_code == 200
    assert [friend["username"] for friend in beta_friends_response.json()["friends"]] == [
        "friends.alpha"
    ]

    auth_client.post("/api/auth/logout")
    _login_user(auth_client, email="friends-alpha@example.com")

    alpha_friends_response = auth_client.get("/api/friends")
    assert alpha_friends_response.status_code == 200
    alpha_friends = alpha_friends_response.json()["friends"]
    assert [friend["username"] for friend in alpha_friends] == [
        "friends.beta"
    ]

    remove_friend_response = auth_client.delete(f"/api/friends/{alpha_friends[0]['user_id']}")
    assert remove_friend_response.status_code == 200
    assert remove_friend_response.json()["message"] == "Friend removed."

    refreshed_alpha_friends_response = auth_client.get("/api/friends")
    assert refreshed_alpha_friends_response.status_code == 200
    assert refreshed_alpha_friends_response.json()["friends"] == []

    auth_client.post("/api/auth/logout")
    _login_user(auth_client, email="friends-gamma@example.com")

    send_gamma_request_response = auth_client.post(
        "/api/friends/requests",
        json={
            "username": "friends.alpha",
            "message": "Can we connect too?",
        },
    )
    assert send_gamma_request_response.status_code == 201

    auth_client.post("/api/auth/logout")
    _login_user(auth_client, email="friends-alpha@example.com")

    alpha_requests_response = auth_client.get("/api/friends/requests")
    assert alpha_requests_response.status_code == 200
    gamma_request = alpha_requests_response.json()["incoming_requests"][0]
    assert gamma_request["requester_username"] == "friends.gamma"

    reject_request_response = auth_client.post(
        f"/api/friends/requests/{gamma_request['id']}/reject"
    )
    assert reject_request_response.status_code == 200
    assert reject_request_response.json()["message"] == "Friend request rejected."

    refreshed_requests_response = auth_client.get("/api/friends/requests")
    assert refreshed_requests_response.status_code == 200
    assert refreshed_requests_response.json()["incoming_requests"] == []
