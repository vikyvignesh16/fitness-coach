# Decision log

Newest entries at the bottom. See the decision-log skill for the format.

## 2026-10-26 Use the official COROS MCP for watch data
Chose: the official COROS MCP server.
Why: it is supported by COROS, so it should break less than unofficial scrapers, and it can read runs, sleep, HRV and write running workouts.
Alternatives: unofficial COROS libraries, Strava or Garmin style APIs.
Cost: free. Login uses OAuth, which may be hard to keep alive on a server.
Revisit when: the overnight login test fails.
Status: open

## 2026-10-26 Supabase as the data layer
Chose: Supabase Postgres on the free plan, EU region.
Why: real SQL for trends, built in login, private file storage, and a free tier that fits one user.
Alternatives: Neon, SQLite, plain files.
Cost: free (500 MB database, 1 GB storage). Projects pause after a week of inactivity.
Revisit when: photos approach 1 GB.
Status: confirmed

## 2026-10-26 OpenRouter with OpenAI models
Chose: OpenRouter to call OpenAI models (Luna for cheap chat and photos, Sol for plans and weekly reviews).
Why: one key, one bill, easy to switch models, and credits already exist.
Alternatives: calling OpenAI directly.
Cost: model prices passed through, plus a 5.5 percent fee when topping up. Rough estimate $1 to $6 a month (unverified for photos).
Revisit when: image token use is higher than expected.
Status: open

## 2026-11-02 The model plans, code only checks safety limits
Chose: ChatGPT decides all training, gym and nutrition planning. Code checks hard limits and returns violations for revision. Nothing reaches the watch without approval.
Why: Vicky wants the plan to come from the model she picked, and hard limits belong in code because code cannot be talked out of a rule.
Alternatives: code that edits plans, a second model that reviews plans.
Cost: more round trips when a limit is broken.
Revisit when: the revision loop proves slow or unreliable.
Status: confirmed

## 2026-11-02 Gym sessions live in our database, templates live in COROS
Chose: the four strength templates are created by hand in the COROS app and scheduled through the MCP. Sets, reps and loads are stored in our own tables.
Why: the COROS MCP cannot create strength workouts.
Alternatives: wait for COROS to add strength creation, or skip the watch for gym sessions.
Cost: one manual setup.
Revisit when: the COROS MCP README adds strength creation.
Status: confirmed

## 2026-11-02 Safety limits and how mileage ramp is measured
Chose: ramp measured against the last non recovery week, warning above 10 percent, fail above 15 percent. Long run cap 32 km, share warning above 45 percent and fail above 50 percent. At least 2 days with no running and 1 day with no running or heavy lifting. Maximum 1 quality session a week. No heavy legs within 72 hours of a long run, test or race.
Why: a week after a recovery week would otherwise look like a huge jump. Numbers come from Vicky. Full list in the safety-rules skill.
Alternatives: compare with the previous week only, percentage rules only, no warning level.
Cost: a few warnings on v5.1 (weeks 3, 4, 7, 11). No fails.
Revisit when: Vicky changes a number, or the warnings turn out to be noise.
Status: confirmed

## 2026-11-02 Plan v5.1 imported unchanged, ankle gate stored as written
Chose: import v5.1 as is, including the "26 km" text in the ankle gate. List it as a fix for the next revision in docs/notes_for_model.md. Week 2 stays locked until Vicky's four ankle checks are recorded as passed.
Why: the plan of record is never overwritten, and a gate that guards an injury should be recorded by a person.
Alternatives: fix the text in code, reindex weeks so week 1 is the first planned week.
Cost: one known typo in the stored plan.
Revisit when: the model produces v5.2.
Status: confirmed

## 2026-11-02 Plan tables are read only, enforced by the database
Chose: the full v5.1 JSON is stored in plan_versions.source, with weeks, days and gates expanded into their own tables. Database triggers block any update or delete on those four tables. A new model plan is a new version row, and plan_changes records why.
Why: CLAUDE.md says never overwrite v5.1. A database rule holds even if a bug or a script tries.
Alternatives: rely on app code only, or one big JSON column with no expanded tables.
Cost: a mistaken import cannot be edited, only replaced with a new version.
Revisit when: the import script needs a re-run after a schema change.
Status: open

## 2026-11-02 Python 3.12 with uv for ingest and coach code
Chose: Python 3.12 managed by uv, with supabase-py and pytest. Config in pyproject.toml at the repo root.
Why: Google ADK needs a newer Python than the 3.9 that ships with the Mac. uv installs the right version per project and keeps it out of the system Python. The COROS job and the coach agent share one environment.
Alternatives: pip with venv, poetry, writing the jobs in TypeScript with the web app.
Cost: one more tool to learn. Railway needs a matching Python 3.12 setup later.
Revisit when: the Railway deploy is set up.
Status: open

## 2026-11-02 Plan v5.1 imported and protected
Chose: imported through ingest/import_plan.py with the service role key. Dry run by default, refuses to run twice.
Why: the import is the only write the plan tables ever get. Checked after import: 23 weeks, 161 days, 3 gates, stored JSON identical to the file, and the database blocked an edit, a delete and a day change.
Alternatives: pasting SQL by hand.
Cost: the service role key bypasses RLS, so it stays in .env and only the jobs use it.
Revisit when: the model produces v5.2.
Status: confirmed

## 2026-11-02 COROS login: self registered OAuth client, tokens in a locked Supabase table
Chose: the ingest job registers its own OAuth client with COROS (dynamic registration, PKCE), Vicky logs in once in a browser, and the job then refreshes tokens by itself. Tokens live in the coros_tokens table, readable only with the service role. This is the one exception to "secrets only in environment variables".
Why: COROS has no API key. Access tokens last 30 days and refresh tokens 180 days, but each refresh issues a new refresh token and the old one stops working. A job cannot rewrite its own Railway variables, so env variables alone would lock us out after the first refresh.
Alternatives: rewrite Railway variables through the Railway API, or log in by hand every 30 days.
Cost: tokens sit in the database. Mitigated by RLS with no policies and revoked grants. A job that stays down for 180 days needs a new browser login.
Revisit when: the overnight refresh test fails, or COROS adds API keys.
Status: open

## 2026-11-02 Read COROS through the official MCP Python SDK, parse its text output
Chose: the `mcp` Python SDK over Streamable HTTP, with the saved bearer token. querySportRecords returns readable text, not structured data, so a parser turns it into rows. The parser checks its count against the "(N records)" header and fails loudly on any mismatch or missing field.
Why: the SDK handles the MCP handshake for us. A text format can change without warning, and a silent drop would make weekly mileage wrong, which the safety checks depend on.
Alternatives: write raw JSON-RPC calls by hand, or use an unofficial COROS library.
Cost: the parser is tied to today's text layout. COROS sends the text as a JSON string with escaped newlines, which the parser decodes first.
Revisit when: COROS adds structured output, or the count check ever fires.
Status: open

