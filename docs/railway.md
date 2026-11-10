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
* Networking: generate a public domain (https). The iPhone install needs https.
* The live address: https://fitness-coach-production-e7b2.up.railway.app (public, nothing secret in it; every page except the login needs you to sign in).

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
