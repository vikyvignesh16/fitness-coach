"""One time COROS login. Run on your own computer, never on the server.

Registers an OAuth client with COROS, opens your browser, catches the redirect on 127.0.0.1,
and saves the tokens in the coros_tokens table. Tokens are never printed.
"""
import os
import secrets
import sys
import webbrowser
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlsplit

import httpx
from dotenv import load_dotenv

from ingest import coros_auth as auth

PORT = 8765
REDIRECT_URI = f"http://127.0.0.1:{PORT}/callback"


def wait_for_callback(expected_state: str) -> str:
    result: dict = {}

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            query = parse_qs(urlsplit(self.path).query)
            result["code"] = (query.get("code") or [None])[0]
            result["state"] = (query.get("state") or [None])[0]
            result["error"] = (query.get("error") or [None])[0]
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"COROS login done. You can close this tab.")

        def log_message(self, *args):  # keep the code out of the terminal
            pass

    server = HTTPServer(("127.0.0.1", PORT), Handler)
    server.handle_request()
    server.server_close()
    if result.get("error"):
        sys.exit(f"COROS returned an error: {result['error']}")
    if result.get("state") != expected_state:
        sys.exit("State did not match. Stopping, in case this was not your login.")
    if not result.get("code"):
        sys.exit("No code came back from COROS.")
    return result["code"]


def main() -> None:
    load_dotenv()
    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    mcp_url = os.environ.get("COROS_MCP_URL", "https://mcpeu.coros.com/mcp")

    with httpx.Client(timeout=30) as http:
        meta = auth.discover(http, mcp_url)
        client_id = auth.register_client(http, meta, REDIRECT_URI)
        verifier, challenge = auth.make_pkce()
        state = secrets.token_urlsafe(16)
        url = auth.authorize_url(meta, client_id, REDIRECT_URI, challenge, state)
        print("Opening your browser to sign in to COROS. If nothing opens, copy this link:\n" + url)
        webbrowser.open(url)
        code = wait_for_callback(state)
        tokens = auth.exchange_code(http, meta, client_id, REDIRECT_URI, code, verifier)
        row = auth.to_row(tokens, mcp_url, client_id, datetime.now(timezone.utc))
        auth.save_tokens(sb, row)
    print("Saved COROS tokens. Access token runs out at", row["access_expires_at"])


if __name__ == "__main__":
    main()