## 2026-11-02 Safety checks as plain functions, with three rulings from Vicky
Chose: coach/safety/plan_rules.py and health_rules.py. They return violations and never edit a plan. Rulings: (1) a heavy lifting session is one with more than 10 sets, (2) a test week may have the test plus one quality run, so the limit there is 2, (3) before the half marathon result is recorded, heavy legs on 11 March pass with a warning.
Why: v5.1 itself had week 19 with a quality run and the test, and leg sessions that range from 2 to 28 sets. Code needs a clear line, and Vicky decided where it goes. The limits stay in code, not in a prompt.
Alternatives: heavy defined by RIR below 5 (v5.1 would fail in week 21), keep the quality limit at 1 (v5.1 would fail in week 19), assume not recovered (v5.1 fails in week 20).
Cost: the test week allowance loosens the written limit slightly. Week 21 legs (10 sets at RIR 2) count as light. Pain lasting 24 to 48 hours is read as over 24 hours.
Revisit when: the model sends v5.2, or Vicky wants a stricter heavy definition.
Status: confirmed

## 2026-11-02 Web app stack: Next.js 16, Tailwind 4, shadcn/ui, Recharts, Vitest
Chose: Next.js 16.4 (App Router, TypeScript), Tailwind 4, shadcn/ui (copies component code into the repo), Recharts for charts, @supabase/ssr for login cookies, Vitest and Testing Library for tests.
Why: all named in CLAUDE.md except Vitest and @supabase/ssr. Vitest is fast and works with TypeScript with no extra setup. @supabase/ssr is Supabase's own package for cookie sessions in the App Router.
Alternatives: Jest instead of Vitest, plain supabase-js with local storage (does not work with server rendering).
Cost: Next 16 differs from older guides. The scaffold ships docs in node_modules/next/dist/docs, which we read first. @types/node was raised from 20 to 24 so Vitest 5 installs.
Revisit when: Next or Vitest majors change.
Status: confirmed

## 2026-11-02 Cache Components turned off in the web app
Chose: remove cacheComponents and partialPrefetching from next.config.ts, which the scaffold had switched on.
Why: that mode is for pages that share cached content. Every page here is private, changes often and reads the login cookie, so it would only add Suspense rules and cache keys to manage.
Alternatives: keep it on and put every page behind a Suspense boundary with use cache: private.
Cost: no static shell, so pages render per request. Fine for one user.
Revisit when: pages feel slow on the phone.
Status: open

## 2026-11-02 Ankle gate logic lives in both TypeScript and Python, with a drift test
Chose: the four ankle checks and the pass rule are written twice, in web/lib/gates.ts and coach/safety/health_rules.py. A web test reads the Python file and fails if the check ids or the failure message differ. The pass or fail is always worked out on the server in the form action, never taken from the browser.
Why: the web app is TypeScript and the safety checks are Python. Calling Python from the web app would need a new service before we have a reason to build one.
Alternatives: one shared JSON file read by both, or a small Python API for the web app.
Cost: two copies to keep in step. The test catches a difference in ids and message, but not in the pass rule itself.
Revisit when: the coach service exists on Railway, then the web app can call it.
Status: open

## 2026-11-02 Dashboard days follow home time (changed 2026-11-04: Paris, not London)
Chose: a run belongs to the calendar day it started on in Vicky's home time zone, Europe/Paris, not the UTC date. One constant, HOME_TIME_ZONE in web/lib/weeks.ts, and HOME_ZONE in ingest/watch_sync.py.
Why: COROS stores UTC. Late in the evening the Paris date is already the next day, and a run would land on the wrong planned day.
Correction: I first used London because COROS names activities "London Run". Vicky lives in Paris, so that was a wrong guess. Paris is one hour ahead of London all year, so only runs and approvals between about 22:00 and 24:00 UTC change day.
Known limit: when Vicky travels, a run is still placed by Paris time. A late evening run in a far zone could land on the next day. COROS gives start coordinates, so a later step can work out the real local date.
Alternatives: store the zone per run from the coordinates (more accurate, more work, not needed yet).


## 2026-11-02 Chart colours and PWA without a service worker
Chose: the weekly chart uses blue for planned and orange for done, the first two slots of the validated dataviz palette, checked in light and dark (colour separation 25 against a target of 8). It has a legend, a hover readout and a table view. The app installs on the iPhone through a manifest and icons only, with no service worker.
Why: the palette is validated, so colour is not guesswork. A service worker is only needed for offline use, and a training log that shows old data offline would mislead.
Alternatives: a service worker for offline pages, one colour with outline bars.
Cost: the app needs a connection to open.
Revisit when: Vicky wants it to work in a gym with no signal.
Status: open

## 2026-11-02 App look: dark only, bottom tab bar, touch sized controls
Chose: dark theme switched on for the whole app (no light mode yet). A bottom bar with five tabs (Home, Runs, Gym, Food, Chat). Plan, weekly check in, ankle check and sign out sit in a top right menu. Buttons and text boxes are 44px tall, text boxes use 16px text. Status messages (good, note, careful, stop) always show an icon and a word, with colours from the validated chart palette.
Why: Vicky chose dark and numbers first. Five tabs is the most that fits a phone bar. 44px is Apple's guidance for thumb targets, and 16px text stops the iPhone zooming into a text box.
Alternatives: follow the phone's light and dark setting, a top menu for everything, or leaving shadcn's smaller default sizes.
Cost: no light mode. We edited shadcn's copied button and input files, so a later shadcn update would not overwrite them by itself but needs a look.
Revisit when: Vicky wants light mode, or six areas no longer fit in the bar.
Status: open

## 2026-11-02 Fix: the shadcn setup pointed the font at itself
Chose: set --font-sans to the Geist font variable in app/globals.css.
Why: shadcn wrote --font-sans: var(--font-sans), which refers to itself, so the browser fell back to a plain serif font. Found by looking at a phone sized screenshot.
Alternatives: none worth listing.
Cost: none.
Revisit when: shadcn is re-initialised, check the line again.
Status: confirmed

