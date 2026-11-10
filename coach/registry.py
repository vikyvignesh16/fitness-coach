"""The list of tools the coach may use, in one place. To see what the agent can do, read this file.

Every tool here is read only. A new tool must be added to this list and must pass coach/tests/test_tool_rules.py.
"""
from dataclasses import dataclass
from datetime import datetime
from typing import Callable

from coach.tools import (Fetch, PlanFetch, RunsFetch, health_fetcher, make_health_tool, make_plan_day_tool, make_runs_tool,
                         plan_fetcher, runs_fetcher)


@dataclass(frozen=True)
class ToolSpec:
    name: str
    fn: Callable
    reads: tuple[str, ...]  # the tables it reads. A review of what the agent can see starts here


@dataclass(frozen=True)
class Readers:
    health: Fetch
    runs: RunsFetch
    plan_day: PlanFetch


def supabase_readers(sb, owner: str) -> Readers:
    return Readers(health=health_fetcher(sb, owner), runs=runs_fetcher(sb, owner), plan_day=plan_fetcher(sb, owner))


def build_tools(readers: Readers, now: datetime | None = None) -> list[ToolSpec]:
    return [
        ToolSpec("get_recent_health", make_health_tool(readers.health, now), ("health_daily",)),
        ToolSpec("get_recent_runs", make_runs_tool(readers.runs, now), ("runs",)),
        ToolSpec("get_plan_day", make_plan_day_tool(readers.plan_day), ("plan_versions", "plan_days")),
    ]
