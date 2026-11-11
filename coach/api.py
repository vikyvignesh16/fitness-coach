"""The coach service: a small web server that lets the app talk to the coach.

It exists because the web app (Next.js) cannot run Google ADK. The web app sends one message, this service runs one coach turn
(coach/chat.py, with every guardrail) and sends the answer back.

How you are recognised: the web app passes your login token (the "wristband"). This service asks Supabase whose it is.
The user id comes ONLY from that answer, never from anything written in the message.

Two database clients, on purpose:
  user client     carries your token, so Row Level Security limits every tool read to your rows
  service client  the master key, used only for what the tables reserve for the service (saving messages and facts, cost
                  receipts, the cap), and always pinned to the user id found above

Everything the service needs is passed into create_app, so tests run it with fakes and a scripted model.
Logs hold error types and counts only. Never the message, the answer, a token or a key.
"""
import asyncio
import logging
import os
import re
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Callable

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from coach.chat import run_turn
from coach.embeddings import Post
from coach.first_call import MODEL
from coach.guard import ModelGuard
from coach.memory import create_thread
from coach.registry import supabase_readers, supabase_writers

log = logging.getLogger("coach.api")

MAX_TEXT = 2000
MAX_TOKEN_CHARS = 4096
MAX_BODY_BYTES = 10_000  # a 2000 character message is well under this, even with every character multi byte
TURNS_PER_HOUR = 20
TURN_TIMEOUT_S = 90
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


class ChatIn(BaseModel):
    model_config = ConfigDict(extra="forbid")  # a field we did not ask for (like a user id) is refused, not ignored

    text: str = Field(max_length=MAX_TEXT)
    thread_id: str | None = None

    @field_validator("text")
    @classmethod
    def not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("blank")
        return value.strip()

    @field_validator("thread_id")
    @classmethod
    def looks_like_an_id(cls, value: str | None) -> str | None:
        if value is not None and not UUID.match(value):
            raise ValueError("not an id")
        return value


@dataclass(frozen=True)
class Deps:
    verify_token: Callable[[str], str | None]  # token -> user id, or None if it is not a real, current login
    user_client: Callable[[str], object]  # token -> a database client that carries the user's login
    service_client: object  # the master key client. Writes only, always with the verified user id
    make_llm: Callable[[], object]
    embed_post: Post | None = None
    enabled: Callable[[], bool] = lambda: os.environ.get("COACH_ENABLED", "true").strip().lower() != "false"
    clock: Callable[[], float] = time.monotonic
    turns_per_hour: int = TURNS_PER_HOUR
    timeout_s: float = TURN_TIMEOUT_S