## 2026-11-02 Gym log: rules checked on the server, limits in the database too, no new libraries
Chose: each set saves on its own when ticked, through a server action. The server checks the day is a planned gym day, the exercise is in that day's plan, the week is not locked and the numbers are in range, before writing. The database repeats the number limits (reps 0 to 100, weight 0 to 500 kg, seconds 0 to 7200) and allows one session per day and one row per set. Timed holds ("60 sec") store seconds, not reps and weight. The screen uses plain inputs and open and close cards.
Why: a locked week and bad numbers must be refused even if someone skips the screen, the same way the safety limits live in code. Two layers mean a bug in one cannot save nonsense. Plain inputs are enough for a log, and fewer parts is easier to fix.
Alternatives: save the whole workout at the end (loses data if the phone dies mid session), a bottom drawer per exercise, React Hook Form with Zod for the boxes.
Cost: needs signal to save. With none, the screen says so and keeps what was typed, but there is no offline queue. A ticked set with no numbers is allowed, for bodyweight and mobility moves.
Revisit when: the gym has bad signal, or Vicky wants progress charts per exercise.
Status: open

## 2026-11-02 Railway set up by hand in the dashboard, COROS pulled every 15 minutes
Chose: services are configured in Railway's dashboard and written up in docs/railway.md, not in railway.json files. The COROS run job runs every 15 minutes. If a token refresh is refused, the code re-reads the saved tokens and uses a newer pair if another job already refreshed.
Why: Railway says railway.json stops working for existing services on 2026-12-01 and its replacement (a TypeScript file) is still experimental. Waiting up to 3 hours to see a finished run felt too long to Vicky. COROS replaces the refresh token on every refresh, so two jobs refreshing together could lock the login. More frequent jobs, and the coming watch job, make that more likely.
Alternatives: railway.json files, the experimental infrastructure as code, a 5 minute schedule, one shared job.
Cost: dashboard settings can drift from the notes, so the notes must be kept current. COROS publishes no rate limit for this call, so the job logs are the early warning. A run still only shows after the COROS phone app has synced the watch.
Revisit when: COROS pushes back with errors, or Railway's replacement is stable.
Status: open

## 2026-11-02 Watch sending: the web app approves, a separate job sends
Chose: the Approve runs page only writes an approvals row. A Railway cron job (every 5 minutes, ingest/watch_sync.py) picks up approvals not yet sent, turns the planned run into a COROS workout (ingest/watch_course.py) and sends it. One approval per day is enforced by the database. Before sending, the job claims the approval, checks the COROS calendar for a workout with the same name, and never retries a failed send by itself. A send that stopped part way is flagged for a human. The database blanks the "sent" fields if the web app tries to set them.
Why: the web app must never hold COROS tokens (CLAUDE.md keeps secrets out of it). COROS has no delete tool, so a duplicate or wrong workout can only be removed by Vicky in the COROS app. Each guard closes one way a double send could happen.
Alternatives: let the web app call COROS directly (needs tokens in the web service), send straight from the approve button (no queue, no retry control), retry failures automatically (risks duplicates).
Cost: up to 5 minutes between approving and the watch having it. A failed send needs a human. The format of COROS's success answer was not known, so the job only counts a send as done when it sees a workout id, and otherwise records what COROS said.
Revisit when: the first real send shows what COROS actually returns, or COROS adds a delete tool.
Status: open

## 2026-11-02 Weekly check in: pain stop blocks the watch, photos upload from the phone
Chose: the check in form saves weight, height, how you feel, pain answers and three photos. The server works out the pain stop from the answers (the browser cannot send its own result) and saves it. While the newest check in says stop, the Approve runs page refuses new approvals and the watch job holds runs that were already approved, without failing them. A later check in without a stop clears it. Photos are shrunk in the browser to a 1600 pixel JPEG, uploaded straight to the private bucket in a folder named with the user id, and shown only through links that expire after an hour. The database holds only the path, and a rule checks the path has the right shape. A retaken photo is deleted before the new one is uploaded.
Why: CLAUDE.md says persistent pain stops the plan, so the code enforces it rather than relying on Vicky or a prompt. Uploading from the browser avoids the server's size limit for three photos and keeps the file off our servers. The storage rules allow upload, read and delete but not overwrite, so replacing a photo means delete then upload.
Alternatives: only show a warning on a stop, send photos through a server action, add an overwrite rule to storage.
Cost: a stop also holds runs Vicky already approved, so she must do a clean check in, or see a professional, to release them. The pain rules exist twice (Python and TypeScript), kept in step by a test that reads the Python file. The weekend reminder (Saturday and Sunday) is a guess, because the plan does not say which day the check in is.
Revisit when: Vicky says which day she does the check in, or a stop should not hold approved runs.
Status: open

## 2026-11-03: COROS writes short distances in metres

**What happened:** The scheduled runs job crashed with "A COROS run is missing a field I need". One activity on 29 Oct was 792 m. COROS wrote "Distance: 792 m" instead of "0.79 km", and the parser only knew km.
**Choice:** The parser now accepts km or m and stores kilometres. I kept the loud failure for a truly missing field, because a silent skip could hide a real format change.
**Alternatives:** Skip runs the parser cannot read (rejected: quiet data loss). Ignore anything under 1 km (rejected: hides data, and the rule belongs to Vicky, not the parser).
**Note:** That activity is a 24 minute walk at 30:47 per km that the watch labelled as an outdoor run. It is saved like any other run.

## 2026-11-04 Workout page and calendar are read only views of the stored plan
Chose: a page per planned day (/plan/[date]) and a month grid (/calendar). Both read plan_days, runs and approvals with Vicky's own login, so row level security applies. No new data was needed, because the plan JSON already holds each run's steps.
Steps are written out by one plain function (web/lib/workout-steps.ts). It shows the plan as written and never edits it. A test runs it over all 101 planned runs in v5.1 and checks that every step gets one line and every distance survives.
Layout: seven narrow columns on a phone, with a number and an icon per day, not text. Each day has a spoken label for screen readers. A locked week shows a lock and no workout, the same as the Plan page.
Alternatives: a calendar library such as FullCalendar (rejected: heavy, built for desktop, and the grid here is about 80 lines); a week strip instead of a month (rejected: Vicky asked for a calendar).

