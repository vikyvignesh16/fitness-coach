from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest

from ingest import coros_auth as auth

MCP = "https://mcpeu.coros.com/mcp"
META = {
    "authorization_endpoint": "https://mcpeu.coros.com/oauth2/authorize",
    "token_endpoint": "https://mcpeu.coros.com/oauth2/token",
    "registration_endpoint": "https://mcpeu.coros.com/connect/register",
}
NOW = datetime(2026, 11, 3, 9, 0, tzinfo=timezone.utc)


class FakeTable:
    def __init__(self, store):
        self.store = store
        self._eq = False

    def upsert(self, row):
        self.store["row"] = row
        return self

    def select(self, *_):
        return self

    def eq(self, *_):
        return self

    def execute(self):
        row = self.store.get("row")
        return type("R", (), {"data": [row] if row else []})()


class FakeSupabase:
    def __init__(self, row=None):
        self.store = {"row": row} if row else {}

    def table(self, name):
        assert name == "coros_tokens"
        return FakeTable(self.store)


def http_returning(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


def saved_row(access_in_minutes, refresh="old-refresh"):
    return auth.to_row(
        {"access_token": "old-access", "refresh_token": refresh, "expires_in": access_in_minutes * 60},
        MCP, "client-1", NOW,
    )


def test_pkce_challenge_matches_the_rfc_7636_example():
    verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    assert auth.challenge_for(verifier) == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"


def test_make_pkce_returns_a_matching_pair():
    verifier, challenge = auth.make_pkce()
    assert auth.challenge_for(verifier) == challenge
    assert len(verifier) >= 43


def test_authorize_url_has_pkce_and_offline_access():
    url = auth.authorize_url(META, "client-1", "http://127.0.0.1:8765/callback", "chal", "st")
    q = parse_qs(urlsplit(url).query)
    assert q["code_challenge_method"] == ["S256"]
    assert q["code_challenge"] == ["chal"]
    assert q["state"] == ["st"]
    assert "offline_access" in q["scope"][0]


def test_fresh_access_token_is_used_without_calling_coros():
    sb = FakeSupabase(saved_row(access_in_minutes=60))

    def handler(request):
        raise AssertionError("should not call COROS")

    assert auth.get_access_token(sb, http_returning(handler), NOW) == "old-access"


def test_near_expiry_refreshes_and_saves_the_new_refresh_token():
    sb = FakeSupabase(saved_row(access_in_minutes=2))
    calls = []

    def handler(request):
        calls.append(request.url.path)
        if request.url.path.endswith("oauth-authorization-server"):
            return httpx.Response(200, json=META)
        body = parse_qs(request.content.decode())
        assert body["grant_type"] == ["refresh_token"]
        assert body["refresh_token"] == ["old-refresh"]
        return httpx.Response(200, json={"access_token": "new-access", "refresh_token": "new-refresh", "expires_in": 2592000})

    token = auth.get_access_token(sb, http_returning(handler), NOW)
    assert token == "new-access"
    assert sb.store["row"]["refresh_token"] == "new-refresh"
    assert sb.store["row"]["access_expires_at"] == (NOW + timedelta(days=30)).isoformat()


def test_old_refresh_token_is_kept_if_coros_sends_no_new_one():
    row = auth.to_row({"access_token": "a", "expires_in": 60}, MCP, "c", NOW, old_refresh="keep-me")
    assert row["refresh_token"] == "keep-me"


def test_no_refresh_token_anywhere_is_an_error():
    with pytest.raises(ValueError):
        auth.to_row({"access_token": "a"}, MCP, "c", NOW)


def test_failed_refresh_does_not_overwrite_saved_tokens():
    sb = FakeSupabase(saved_row(access_in_minutes=1))

    def handler(request):
        if request.url.path.endswith("oauth-authorization-server"):
            return httpx.Response(200, json=META)
        return httpx.Response(400, json={"error": "invalid_grant"})

    with pytest.raises(httpx.HTTPStatusError):
        auth.get_access_token(sb, http_returning(handler), NOW)
    assert sb.store["row"]["refresh_token"] == "old-refresh"


def test_expired_refresh_token_asks_for_a_new_login():
    sb = FakeSupabase(saved_row(access_in_minutes=1))
    with pytest.raises(RuntimeError, match="login"):
        auth.get_access_token(sb, http_returning(lambda r: None), NOW + timedelta(days=181))


def test_missing_tokens_asks_for_a_first_login():
    with pytest.raises(RuntimeError, match="login"):
        auth.get_access_token(FakeSupabase(), http_returning(lambda r: None), NOW)


def test_if_another_job_refreshed_first_we_use_its_tokens():
    """Two jobs refresh together. The second one's refresh token is dead, but the first saved a new pair."""
    sb = FakeSupabase(saved_row(access_in_minutes=1))
    newer = auth.to_row(
        {"access_token": "other-jobs-access", "refresh_token": "other-jobs-refresh", "expires_in": 2592000},
        MCP, "client-1", NOW,
    )

    def handler(request):
        if request.url.path.endswith("oauth-authorization-server"):
            return httpx.Response(200, json=META)
        sb.store["row"] = newer  # the other job saves its new pair while ours is being refused
        return httpx.Response(400, json={"error": "invalid_grant"})

    token = auth.get_access_token(sb, http_returning(handler), NOW)
    assert token == "other-jobs-access"
    assert sb.store["row"]["refresh_token"] == "other-jobs-refresh"  # we did not overwrite it


def test_a_refused_refresh_with_nothing_newer_still_raises():
    sb = FakeSupabase(saved_row(access_in_minutes=1))

    def handler(request):
        if request.url.path.endswith("oauth-authorization-server"):
            return httpx.Response(200, json=META)
        return httpx.Response(400, json={"error": "invalid_grant"})

    with pytest.raises(httpx.HTTPStatusError):
        auth.get_access_token(sb, http_returning(handler), NOW)
    assert sb.store["row"]["refresh_token"] == "old-refresh"