def _fail(status: int, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": message})


def _bearer(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token or len(token) > MAX_TOKEN_CHARS:
        return None
    return token


# These libraries log the full text of an error, and an error from the model call can repeat what was sent to it.
NOISY_LOGGERS = ("google_adk", "google_genai", "LiteLLM", "litellm", "openai")


def quiet_third_party_logs() -> None:
    """Keep message text out of the logs. Our own lines say only the error type, so this loses nothing we need."""
    for name in NOISY_LOGGERS:
        logging.getLogger(name).setLevel(logging.CRITICAL)


def create_app(deps: Deps) -> FastAPI:
    quiet_third_party_logs()
    # No automatic docs pages: they would describe the service to anyone who reaches it.
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    recent: dict[str, deque] = defaultdict(deque)  # user id -> times of recent turns
    busy: dict[str, asyncio.Lock] = {}  # user id -> a lock, so one turn runs at a time

    def not_accepted(fields: list[str]) -> JSONResponse:
        # The default answer repeats the input back. Ours says only which field was wrong, never the text.
        return _fail(422, f"The request was not accepted. Check: {', '.join(sorted(set(fields))) or 'the request'}.")

    @app.exception_handler(RequestValidationError)
    async def bad_request(request: Request, exc: RequestValidationError):
        return not_accepted([str(e["loc"][-1]) for e in exc.errors() if e.get("loc")])

    @app.get("/healthz")
    async def healthz():
        return {"ok": True}

    @app.post("/chat")
    async def chat(request: Request):
        if not deps.enabled():
            return _fail(503, "The coach is switched off.")
        token = _bearer(request)
        try:
            owner = deps.verify_token(token) if token else None
        except Exception as err:  # a verifier that fails is treated like a bad token
            log.warning("token check failed: %s", type(err).__name__)
            owner = None
        if not owner:
            return _fail(401, "Please sign in again.")

        # Only now, after the login is proven, is the body read.
        if int(request.headers.get("content-length") or 0) > MAX_BODY_BYTES:
            return _fail(413, "That message is too long.")
        try:
            body = ChatIn.model_validate(await request.json())
        except ValidationError as err:
            return not_accepted([str(e["loc"][-1]) for e in err.errors() if e.get("loc")])
        except ValueError:  # not JSON at all
            return not_accepted(["body"])

        lock = busy.setdefault(owner, asyncio.Lock())
        if lock.locked():
            return _fail(409, "The coach is still answering your last message.")
        async with lock:
            now = deps.clock()
            times = recent[owner]
            while times and now - times[0] > 3600:
                times.popleft()
            if len(times) >= deps.turns_per_hour:
                return _fail(429, f"That is {deps.turns_per_hour} messages in the last hour. Please wait a little.")

            user_sb = deps.user_client(token)
            service_sb = deps.service_client
            new_thread = body.thread_id is None
            if new_thread:
                thread_id = create_thread(service_sb, owner, body.text[:60])
            else:
                thread_id = body.thread_id
                mine = user_sb.table("chat_threads").select("id").eq("id", thread_id).execute().data  # Row Level Security answers
                if not mine:
                    return _fail(404, "That conversation was not found.")

            times.append(now)
            try:
                result = await asyncio.wait_for(
                    run_turn(service_sb, owner, thread_id, body.text, llm=deps.make_llm(),
                             guard=ModelGuard(service_sb, owner, purpose="chat", model=MODEL),
                             readers=supabase_readers(user_sb, owner, embed_post=deps.embed_post, log_sb=service_sb),
                             writers=supabase_writers(service_sb, owner)),
                    timeout=deps.timeout_s)
            except asyncio.TimeoutError:
                _forget_empty_thread(service_sb, owner, thread_id, new_thread)
                return _fail(504, "The coach took too long. Please try again.")
            except Exception as err:
                log.warning("chat turn failed: %s", type(err).__name__)  # the type only: a message could hold the user's text
                _forget_empty_thread(service_sb, owner, thread_id, new_thread)
                return _fail(500, "Something went wrong. Please try again.")

            if new_thread and (result.blocked or result.stopped):
                _forget_empty_thread(service_sb, owner, thread_id, new_thread)  # nothing was saved, so do not leave an empty chat
                thread_id = None
            return {"thread_id": thread_id, "reply": result.reply, "revised": result.revised, "replaced": result.replaced,
                    "blocked": result.blocked, "stopped": result.stopped}

    return app


def _forget_empty_thread(service_sb, owner: str, thread_id: str, was_new: bool) -> None:
    """A new conversation whose first turn failed has no messages. Remove it so the list of chats stays clean."""
    if was_new:
        service_sb.table("chat_threads").delete().eq("user_id", owner).eq("id", thread_id).execute()


# ---------------------------------------------------------------- the real thing, started by uvicorn
def _need(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"{name} is not set.")  # the name only
    return value


def real_deps() -> Deps:
    import litellm
    from google.adk.models.lite_llm import LiteLlm
    from supabase import create_client

    litellm.suppress_debug_info = True  # no "give feedback" banners that print the failing request

    url, anon, service = _need("SUPABASE_URL"), _need("SUPABASE_ANON_KEY"), _need("SUPABASE_SERVICE_ROLE_KEY")
    _need("OPENROUTER_API_KEY")  # read by LiteLLM from the environment. Checked here so a missing key fails at start, not mid chat
    anon_sb = create_client(url, anon)

    def verify_token(token: str) -> str | None:
        user = anon_sb.auth.get_user(token).user  # Supabase checks the token and says whose it is
        return user.id if user else None

    def user_client(token: str):
        client = create_client(url, anon)
        client.postgrest.auth(token)  # every query from this client now runs as the signed in user
        return client

    return Deps(verify_token=verify_token, user_client=user_client, service_client=create_client(url, service),
                make_llm=lambda: LiteLlm(model=f"openrouter/{MODEL}"))


def build_app() -> FastAPI:
    """uvicorn coach.api:build_app --factory"""
    logging.basicConfig(level=logging.INFO)
    return create_app(real_deps())