## 2026-11-04 Google Calendar by a private subscription link, one way
Chose: a link ending in .ics that Google Calendar subscribes to (Other calendars, From URL). Each planned run is an all day event with the steps in the description. Locked weeks, rest days and the recorded past run are left out.
Why: simplest thing that works, nothing to sign in to, nothing to renew. Google fetches the link itself, about every 12 to 24 hours, so changes show late. That is Google's schedule and we cannot change it.
Alternatives: Google Calendar API with sign in (instant and can set a 7am reminder, but needs a Google Cloud project, an OAuth app and a stored Google token, and as far as I know Google logs out unverified personal apps after 7 days; revisit if the delay annoys Vicky); a one time .ics download (goes stale at once).
Security: Google cannot log in, so the link is the key. The token is 32 random bytes (43 characters). Only its sha256 hash is stored (calendar_feeds, migration 0009), so a database leak does not leak the link. The link is shown once. Making a new one replaces the old, which stops working.
The web service holds only the anon key. So the feed reads through one database function, calendar_feed(token), which is security definer and returns only: plan version, each run's type, distance, duration, pace and steps, and the ankle gate results. It leaves out the plan notes (they mention ankle symptoms), and never touches weights, photos, pain, meals or runs. A wrong token returns null, and a token of the wrong shape never reaches the database. Tests cover each of these, and I broke three of the rules on purpose to check the tests catch them.
The calendar page itself still needs a login. Only /calendar/feed/ is public.
Event ids are plan-<date>@athlete-app, so a changed plan updates an event and does not add a second one.

## 2026-11-04 Plan v5.2 starts with a pack Vicky pastes into ChatGPT
Chose: ChatGPT is used through its chat page by Vicky, not through the API. Code builds the facts it reads (coach/evidence_pack.py) and will check what it sends back. Reason: the API would use a lot of tokens, and Vicky prefers to talk to ChatGPT herself. The project rule still holds: ChatGPT decides training, code only checks hard limits, and nothing is edited by code.
The pack holds: her races (from data/athlete_facts.json, matched to recorded runs), every outdoor run this year, the current plan with its steps and paces, the safety limits read from coach/safety/plan_rules.py, and the exact reply format. It holds no tokens, no raw COROS text, no photos and no weight. The file is written to exports/, which git ignores because it is personal data.
Riegel's formula (time times distance ratio to the power 1.06) is shown next to each race as a rough equivalent, labelled as a formula and not a prediction. Our code never turns it into a pace target.
The reply format is the plan's own run shape (steps with pace ranges) so the same steps convert to watch workouts with ingest/watch_course.py. A test proves the example in the pack converts.
Alternatives: calling OpenRouter from code (rejected for token cost); pasting the whole 475 KB plan (rejected: too large, and ChatGPT only needs runs).
Also: indoor runs that COROS saves with a time and no distance are left out of the import and reported, because inventing a distance would be wrong. ingest/home_zone.py now holds the Paris time zone for the Python side.

