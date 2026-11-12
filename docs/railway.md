# Railway setup

Railway runs the web app and the scheduled COROS jobs. Settings are typed into Railway's dashboard, not kept in config files, because Railway is retiring `railway.json` (it stops working for existing services on 2026-12-01) and its replacement is still experimental. See docs/decisions.md. If a service is lost, rebuild it from this page.

All services deploy from the private GitHub repository, branch `main`.

## Service: web
* Root directory: `/web`
* Build: Railway detects Next.js. Build command `npm run build`, start command `npm start`.
* Variables (public values only, set before the first build because Next bakes `NEXT_PUBLIC_` values into the build):
  * `NEXT_PUBLIC_SUPABASE_URL`
  * `NEXT_PUBLIC_SUPABASE_ANON_KEY`
* Never put `SUPABASE_SERVICE_ROLE_KEY` here.
* `COACH_API_URL` (server side only, so no `NEXT_PUBLIC_`): the private address of the coach service, `http://coach-api.railway.internal:8000`. It can be set after the first deploy. Without it the Chat tab says the coach is not connected.
* Networking: generate a public domain (https). The iPhone install needs https.
* The live address: https://fitness-coach-production-e7b2.up.railway.app (public, nothing secret in it; every page except the login needs you to sign in).

## Service: coach-api (the coach, always on)
Runs the coach for the Chat tab. The web service sends it your message and your login token over Railway's **private network**. It has **no public domain**, so nothing on the internet can reach it. Its own login check is a second lock. See docs/decisions.md.
* Root directory: `/` (repo root)
* Start command: `uvicorn coach.api:build_app --factory --host 0.0.0.0 --port $PORT`
  * `--host 0.0.0.0` listens on IPv4. Railway's health check connects over IPv4, and the first deploy with `--host ::` failed all 11 checks with "service unavailable" (`::` accepted IPv6 only there).
  * This needs an environment made after 16 Oct 2025, where private names resolve to IPv4 and IPv6. In an older (legacy) environment the private network is IPv6 only, and then the web service could not reach the coach on `0.0.0.0`. This project started in November 2026, so it should be fine. The first message from the Chat tab is the real test.
* Variables (typed by Vicky): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `COACH_ENABLED` (`true`), `PORT` (`8000`, set it yourself so the private address is known).
* Health check path: `/healthz` (answers `{"ok": true}`, no data).
* Networking: do NOT generate a public domain. The private name is `coach-api.railway.internal`, so the address for the web service is `http://coach-api.railway.internal:8000`.
* Switch off: set `COACH_ENABLED` to `false` and redeploy. Every chat then answers 503 and no model is called.
* Logs hold error types and counts only. If you ever see a message, a token or a key in them, stop the service and tell me.
* After the first deploy, check the private route (Railway's docs do not say whether a service with no public domain is reachable privately, so we confirm it): send one message from the Chat tab.

## Service: runs (cron, pulls runs from COROS)
* Root directory: `/` (repo root)
* Start command: `python -m ingest.coros_runs --days 7 --apply`
* Cron schedule: `*/15 * * * *` (every 15 minutes, UTC). Railway's smallest allowed interval is 5 minutes. COROS publishes no limit for this call, so watch the logs for errors. A run still only appears after the COROS phone app has synced the watch.
* Variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `COROS_MCP_URL`
* The job must exit when finished. It does. It logs counts only, never tokens.

## Service: watch (cron, sends approved workouts to the watch)
Added in part 2 of the plan. Same root directory and variables as `runs`. Cron `*/5 * * * *`.

## Service: health (cron, pulls sleep, HRV, heart rate, stress, training load, recovery and fitness from COROS)
* Root directory: `/` (repo root)
* Start command: `python -m ingest.coros_health --apply`
* Cron schedule: `7 */3 * * *` (every 3 hours at 7 minutes past, UTC). The offset keeps it away from the runs job, which fires on :00, :15, :30 and :45, because both jobs may refresh the same COROS login.
* Variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `COROS_MCP_URL` (same as `runs`)
* Each run reads the last 3 days. The first load of history is done once by hand with `python -m ingest.coros_health --backfill --apply`.
* The job must exit when finished. It does. It logs counts only, never tokens.

## After a change
* Push to `main`. Railway rebuilds the services that use that code.
* Check a cron job by pressing "Run now" in the dashboard and reading its logs. There must be no tokens or keys in them.
* Secrets are typed into the dashboard by Vicky. Never paste them into chat or commit them.
