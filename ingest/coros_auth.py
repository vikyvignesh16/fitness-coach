"""COROS login: OAuth 2.0 with PKCE, token refresh, and token storage in Supabase.

Tokens are never printed or logged. Every refresh gives a new refresh token and the old one
stops working, so a refreshed token is saved before anything else happens.
"""
import base64
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode, urlsplit

import httpx

SCOPE = "openid mcp.tools offline_access"
REFRESH_LIFETIME = timedelta(days=180)  # from COROS docs, the token response does not say
REFRESH_MARGIN = timedelta(minutes=5)
TABLE = "coros_tokens"


def issuer_of(mcp_url: str) -> str:
    parts = urlsplit(mcp_url)
    return f"{parts.scheme}://{parts.netloc}"


def discover(http: httpx.Client, mcp_url: str) -> dict:
    r = http.get(issuer_of(mcp_url) + "/.well-known/oauth-authorization-server")
    r.raise_for_status()
    return r.json()


def make_pkce() -> tuple[str, str]:
    """Return (verifier, challenge). The challenge is sent first, the verifier proves it was us."""
    verifier = secrets.token_urlsafe(64)
    return verifier, challenge_for(verifier)


def challenge_for(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode()).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def register_client(http: httpx.Client, meta: dict, redirect_uri: str) -> str:
    r = http.post(meta["registration_endpoint"], json={
        "client_name": "Athlete App (personal)",
        "redirect_uris": [redirect_uri],
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        "token_endpoint_auth_method": "none",
        "scope": SCOPE,
    })
    r.raise_for_status()
    return r.json()["client_id"]


def authorize_url(meta: dict, client_id: str, redirect_uri: str, challenge: str, state: str) -> str:
    return meta["authorization_endpoint"] + "?" + urlencode({
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": SCOPE,
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    })


def exchange_code(http, meta, client_id, redirect_uri, code, verifier) -> dict:
    r = http.post(meta["token_endpoint"], data={
        "grant_type": "authorization_code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "code": code,
        "code_verifier": verifier,
    })
    r.raise_for_status()
    return r.json()


def refresh(http, meta, client_id, refresh_token) -> dict:
    r = http.post(meta["token_endpoint"], data={
        "grant_type": "refresh_token",
        "client_id": client_id,
        "refresh_token": refresh_token,
    })
    r.raise_for_status()
    return r.json()


def to_row(tokens: dict, mcp_url: str, client_id: str, now: datetime, old_refresh: str | None = None) -> dict:
    """Build the coros_tokens row. Keeps the old refresh token if the response has no new one."""
    refresh_token = tokens.get("refresh_token") or old_refresh
    if not refresh_token:
        raise ValueError("COROS gave no refresh token. Check the offline_access scope.")
    return {
        "id": 1,
        "mcp_url": mcp_url,
        "client_id": client_id,
        "access_token": tokens["access_token"],
        "refresh_token": refresh_token,
        "access_expires_at": (now + timedelta(seconds=int(tokens.get("expires_in", 3600)))).isoformat(),
        "refresh_expires_at": (now + REFRESH_LIFETIME).isoformat(),
        "updated_at": now.isoformat(),
    }


def save_tokens(sb, row: dict) -> None:
    sb.table(TABLE).upsert(row).execute()


def load_tokens(sb) -> dict | None:
    data = sb.table(TABLE).select("*").eq("id", 1).execute().data
    return data[0] if data else None


def get_access_token(sb, http: httpx.Client, now: datetime | None = None) -> str:
    """Return a valid access token, refreshing and saving the rotated pair first if needed."""
    now = now or datetime.now(timezone.utc)
    row = load_tokens(sb)
    if row is None:
        raise RuntimeError("No COROS tokens saved. Run ingest/coros_login.py once.")
    if datetime.fromisoformat(row["refresh_expires_at"]) <= now:
        raise RuntimeError("COROS refresh token has expired. Run ingest/coros_login.py again.")
    if datetime.fromisoformat(row["access_expires_at"]) - now > REFRESH_MARGIN:
        return row["access_token"]
    meta = discover(http, row["mcp_url"])
    try:
        tokens = refresh(http, meta, row["client_id"], row["refresh_token"])
    except httpx.HTTPStatusError:
        # Another job may have refreshed first. COROS kills the old refresh token on every refresh,
        # so ours is now dead. Look again: if the saved pair is newer and still fresh, use it.
        latest = load_tokens(sb)
        if (
            latest
            and latest["refresh_token"] != row["refresh_token"]
            and datetime.fromisoformat(latest["access_expires_at"]) - now > REFRESH_MARGIN
        ):
            return latest["access_token"]
        raise
    new_row = to_row(tokens, row["mcp_url"], row["client_id"], now, old_refresh=row["refresh_token"])
    save_tokens(sb, new_row)
    return new_row["access_token"]
