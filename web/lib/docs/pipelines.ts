// The jobs that move data around. The timers are set in the Railway dashboard (see docs/railway.md), not in code.
import type { PipelineDoc } from "./types";

export const PIPELINES: PipelineDoc[] = [
  { id: "runs", name: "Runs", trigger: "Every 15 minutes on Railway", reads: "Your runs, run details and strength sessions from COROS", writes: ["runs", "strength_sessions", "strength_sets"],
    run: "python -m ingest.coros_runs --days 7 --apply", file: "ingest/coros_runs.py" },
  { id: "health", name: "Health", trigger: "Every 3 hours on Railway", reads: "Sleep, HRV, heart rate, stress, load, recovery and fitness from COROS (the last 3 days)", writes: ["health_daily", "recovery_snapshots"],
    run: "python -m ingest.coros_health --apply", file: "ingest/coros_health.py" },
  { id: "watch", name: "Watch sending", trigger: "Every 5 minutes on Railway", reads: "Runs you approved, the plan, your latest check in, and what is already on the watch", writes: ["approvals"],
    run: "python -m ingest.watch_sync", file: "ingest/watch_sync.py" },
  { id: "coach", name: "Coach service", trigger: "Always on. It answers when the web app sends a message.", reads: "Your health, runs, plan and library, as you", writes: ["chat_threads", "chat_messages", "coach_memory", "llm_calls"],
    run: "python -m coach.serve", file: "coach/api.py" },
  { id: "login", name: "COROS login (once)", trigger: "By hand, on your own computer", reads: "Nothing. It opens a browser for you to log in.", writes: ["coros_tokens"],
    run: "python -m ingest.coros_login", file: "ingest/coros_login.py" },
  { id: "import", name: "Plan import (once)", trigger: "By hand, once. It refuses a second run.", reads: "data/paris_marathon_2027_v5_1_coros_ready.json", writes: ["plan_versions", "plan_weeks", "plan_days", "gates"],
    run: "python -m ingest.import_plan --apply", file: "ingest/import_plan.py" },
  { id: "proposal", name: "Draft plan check", trigger: "By hand, when ChatGPT sends back a plan", reads: "The new plan JSON and the plan of record", writes: ["plan_proposals"],
    run: "python -m coach.check_proposal plan.json --save", file: "coach/check_proposal.py" },
];
