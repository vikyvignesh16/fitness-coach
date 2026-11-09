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
* More tools exist: `getActivityDetail`, `queryActivityLapData` (need labelId and sportType). Health tools below were called for real on 2026-11-09 (task 2 of the dashboard work). All answers are text inside a JSON string, like `querySportRecords`. Parsers must fail loudly if a line is missing.

## Health tools (VERIFIED 2026-11-09, read only)
* `querySleepOverview(startDate, endDate)`: one block per wake-up day. Fields: Sleep Score, Daily Sleep (incl. naps), Main Sleep (asleep), Main Sleep Period (incl. awake), Deep/Light/REM/Awake **ratios in percent**, Awake Time, Awake Count, Main Sleep Window, Naps Total. **Days with no sleep recorded say `Sleep Score: 0` and "Sleep detail for this day is not available yet." Treat that as missing, never as a score of zero.** History went back to 2026-08-27 when asked for 120 days. Today's entry can be partial (the night is still being recorded).
* `querySleepHrv(startDate, endDate)`: max 7 days per call, but any past window works (checked 60 days back). Per wake-up day: HRV Avg (ms), a label (Low, Below normal, Normal), **Normal Range and Baseline for that date** (they shift day to day), then a raw series with a point about every 10 minutes (timestamp, hrv, status, confidence). "No data" days exist.
* `queryRecoveryStatus()`: current only. Text: `Recovery: 96%`, `Level: Fresh`, `Estimated Full Recovery: 15h`. No history, so we must save it ourselves.
* `queryDailyHealthData(days)`: per day Steps, Calories, Exercise minutes, Stress avg, and a Sleep Summary in **minutes** (Total, Deep, Light, REM, Awake) plus Sleep HR avg/min/max. Header has the current Resting HR and HRV Baseline. Went back to 2026-07-13 for 120 days. Days with no data are missing or show zeros (zero steps there means no watch data, not a real zero).
* `queryRestingHeartRate(days)`: one line per day, `55 bpm` or `No data`. Back to 2026-08-27.
* `queryAvgHeartRate(startDate, endDate)`: all-day average with Min and Max. This is not resting heart rate.
* `queryStressLevel(days)`: Average Stress per day. The Relaxed/Low/Medium/High split said `No data` every day. Back to 2026-08-27.
* `queryTrainingLoadAssessment(days)`: per day `Comment` (Performance, Maintaining, Optimized, Resuming, Decreasing), `Short-Term Load`, `Long-Term Load`, `Load Ratio`. **Capped at about 30 days of history** even when 120 is asked. It does NOT give a per day training load total.
* `queryFitnessAssessmentOverview()`: current only. VO2max, Running Level, Threshold Pace (`3:57 /km`), 5 km, 10 km, Half Marathon and Marathon predictions. No history, so we must save it.
* FIT file download is limited to 50 files per day.

## Writing to the watch (needs Vicky's approval every time)
* Nothing is written until Vicky approves in the app. No exceptions.
* Tools: `createScheduledWorkout(date, course)` puts one run straight on the calendar. `createSingleWorkout(course)` saves to the library only. `scheduleWorkout(workoutId, date)` puts a library workout on the calendar. `updateScheduledWorkout` edits one date.
* Dates must be from today to 90 days ahead, one workout per call. A 23 week plan has to go in chunks.
* There are NO delete tools. A wrong workout can only be removed in the COROS app by Vicky. This is why approval comes first.
* Strength workouts cannot be created through the MCP. Gym sessions are logged in our own tables (see docs/decisions.md).
* VERIFIED 2026-11-02: `createScheduledWorkout` accepts the `course` built by `ingest/watch_course.to_course()` (sections with sectionType, targetType, targetValue, and pace as intensityType 2 with start and end in seconds per km). Three real workouts (a plain run, a strides session with a repeat group, an easy run) were created and appeared on the calendar.
* The answer to a successful create contains `idInPlan`, a small counting number per standalone workout (1, 2, 3). `ingest/watch_sync.py` only counts a send as done when it finds it.
* `queryTrainingSchedule(startDate, endDate)` returns text. Empty: `No training schedule found.` Otherwise each workout shows its name, `idInPlan`, distance, estimated time. The job uses the workout NAME (which carries the date) to spot a workout already on the calendar.
* COROS adds up only the fixed parts of a workout for distance, so a strides session (strides have no distance) and runs ending in an open cool down show less than the plan's total.
* The `coros_workout` blocks in plan v5.1 are a staging format, not importable as they are. They are translated by `to_course()`.
