# Athlete App

A personal training app for one user (Vicky). It tracks runs from a COROS watch, holds a marathon plan, logs meals and gym sessions, and runs a weekly physique check in. Target race: Paris Marathon, Sunday 4 April 2027. Goals: A 3:15, B 3:20, C 3:30, stretch 3:00 to 3:15.

Full project plan lives in the Claude doc "Athlete App: Project Plan". This file is the short version Claude Code needs in every session.

## Who plans what (do not blur this)

* ChatGPT, called through OpenRouter, decides ALL training, gym and nutrition planning.
* Code only checks hard safety limits. If a limit is broken, code sends the violations back to the model for a revised plan. Code never silently edits a plan.
* Nothing is written to the COROS watch until Vicky approves it in the app.
* Claude Code owns software architecture, the build and the explanations.

## Plan of record

Plan v5.1 (file: data/paris_marathon_2027_v5_1_coros_ready.json), approved 2 November 2026. 23 weeks from 2026-10-26. It has gates: ankle_return_w2, persistent_pain_stop, long_run_25k_gate. Treat the JSON as the source of truth and import it as is. If the model produces a new version, store it as a new version in plan_changes. Never overwrite v5.1.

## Stack

* Database: Supabase Postgres (EU region), Row Level Security on every table
* Watch data: official COROS MCP (see the coros-mcp skill)
* Models: OpenRouter, OpenAI models (GPT-6 Luna for cheap chat and photos, GPT-6 Sol for plans and weekly reviews)
* Backend and jobs: Railway (paid plan already in place)
* Agents: Google ADK for the coach agent, with the LiteLlm wrapper for OpenRouter
* Web app: Next.js (App Router), TypeScript, Tailwind, shadcn/ui, Recharts, Supabase Auth, installed on the iPhone as a PWA
* Reference data: USDA FoodData Central, Open Food Facts, free-exercise-db, a curated evidence library in Supabase

## How to work with Vicky

* Plan first. For any new feature, use plan mode and show the plan before writing code.
* Explain every choice. When you pick a tool, library or approach, say what it is, why you chose it, and what the alternatives were. Then record it in docs/decisions.md (see the decision-log skill). Vicky researches these later to improve the app.
* Write plain, conversational prose. No dashes in sentences, no AI buzzwords, no hype. Short sentences. Explain jargon the first time it appears.
* Build the smallest working version first, then improve it. Vicky wants tracking running early.
* Ask before anything that cannot be undone: deleting data, rewriting a plan, writing to the watch, changing the database in a way that loses rows.
* Work in small steps and run the tests after each one.
* One Git branch per task (`task-NN-short-name`). Commit small steps there. Merge to `main` and push only after Vicky approves the task, because Railway deploys `main`.

## Hard rules

* Secrets (OpenRouter key, Supabase keys) live only in environment variables. Never commit them, never print them, never put them in logs. Keep .env in .gitignore and maintain .env.example with names only.
* One exception: COROS login tokens rotate on every refresh, so they live in the coros_tokens table (service role only, RLS on, no policies). Same rules: never print them, never log them, never show them in the app. See docs/decisions.md.
* Photos (meals, physique) go to private storage. No public URLs. Use signed URLs that expire.
* Safety limits are plain tested functions (see the safety-rules skill). Do not weaken a limit to make a test pass. Do not move a limit into a prompt.
* Estimates from the model are ranges, never one exact number. Meal photo results need Vicky's confirmation before saving.
* Any health or exercise claim shown to Vicky must cite an id from the evidence library. A code check rejects uncited ids.
* The app is for one user. Do not build multi user features.
* This is not medical advice. Persistent pain stops the plan and tells Vicky to see a professional.

## Commands

Fill these in as the project grows. Keep them current.

* Install (Python): `uv sync --python 3.12`. Homebrew is not on the shell PATH, so use `export PATH=/opt/homebrew/bin:$HOME/.local/bin:$PATH` first.
* Run tests (Python): `uv run --python 3.12 pytest -q`
* Web app (run from web/, with `export PATH=/opt/homebrew/bin:$PATH`): `npm run dev` to run locally, `npm test` for tests, `npm run typecheck`, `npm run build`. Next.js 16: read `web/node_modules/next/dist/docs/` before writing Next code, because it differs from older versions (for example `middleware` is now `proxy`).
* Apply database migrations: `supabase db push --remote --dry-run`, then `supabase db push --remote --yes`. Always pass `--remote`, because the CLI defaults to a local database.
* Read only SQL against the live database: `supabase db query --remote --read-only "select ..."`
* Import plan (dry run, then write): `uv run --python 3.12 python -m ingest.import_plan` and add `--apply`. It refuses to run twice.
* COROS first login (once, on Vicky's own computer, opens a browser): `uv run --python 3.12 python -m ingest.coros_login`. Details in the coros-mcp skill.
* Coach service locally (needs SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY in .env): `uv run --python 3.12 --env-file .env uvicorn coach.api:build_app --factory --port 8000`. On Railway it runs as the private service coach-api (docs/railway.md). `COACH_ENABLED=false` switches it off.
* Pull runs from COROS (dry run, then save, safe to repeat): `uv run --python 3.12 python -m ingest.coros_runs --days 14` and add `--apply`.
* Note: the Supabase CLI refuses write SQL on the live project unless Vicky agrees, so ask before using `db query` without `--read-only`.
* Supabase project ref: jmandamylkmejkgosqvg (eu-west-1). v5.1 is imported as plan_versions id a3204de5-db42-484a-86a9-558344b3eae7.

## Repo layout (target)

* data/ plan JSON files, read only
* supabase/migrations/ SQL migrations, one file per change
* ingest/ the COROS ingestion job
* coach/ ADK agents and the safety checks
* web/ the Next.js app
* docs/decisions.md the decision log
* .claude/skills/ project skills

## Current status

Phase 1 (Foundation), started 2 November 2026. Working version due Sunday 8 November: tracking, plan import, dashboard, approval page, watch link, first weekly check in.
