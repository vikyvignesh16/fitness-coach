"""The list of tools the coach may use, in one place. To see what the agent can do, read this file.

Every tool here is read only except save_memory, which writes one short fact. A new tool must be added to this list and must pass coach/tests/test_tool_rules.py.
"""
from dataclasses import dataclass
from datetime import datetime
from typing import Callable

from coach.memory import add_fact
from coach.memory_tools import make_save_memory_tool
from coach.tools import (Fetch, PlanFetch, RunsFetch, health_fetcher, make_health_tool, make_plan_day_tool, make_runs_tool,
                         plan_fetcher, runs_fetcher)


@dataclass(frozen=True)
class ToolSpec:
    name: str
    fn: Callable
    reads: tuple[str, ...]  # the tables it reads. A review of what the agent can see starts here
    writes: tuple[str, ...] = ()  # the tables it changes. Empty for a read only tool. Every entry must be on the approved list in the rules test


@dataclass(frozen=True)
class Readers:
    health: Fetch
    runs: RunsFetch
    plan_day: PlanFetch


@dataclass(frozen=True)
class Writers:
    save_fact: Callable[[str], None]  # saves one remembered fact. The only way a tool can change anything


def supabase_writers(sb, owner: str) -> Writers:
    return Writers(save_fact=lambda fact: add_fact(sb, owner, fact, "chat"))


def supabase_readers(sb, owner: str) -> Readers:
    return Readers(health=health_fetcher(sb, owner), runs=runs_fetcher(sb, owner), plan_day=plan_fetcher(sb, owner))


def build_tools(readers: Readers, writers: Writers, now: datetime | None = None) -> list[ToolSpec]:
    return [
        ToolSpec("get_recent_health", make_health_tool(readers.health, now), ("health_daily",)),
        ToolSpec("get_recent_runs", make_runs_tool(readers.runs, now), ("runs",)),
        ToolSpec("get_plan_day", make_plan_day_tool(readers.plan_day), ("plan_versions", "plan_days")),
        ToolSpec("save_memory", make_save_memory_tool(writers.save_fact), reads=("coach_memory",), writes=("coach_memory",)),
    ]
