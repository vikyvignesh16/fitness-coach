---
name: coros-mcp
description: How this project talks to the official COROS MCP server. Use when touching ingest/, the COROS login, reading runs or health data, or writing workouts to the watch.
---

# COROS MCP

Facts below were checked against COROS's docs and the live server on 2026-11-02. Re-check anything marked "unverified" before relying on it.

## Connection
* Official remote MCP, Streamable HTTP. Vicky's account is on the EU server: `https://mcpeu.coros.com/mcp` (env `COROS_MCP_URL`). Other regions: global `mcp.coros.com`, US `mcpus.coros.com`, China `mcpcn.coros.com`.
* There is no API key. Login is OAuth 2.0 with PKCE. The server publishes its settings at `/.well-known/oauth-authorization-server`, including dynamic client registration.
* One time login on Vicky's own computer: `uv run --python 3.12 python -m ingest.coros_login`. It opens the browser and saves tokens.
* Python client: the `mcp` SDK (`streamable_http_client`), with `Authorization: Bearer <token>`.

## Tokens (secrets, never print or log them)
* Stored in the `coros_tokens` table, one row, readable only with the service role. This is the one allowed exception to "secrets only in env variables" (see docs/decisions.md).
* Access token lasts 30 days. Refresh token lasts 180 days. Every refresh gives a NEW refresh token and the old one stops working, so `ingest/coros_auth.get_access_token()` saves the new pair before doing anything else.
* A job that does not refresh for 180 days needs a new browser login.
* Never test refresh with a faked clock and leave the saved expiry dates wrong. That happened once and was corrected by hand.

## Reading data (read only tools, safe to call)
* `querySportRecords(startDate, endDate, sportTypeCodes, limit)`: dates are yyyyMMdd. Run codes are 100 to 103 (100 is a normal run). Strength is 402.
* The result is text inside a JSON string, with escaped newlines. `ingest/coros_runs.parse_sport_records` decodes it, checks its count against the "(N records)" header, and fails loudly if a field is missing. Do not loosen those checks.
* Each record has a `LabelId` (the activity id), start and end Unix timestamps in seconds (UTC), distance, time, pace, heart rate and calories.
* More tools exist for later: `getActivityDetail`, `queryActivityLapData` (need labelId and sportType), `querySleepHrv` (max 7 days), `queryDailyHealthData`, `queryRecoveryStatus`, `queryTrainingLoadAssessment`, `queryFitnessAssessmentOverview` (VO2max, race predictions). Their output formats are unverified. Look at one real response before writing a parser.
* FIT file download is limited to 50 files per day.

## Writing to the watch (needs Vicky's approval every time)
* Nothing is written until Vicky approves in the app. No exceptions.
* Tools: `createScheduledWorkout(date, course)` puts one run straight on the calendar. `createSingleWorkout(course)` saves to the library only. `scheduleWorkout(workoutId, date)` puts a library workout on the calendar. `updateScheduledWorkout` edits one date.
* Dates must be from today to 90 days ahead, one workout per call. A 23 week plan has to go in chunks.
* There are NO delete tools. A wrong workout can only be removed in the COROS app by Vicky. This is why approval comes first.
* Strength workouts cannot be created through the MCP. Gym sessions are logged in our own tables (see docs/decisions.md).
* The `coros_workout` blocks in plan v5.1 are a staging format and are NOT confirmed importable. The `course` format is unverified: read an existing workout with `queryWorkoutDetails` or `queryScheduledWorkoutDetails` and match it before writing the first one.
