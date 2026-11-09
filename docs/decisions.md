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