## 2026-11-04 Weekly ramp is measured against the highest of the previous four weeks
Chose (Vicky's decision): each week is compared with the highest weekly distance in the previous four weeks. Warning above 10 percent, fail above 15 percent, race week exempt, first plan week uses the 33.55 km history baseline. This replaces "the last non recovery week" from the 2026-11-02 entry.
Why: Vicky's plan puts a half marathon on Monday 21 December. The taper week before it is 19 km, and measuring the return to 50 km against that 19 km looked like a 90 percent jump, though 52 km is only 4 percent above the 50 km she runs in week 7. Plan v5.5 failed on weeks 9, 10 and 11 for that reason.
Tested on real numbers: v5.5 loses those three failures. A true spike (40, 40, 40 then 60) still fails. Overshooting after a dip (50, 20, 60) still fails. A peak more than four weeks back is forgotten, so 50, 30, 30, 30, 30, 50 still fails. v5.1 loses one warning (week 11).
Trade-off: the rule lets Vicky return to a load she handled in the last four weeks, even after a dip. If the dip was an injury, this rule would not catch a rebound. The ankle gate and the persistent pain stop do not change and remain the guard for that.
Alternatives: ChatGPT rebalances weeks 8 to 11 (kept as a fallback); exempting only the taper week (rejected: week 11 would still fail against week 10).

## 2026-11-04 A checker for plans that ChatGPT sends back
Chose: coach/check_proposal.py, run as `python -m coach.check_proposal path/to/plan.json`. It reads the file and the plan of record, prints what to fix, and prints a block Vicky pastes back to ChatGPT. It never edits the plan.
Why: ChatGPT is used through the chat window, so the "send violations back to the model" step is done by hand. The checker makes that step quick and the same every time.
Blocking fixes: a past day changed, a missing or extra date, no new version number, a running step with no pace range, a pace COROS would refuse, coros_workout steps that differ from the run's steps, a run that cannot become a watch workout, and any safety rule that fails. Not blocking, but listed: step distances that do not add up, week totals, stale effort ranges, leftover "10K test" wording, headline text that mentions marathon pace with no such step, and safety warnings.
Also checks that every day has the six coaching note fields. The notes are for the web app only and are not sent to the watch.
Alternatives: calling the model from code (rejected for token cost); fixing problems automatically (rejected: code never edits a plan).

## 2026-11-04 How a new plan from ChatGPT reaches the app
Chose: a checked plan is saved as a draft in its own table, plan_proposals (migration 0010). Vicky reads it on /plan/proposal and taps Approve twice. A database function, adopt_plan_proposal, then stores the new version, its weeks, days and gates, and a plan_changes row in one step. The old version is never touched.
Why not store the draft as a plan version: the web app, the calendar link and the watch job all read the newest plan_versions row, so a draft there would go live without her say. Why a database function and not a script: plan versions cannot be deleted, so a script that failed half way would leave a broken version for good. One transaction either does everything or nothing.
Watch workouts: what the watch job sends is the workout steps and the workout name. The page lists days where those changed. If a changed day was already sent, COROS has no delete, so Vicky removes it by hand. If it was approved but not sent, the approval is cancelled and she approves the new workout. A half sent approval is left alone, because it may already be on the watch. Days where only fueling text or hidden details changed are not counted, so a workout she has already sent is not flagged for nothing.
Coaching notes: stored in plan_days.coaching_notes and shown on the workout page only. The calendar link and the watch never read them.
Guard rails: the draft table has no insert or update policy for the app, so only the check job (service role) can write drafts and only the function can decide them. The function refuses a draft that has errors, was already decided, or belongs to someone else. The page and banner never fail if the table is missing.
Notes never go to COROS (Vicky's decision): the watch description is built from the steps only. The plan's run notes can mention ankle symptoms and are for the web app. This also removes the length worry, since v5.7's notes are up to 621 characters. ingest/watch_course.to_course no longer appends run.notes, and a test proves a note never appears in the description. The checker still warns if the step text itself is long.
Alternatives: re-pointing unsent approvals to the new version (rejected: she would send a workout she has not seen); letting the app write the version rows itself (rejected: not atomic).

## 2026-11-09 Health numbers: COROS history is read again each time, only "today only" numbers are snapshotted
Chose: ingest/coros_health.py runs every 3 hours and fills two tables. health_daily has one row per Paris day (sleep, HRV, heart rate, stress, steps, training load, recovery rollup, fitness). recovery_snapshots has one row per pull. COROS keeps dated history for most metrics, so those days are simply read again and overwritten. Recovery status and the fitness overview are today only in COROS, so the job saves them itself and their charts start on the first day it ran. Nothing is back filled.
Why: re-reading is simpler than a log of every raw answer (the HRV points alone are about 20 thousand characters a pull), and it repairs itself if COROS corrects a day.
Rules in code, with tests: a missing night ("Sleep Score: 0" or a negative score) and a day of all zeros are stored as empty, never as zero. A later pull with less data never blanks a stored value (each day is its own upsert carrying only the columns it has). One tool failing is reported and skipped, the others still save. An unrecognised format raises. A day is marked complete once Paris midnight has passed. Sleep belongs to the wake-up day.
Checked on real answers saved on 2026-11-09: the parsers read them, and 69 days would be saved by a full backfill. HRV is read in 7 day windows (the tool allows 7).
Alternatives: one raw log table for every pull (rejected: size); adding the job to the runs job (rejected: a failure in one would hide the other, and they refresh the same login).
Cost: sleep stage minutes come from the daily health tool and the sleep times from the sleep overview, so a night needs both to be complete. Sleep window times are read as Paris time, so a night slept abroad can be off by the time difference.
Revisit when: COROS changes a format (the job will fail loudly) or the stored times look wrong after a trip.
Status: open

## 2026-11-09 One app, two layouts (phone and laptop), and a sixth tab called Insights
Chose: the layout follows screen width. Under 1024px it is the phone layout (top bar, one narrow column, tabs along the bottom). From 1024px up it is a left sidebar with the same tabs plus the menu links and Sign out, and the top bar and bottom tabs are hidden. Home and Insights use the full width (up to about 1150px, with Home cards in two columns). Every other page keeps a readable column (about 770px). Which pages are wide is one list, WIDE_PAGES in web/lib/nav.ts. The tab icons are shared (components/tab-icons.ts), and a test checks the sidebar and the bottom tabs show the same tabs in the same order.
Why: Vicky uses the app on her iPhone and on her laptop. The dashboard plan wants two charts per row on a wide screen.
Alternatives: separate phone and laptop sites (rejected: two copies drift apart); widening only the Insights page (rejected: she uses both devices all the time); detecting the device (rejected: the window width is what matters, and a narrow laptop window should show the phone layout).
Cost: one more component to keep in step with the bottom tabs. The page pass is by reading the code and the build. It was not checked in a browser by me, because every page is behind the login.
Also: a sixth tab, Insights, sits before Chat. Its page says "coming soon" until the dashboard is built. The app is dark only (dark is fixed on the page), so there is no light mode to check.
Revisit when: a page looks cramped or stretched on a laptop.
Status: open

## 2026-11-09 One Git branch per task, merged to main only after Vicky approves
Chose: each task in the to do list gets its own branch (task-NN-short-name). Small commits go on the branch. When Vicky approves the task, it is merged into main, and only then pushed. Pushing main deploys to Railway, so main always holds approved work.
Why: Railway deploys whatever is on main, so a push is a release. Vicky approves one task at a time, and a branch per task matches that. A bad task can be thrown away without touching the live app.
Alternatives: committing straight to main (what we did until now: every push goes live); pull requests on GitHub for every task (kept for later: an extra step, but a readable record of each task).
Cost: a few extra git commands per task.
Revisit when: pull requests would help, for example if a second person ever helps.
Status: confirmed

## 2026-11-09 Insights page: range in the address, cards from the newest real value, no combined score
Chose: the Insights page reads its date range from the address (?range=7|30|90|custom, ?from=, ?to=, ?view=daily|weekly), so a view can be bookmarked and the page stays a server component. Custom ranges are capped at 180 days, the end is never in the future, and anything invalid falls back to 7 days with a visible note. The six cards at the top show the newest real value of each metric (not the range), with the date it was measured, and say "No data yet" when there is none. Baselines are the average of the 28 days before the day, ignoring empty days, and need at least 5 values. There is no combined readiness score. Every chart sits in one ChartCard with a data table, and a missing value shows as "no data", never zero.
Why: this follows Vicky's dashboard spec. The metrics update at different times, so each card says when it was measured. A gap in the watch data must not pull an average down or look like a zero.
Alternatives: client side state for the range (rejected: not bookmarkable, needs JavaScript before anything shows); one readiness score (rejected in the spec: it hides which metric moved); a charting page per metric.
Cost: a form submit reloads the page when custom dates change.
Revisit when: charts feel slow to reload on every range change.
Status: open

## 2026-11-09 Insights charts: one axis each, gaps stay gaps, colour per metric, COROS's own load numbers
Chose: six charts on Insights (sleep stages, sleep score, HRV with the COROS normal range band, resting heart rate, weekly running distance, short-term against long-term load), drawn with Recharts like the existing weekly chart. The data for each chart is worked out by plain tested functions (web/lib/insights-series.ts), the charts only draw it. Each chart has one vertical axis. A night or day with no data is a gap in the line or no column, never a zero. A lone point (no neighbour on either side) gets a dot, because a line cannot show it. Sleep score nights more than 1.5 standard deviations under the previous 28 days (at least 5 nights needed) get a hollow marker. That is a display marker, not advice. Weekly view shows the average per week, except load (newest value in the week) and distance (always weekly). The week in progress is drawn lighter and is not compared with full weeks.
Colours: one fixed colour per metric, from the validated categorical palette in the dataviz skill (blue, orange, aqua, yellow for the four sleep stages, checked against the app's dark card colour with its validator: all checks pass). Reference lines (28 day averages, the 7 day HRV average, the 4 week distance average) are neutral grey. Every chart with two or more series has a legend, and every chart has a data table.
Not built: chart 8 (training load per day). COROS gives no daily load total, only short-term, long-term and the ratio (chart 9 uses these). Recovery and stress charts, long runs, fitness and the scatter plots come in later steps.
Alternatives: charting the 28 day average as a band (rejected: the spec asks for a line); a second axis for sleep score on the stage chart (rejected: one axis per chart).
Not checked by me: how the charts look in a browser. The sign-in blocks me from opening the page, and a version that skipped the sign-in to take a picture was (rightly) blocked. Vicky checks them on the dev server.
Revisit when: a range of 90 days makes the tick labels or columns too crowded.
Status: open

## 2026-11-09 Insights fitness charts: today only numbers start a line, easy runs only for efficiency
Chose: five more charts. Longest run each week (from the runs table), VO2max, threshold pace and marathon prediction (from health_daily), and a running efficiency scatter (easy runs: average heart rate across, pace up). VO2max, threshold pace and the marathon prediction exist in COROS only as today's value, so each chart is one dot today and grows as the job saves each day. Nothing is back filled. A lone dot is drawn as a dot, because a line cannot show it. Faster pace and faster time are drawn higher up (reversed axis), so a rising line means improving. The three goals (A, B, C) come from the plan, and the tooltip says how far the prediction is from each. Axis limits are rounded to clean steps.
Efficiency chart: only runs the plan calls easy or recovery, only runs with a heart rate. Strides and quality runs are left out because they are not comparable. Dots are coloured by month for this month and the two before, in the first three validated palette slots (checked as all pairs against the dark surface), each month with its own marker shape (circle, square, triangle) so colour is not the only cue. Older runs are grey rings. A distance filter (all, 5 to 10, 10 to 16 km) lives in the address. The chart says wrist heart rate can be off until chest strap runs arrive.
Found while checking (read only, getActivityDetail on one run on 2026-11-09): each run's detail has a Training Load number, Aerobic and Anaerobic training effect, Training Focus, a Performance word, a Perceived Effort word, the Workout Note you typed in COROS, cadence, power, elevation gain and loss, and lap data. It has NO VO2max, threshold or prediction. This settles three open items: chart 8 (training load per day) can be built by saving each run's load, chart 15 can use Perceived Effort, and the workout table can show notes. It needs a new step that reads each run's detail and saves it (not built yet).
Alternatives: showing VO2max history by reading it from somewhere else (nothing found); colouring efficiency dots by distance (rejected: month shows progress over time).
Cost: three of the five charts are nearly empty for now.
Revisit when: the chest strap has a few weeks of runs, or COROS adds fitness history.
Status: open

## 2026-11-10 Run details from COROS, saved on the run
Chose: ingest/coros_run_details.py reads getActivityDetail for each run and saves training load, aerobic and anaerobic training effect, training focus, the Performance word, the Perceived Effort word, your Workout Note, cadence, stride length, power, elevation gain and loss, and the best kilometre on the runs table (migration 0012). Elevation gain uses the existing elevation_m column. The run page shows them in a "From your watch" card.
How: runs never read come first, newest first. Runs from the last 7 days are read again after 3 hours, because the effort word and the note are added in COROS after the run. At most 15 runs per pass. It is called at the end of the 15 minute runs job and wrapped so it can never make that job fail (it logs "Run details skipped" and the type of error, nothing else). One run failing never stops the others.
Rules in code, with tests: a field COROS does not have is not written, and a number we hold is never blanked. Only the two fields you can edit in COROS (effort and note) are cleared if COROS no longer has them. "--" and "N/A" mean nothing, not a value. The note is read from after its label to the end, so a note that looks like a field cannot change the numbers. A format we do not recognise raises. The job report lists the effort and focus words it saw and how many runs had a note, never the note text. The run page loader never throws, so the page opens even before the migration is applied.
Privacy: your note is stored in your database under the same login protection as everything else and never goes to COROS. Decided with Vicky on 2026-11-10: a later run insight (one OpenRouter call comparing the plan with the run) may include the note. I will ask again before the first call that sends it. Until the evidence library and the spending cap exist (tasks 10 and 11) that insight is not built.
Alternatives: a separate Railway service (rejected: one more thing to set up, and the runs job already has the login); a separate table (rejected: every use joins it to runs anyway).
Cost: about 94 calls once for your old runs, then a few a day. COROS publishes no limit for this tool, so the backfill goes in batches.
Revisit when: COROS pushes back with errors, or the effort words show a scale worth turning into a number.
Status: open

## 2026-11-10 Gym data comes from the COROS watch, and the hand ticked gym log is removed from the app
Chose: strength sessions and their sets are read from COROS (querySportRecords for sport 402, getActivityDetail and queryActivityLapData for each session) into two new tables, strength_sessions and strength_sets (migration 0013). The Gym tab now shows what the watch recorded: for each planned day, and for any extra session, the time, sets, weight lifted, heart rate, load, how it felt, your note, and every exercise with its sets, reps and kg. Vicky decided on 2026-11-10 that she will not tick sets in the app, so the watch data feeds the gym sessions.
What was removed (Vicky's decision, 2026-11-10: "remove all the gym log from the app completely"): the plan based Gym list, the tick boxes and the finish button, their server actions, loaders, helper code and tests (web/lib/gym*.ts, exercise-card, finish-workout-button). The Gym tab now follows ordinary Monday to Sunday weeks, from the first recorded session to this week, and shows only watch sessions. The plan's own gym sessions still show on the plan pages, because that is the plan and not the log. What was kept: the old gym_sessions and gym_sets tables and the 1 session and 1 set in them. Dropping data is irreversible, so it waits for Vicky's yes.
How: ingest/coros_gym.py lists sessions, saves them, then reads details and sets. Sessions never read come first, newest first. Sessions from the last 7 days are read again after 3 hours, because the effort word and the note are added in COROS after the session. It is called at the end of the 15 minute runs job, wrapped so it can never make that job fail. One session failing never stops the others. The two fields you can edit in COROS (effort and note) are cleared if COROS no longer has them. Everything else is never blanked.
What the sets look like: COROS writes one row per set, then one extra summary row per exercise with the total reps and the total weight (in grams). The parser drops the summary only after checking that it adds up, so a set is never counted twice and a real set is never dropped. Warm up, cool down and rest rows are skipped. Stretches stay as sets. A set with no weight is body weight and is stored with an empty weight, not zero. Sessions from July and August were logged without exercise detail: they have no sets, which is a valid answer, and keep their time, heart rate and load.
Checked on your real data (dry run 2026-11-10): 42 sessions from the last 120 days, 402 sets, 7 with a note, 0 failures. The set count COROS shows for a session (for example 41) includes warm up and rests, so it is larger than the sets we count (32 for that session). The card shows our count.
Not available from COROS: reps in reserve (RIR), and the hold time of timed holds like a wall sit (only rest rows appear). A day can have two sessions, and both show.
Privacy: your note is stored in your database under the same login protection as everything else and never goes to COROS.
Alternatives: filling the old gym_sets from COROS (rejected: COROS exercise names do not match the plan's, two sessions a day break the one session per day rule, and the watch data would overwrite your own ticks); a separate Railway service (rejected: the runs job already has the login).
Cost: about 3 COROS calls per session once, then a few a day.
Revisit when: COROS adds RIR, or a template name needs matching to the plan's exercise names.
Status: open

## 2026-11-10 Workouts and exercises added by hand, next to the watch's
Chose: you can add a whole workout (Gym tab, "Add a workout") or more exercises on any session ("Add an exercise" on each card, watch sessions included). You type one exercise per line, like `Bench press, 4 x 8 at 40 kg`, `Pull ups, 3 x 10` (body weight) or `Row: 10 at 30, 10 at 30, 8 at 35` (each set on its own). The screen shows what it understood as one tag per set before anything is saved, and names the line that is wrong. What you add is marked "Added by you" and can be removed with two taps. There is no edit button in this first version: delete and add again. A workout typed in by hand has no time of day and sorts at noon Paris time on its date. A day cannot be in the future.
How: strength_sessions and strength_sets get a source column, 'coros' or 'manual' (migration 0016). Every existing row becomes 'coros'. A manual session has no COROS id, so it cannot collide with a real one. Sets are numbered separately for each source, so a set you add never lands on a watch set's place and the watch job replaces only its own sets (it deletes and upserts rows marked 'coros', and ignores sessions without a COROS id). The database, not only the screens, enforces who may change what: signed in users may add, change and delete only rows marked 'manual', and only their own; they can add a manual set to a watch session; watch rows are read only even to them. A delete that removes nothing counts as a failure, so it is never reported as done.
Checks in code, with tests: at most 20 sets, 300 reps, 500 kg, 30 exercises and 200 sets per save, names with at least one letter and at most 120, minutes 1 to 600, note at most 5000, a real date no earlier than 2020. A comma used as a decimal point is explained, because a comma separates sets. If the sets cannot be saved after the session was created, the empty session is removed again. A failure never shows database text.
Alternatives: a set by set grid (rejected for now: slow on a phone; the one line form covers different weights per set); writing manual sets into the watch rows (rejected: the next watch job would overwrite them); a separate pair of tables (rejected: every screen would merge two sources).
Cost: no editing yet. A watch session can show your exercises after the watch's ones, which is what you asked for.
Revisit when: you want to edit an entry instead of removing and adding it again.
Status: open

## 2026-11-10 Insights step A: stress, recovery history and training load per day
Chose: three more charts. Stress is a line of the daily average against your own 28 day average, like resting heart rate. Recovery shows the last reading of each day with the day's lowest to highest as a band, and below it a small "today so far" line from the 3 hourly snapshots. With fewer than two readings today it says so in words, because one reading draws no line. Its history began on 9 Nov, because COROS only gives the current value, and nothing is back filled. Training load per day adds up the COROS load of every run and gym session (the numbers saved from the run and session details), as columns per day or week, with a filter for All, Running or Strength kept in the address (?load=). Cycling is not in our data, so it is not offered.
Missing against zero: a day with no workout is a real zero ("No workout recorded"). Workouts that COROS gave no load for are never counted as zero: a day where none of them has a figure shows no data, and a day where only some do adds up the scored ones and says how many are not counted. Runs from before September mostly have no load figure, so those days are empty.
Fixed on the way: the 2px gap I draw between touching columns eats a column whole when there are many on a narrow screen, so 90 daily columns on a phone nearly vanished. With more than 31 columns there is now no gap (gapFor in chart-parts.tsx). This also applies to the sleep stage chart. It was one cause of columns looking black or missing. The other, earlier, was stale styles from running a production build next to the dev server.
Colours: stress yellow, recovery blue, running aqua and strength violet, all checked with the palette checker (the aqua and violet pair passes the all pairs test).
Alternatives: a gauge for recovery (rejected in the spec); counting an unscored workout as zero load (rejected: it would make a hard week look easy).
Revisit when: recovery has a few weeks of history, or cycling is added to the data.
Status: open

## 2026-11-10 Insights step B: the workout table
Chose: a "Workout history" section at the bottom of Insights lists every run and gym session in the chosen date range as one row: date, what the plan called it (or your COROS name), distance or sets and weight lifted, time, pace (runs only), heart rate, training load, how it felt, and the first line of your note. On a laptop it is a table, on a phone each workout is a small card. Tapping one opens the run page or that gym day, where the whole note is. Workouts you typed in carry the "Added by you" tag. Filter by All, Running or Strength, sort by newest or highest load, and the 30 newest rows show with a "Show all N" link. All of this lives in the address (?show=, ?sort=, ?rows=all) and keeps the date range, like the other filters.
Rules, with tests: a value COROS did not give is null and shows as "no data", never zero; a real zero load stays a zero. A workout with no load figure sorts after the ones that have one when sorting by load. A run's title is what the plan called that day, and a plain "Run" on a rest day or an unplanned day. A run's date is its Paris date. A note is shortened to its first line, cut at 90 letters. A run with no distance has no pace.
Voice notes: COROS only gives us the note text. If a note was recorded by voice, the text we hold is COROS's own transcription, and it shows here. Nothing else can be fetched.
Loader: reads only the range, and never throws (if it fails the table shows the gym sessions only). No database change, nothing written.
Not checked by me: how the table looks styled, in a browser. The tests cover the logic and the text, and a drawing with the app's real styles needs a package that is not installed here.
Alternatives: a table only (rejected: it needs sideways scrolling on a phone); showing the whole note in the table (rejected: one long note would stretch a row across the screen).
Revisit when: you want sorting by more columns, or a search.
Status: open

## 2026-11-10 Insights steps C and D: two scatter charts and the "what needs a look" card
Chose, chart 16 (training load and next morning HRV): one dot per day. Across is that day's COROS training load. Up is the next morning's HRV minus COROS's own baseline for that date, in milliseconds. A rest day counts as zero load only when the watch recorded that day. A day with workouts but no COROS load figure is left out, not counted as zero. A day with no HRV the next morning is left out. Every left out day is counted under the chart.
Chart 15 (how it felt and that morning's HRV): one dot per workout. Across is your effort word on a five step scale (Very Easy, Easy, Moderate, Hard, Very Hard, the order you gave me). Up is the HRV from the morning of that workout. Words outside the scale, such as "Very Tired", workouts with no word, and workouts with no HRV are left out and counted.
Both are exploratory: no trend line, no cause claims, and a note says how few dots there are. Each has a data table and a "How to read" guide with Sam.
"What needs a look" card: six checks on your own numbers, with the limits you approved. HRV under the COROS normal range on 3 of the last 7 nights. Resting heart rate 5 or more bpm over the 28 day average, 3 days in a row. Under 6 hours asleep on 3 of the last 7 nights. Training load ratio above 1.3 for 3 days in a row. 7 day average stress 10 or more over the 28 days before that week. Last recovery reading of the day under 50% on 2 days in a row. The limits live in FLAG_LIMITS in web/lib/insights-flags.ts, with tests.
Rules: a check with too little data says "not run" and never counts as a pass. Nights checks need at least 5 of the last 7 nights with data. A "days in a row" check needs the newest day to be today or yesterday. The card states facts only and gives no advice, because the evidence library is empty. Advice with cited sources comes after Task 10.
Two choices I made that you can change: stress is compared with the 28 days before the week, so a bad week does not pull its own yardstick up. Recovery uses the last reading of each day, because only that and the day's lowest and highest are stored, not the morning reading.
Alternatives: your own 28 night HRV average as the baseline (rejected, COROS's is the one you see in the app); leaving rest days out (rejected, they show what an easy day does); advice text now (rejected, the rule says health claims cite the evidence library).
Revisit when: there are a few months of pairs, or the evidence library exists.
Status: open

## 2026-11-10 Agent lesson 1: one model call through ADK, with a spending cap
Chose: Google ADK 2.13.0 with LiteLLM 1.106.2 (both pinned, both older than two weeks; ADK needs LiteLLM below 1.106.3) calling openai/gpt-6-luna through OpenRouter. Prices from OpenRouter's model list on 10 Nov 2026: Luna $0.10 in and $0.50 out per million tokens, Sol $2 and $10.
The cap: a plain tested function (coach/budget.py), $10 a month by default, stored in coach_settings (you can change your own row), month resets on the 1st Paris time. It runs in ADK's before_model_callback, so a blocked call never reaches the model. Every call and every block is logged in llm_calls (migration 0017): tokens, cost, ok, a short error name. Never the question or the answer.
Choices and alternatives: ADK callbacks for the guard (alternative: a wrapper function around every call, rejected because a future tool or agent could forget to use it). Our own price table (alternative: read the cost OpenRouter returns, rejected for now because an unknown model should fail loudly and the table is tested; revisit if prices change often). Dollars as Decimal, not float, so the sums are exact.
Found by running it: (1) the reply included the model's private reasoning summary (a "thought" part), so the script now prints only non thought parts. (2) My first cap demo did not block, because my guess of the first call's cost was wrong. The guard was right. A real call cost about $0.00005 to $0.00007.
Known limit: the check happens before a call, so the call that crosses the cap can overshoot by its own cost. The cap does not yet count a call that is already running when another starts. Fine for one user.
Not yet checked: that the thought filter works on a fresh call (needs one more paid call of a fraction of a cent).
Revisit when: a model or price changes, or we use Sol, which is 20 times dearer.
Status: open

## 2026-11-10 Agent lesson 2: a fixed form for the model's answer
Chose: a Pydantic class (coach/forms.py, RunnerNote: headline up to 120 characters, readiness green, amber or red, one to five observations, confidence 0 to 1) given to ADK as output_schema, and the same class checks the reply in our own code (check_note). Extra fields are an error. A bad reply is rejected with plain messages and never fixed silently. This is a practice form. The real daily review form comes in lesson 10.
Ran two real calls with invented numbers (about $0.00014 to $0.00016 each): a normal question and one that told the model to ignore the form and write a poem. Both replies came back as clean JSON and passed. The thought filter from lesson 1 works (the raw reply is only the JSON).
What this does not prove: one tempting question passing is not proof that the form always holds. The shape is enforced, not the truth. The model said confidence 0.95, a number it made up, so confidence is not a measure of anything until we test it against known answers (lessons 8 and 10).
Known ADK limit, to design around: setting output_schema stops an agent from using tools. So the daily review (no tools) fits the form approach. The coach chat (tools) cannot use it on the same agent, so its answers are checked in code afterwards.
Alternatives: asking for JSON in the prompt only (rejected: no guarantee, more broken replies); parsing free text with rules (rejected: breaks as soon as the wording changes).
Revisit when: the daily review form is designed in lesson 10.
Status: open

## 2026-11-10 Agent lesson 3: the first tool, get_recent_health
Chose: a read only tool (coach/tools.py) that returns up to 14 days of sleep, HRV, resting heart rate, stress, load ratio and recovery from health_daily. It checks its own input (a whole number, 1 to 14; text, decimals, booleans and out of range are refused with a message and never reach the database). A missing value is null. It reports how many days had no data at all. The tool is built with the data reader passed in, so tests and demos use invented rows.
The loop was also written by hand (coach/loop_by_hand.py, with a round limit of 5), to show what ADK does for us. It refuses an unknown tool name and survives wrong inputs. Tests use a scripted fake model, so they cost nothing.
Real run on invented rows: 3 steps (the model asked for the tool with days=7, our code ran it, the model answered), 2 model calls, 2 receipts. The second call's input was 923 tokens against 263 for the first, because the tool result goes back into the conversation. Cost about $0.0002 in all. The answer matched the numbers and said one day had no data. ADK shows each step as an event, which the script prints.
Known limits: the tool is read only, and tools run with the service role key in this practice script. In the service (lesson 9) they must run as the signed in user, so Row Level Security protects the data. A bigger tool result means more input tokens, so keep results small.
Alternatives: letting the model write SQL (rejected: far too much power, and a mistake could read or change anything); one big tool returning everything (rejected: slow, expensive and unfocused).
Status: open

## 2026-11-10 Agent lesson 4: more tools, flags, a registry and shared design rules
Chose: three read only tools in coach/registry.py (the one place to see what the agent can do): get_recent_health (now with per day flags and counts), get_recent_runs (up to 30 days, the newest 20 runs, never notes), get_plan_day (one date, summary of the run and gym only, newest plan version, read only).
Flags (coach/health_flags.py): code works out facts such as "slept under 6 hours", "HRV below your COROS normal range", load ratio above 1.3, recovery under 50%. Facts only, no advice. The limits are the ones approved for the Insights card. A test reads web/lib/insights-flags.ts and fails if the Python and TypeScript numbers differ (the drift guard). Checks that need a 28 day average or several days in a row stay on the Insights card.
Shared rules test (coach/tests/test_tool_rules.py): every tool in the registry must have a type hint and a docstring line for each input, return an error and never read data on bad input, return a small result even with huge data, never return notes, and the tool files may not contain a write call. Mutation checks: eight deliberate breaks, all caught after I closed one gap (notes in the database query).
Found by running it: (1) my event printer showed only the first of three tool calls. The model asks for several tools at once and ADK delivers them in one event. Fixed, and the printer now lists them all. (2) The same question on invented data gave two different answers. The first stated sleep figures (7h50 and 8h) that were in no row, the second matched the data exactly. Nothing in our code caught the first. This is the case for evals (lesson 8): a single good run proves little.
Cost: eight small calls so far on invented data, total under $0.002.
Alternatives: the model writing queries (rejected: far too much power); one tool that returns everything (rejected: large, slow, costly, and it would carry private notes).
Status: open
