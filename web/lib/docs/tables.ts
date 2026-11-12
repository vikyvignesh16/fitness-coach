// Every table in the database, in plain words. A test fails when a table is created in supabase/migrations
// and is not described here. "service" means the server side jobs and the coach service, which hold the master key.
// Every table has Row Level Security on: you only ever see rows where user_id is you.
import type { TableDoc } from "./types";

export const TABLE_AREAS = ["Plan", "Runs and watch", "Health", "Gym", "Check ins", "Chat and memory", "Library", "Costs", "Other"] as const;

export const TABLES: TableDoc[] = [
  // ---- plan
  { name: "plan_versions", area: "Plan", stores: "One row per version of the training plan. v5.1 is the plan of record.", columns: "version name, the whole plan as JSON, when it was added",
    writer: "database function", writtenBy: "ingest/import_plan.py added v5.1. The adopt_plan_proposal function adds any later version.", readBy: "Home, Plan, Calendar, the coach's plan day tool, the watch job",
    migration: "0001_plan_tables.sql", note: "Locked by a trigger: rows can be added but never changed or deleted. A new plan is a new version." },
  { name: "plan_weeks", area: "Plan", stores: "One row per week of a plan version.", columns: "week number, start date, phase, total kilometres",
    writer: "database function", writtenBy: "The same import and adopt steps as plan_versions", readBy: "Home, Plan, Insights weekly volume", migration: "0001_plan_tables.sql", note: "Locked like plan_versions." },
  { name: "plan_days", area: "Plan", stores: "One row per day of a plan version: the run, the gym work, the food guidance and the coaching notes.", columns: "date, week, run, gym, nutrition and coaching notes (each as JSON)",
    writer: "database function", writtenBy: "The same import and adopt steps as plan_versions", readBy: "Home, Plan, Calendar, the calendar feed, the watch job, the coach's plan day tool",
    migration: "0001_plan_tables.sql", note: "Food guidance came in 0004 and coaching notes in 0010. Locked like plan_versions." },
  { name: "gates", area: "Plan", stores: "The checkpoints in the plan, like the ankle return and the 25 km long run gate.", columns: "gate id, the definition as written in the plan",
    writer: "database function", writtenBy: "The same import and adopt steps as plan_versions", readBy: "The ankle check page, the lock on later weeks", migration: "0001_plan_tables.sql" },
  { name: "plan_changes", area: "Plan", stores: "A record each time a new plan version replaces the old one.", columns: "from version, to version, the reason, any broken limits",
    writer: "database function", writtenBy: "The adopt_plan_proposal function", readBy: "The Plan page", migration: "0001_plan_tables.sql" },
  { name: "plan_proposals", area: "Plan", stores: "A draft plan from ChatGPT that has been checked and is waiting for you.", columns: "version, the plan, the reason, the check results, status (draft, adopted or rejected)",
    writer: "service", writtenBy: "python -m coach.check_proposal with --save", readBy: "The Plan page and the draft banner", migration: "0010_plan_proposals.sql", note: "You can read drafts but not write them. Adopting one goes through the adopt_plan_proposal function." },
  { name: "approvals", area: "Plan", stores: "Your decisions: a plan approved, a gate passed, or a run approved for the watch.", columns: "kind, date, passed or not, the checks, a note, and the sending status for watch runs",
    writer: "service and you", writtenBy: "You, from the Approve page and the ankle form. The watch job fills in the sending columns.", readBy: "Approve, Gym lock, the watch job",
    migration: "0001_plan_tables.sql", note: "A trigger blanks the sending columns if you try to write them, so only the watch job can mark a run as sent." },

  // ---- runs and watch
  { name: "runs", area: "Runs and watch", stores: "One row per run, from your COROS watch.", columns: "COROS id, start time, distance, time, heart rate, elevation, effort, cadence, power, your note",
    writer: "service", writtenBy: "ingest/coros_runs.py every 15 minutes, and ingest/coros_run_details.py for the extra detail", readBy: "Home, Runs, Calendar, Insights, the coach's recent runs tool",
    migration: "0002_tracking_tables.sql", note: "Detail columns were added in 0012. A value COROS did not give stays empty." },
  { name: "coros_tokens", area: "Runs and watch", stores: "The COROS login, so the jobs can read and write your watch.", columns: "the COROS address, client id, access and refresh tokens and when they expire",
    writer: "service", writtenBy: "ingest/coros_login.py once, then ingest/coros_auth.py on every refresh", readBy: "The ingest jobs only. No screen and no tool can read it.",
    migration: "0005_coros_tokens.sql", note: "Never printed, never logged, never shown. Row Level Security is on with no policies, so nobody signed in can touch it." },
  { name: "strength_sessions", area: "Gym", stores: "One row per strength workout, from the watch or typed by you.", columns: "start time, name, duration, sets count, heart rate, calories, load, effort, your note, source (coros or manual)",
    writer: "service and you", writtenBy: "ingest/coros_gym.py for watch sessions. You, from the Gym page, for manual ones.", readBy: "Gym, Insights training load",
    migration: "0013_strength_from_coros.sql", note: "You can change only the manual rows." },
  { name: "strength_sets", area: "Gym", stores: "One row per set in a strength session.", columns: "position, exercise, reps, weight, seconds, heart rate",
    writer: "service and you", writtenBy: "The same as strength_sessions", readBy: "Gym", migration: "0013_strength_from_coros.sql" },

  // ---- health
  { name: "health_daily", area: "Health", stores: "One row per day of watch health numbers.", columns: "sleep score and stages, HRV, resting and average heart rate, stress, steps, training load, recovery, VO2max, race predictions",
    writer: "service", writtenBy: "ingest/coros_health.py every 3 hours. It reads the last 3 days each time.", readBy: "Insights, the coach's recent health tool", migration: "0011_health_tables.sql",
    note: "Each value has a range check. A day with no data has empty values, never zeros." },
  { name: "recovery_snapshots", area: "Health", stores: "A recovery reading taken during the day, because COROS only gives today's value.", columns: "time taken, day, recovery percent, level, hours to full recovery",
    writer: "service", writtenBy: "ingest/coros_health.py", readBy: "Insights recovery chart", migration: "0011_health_tables.sql" },

  // ---- check ins
  { name: "checkins", area: "Check ins", stores: "One weekly check in.", columns: "week, morning weight, height, feeling, pain score and details, whether the pain stop fired, three photo paths, the review",
    writer: "you", writtenBy: "The Check in page", readBy: "The Check in page, the watch job (it stops sending when the pain stop fired)", migration: "0002_tracking_tables.sql",
    note: "Photos are in the private photos storage bucket and only the paths are here. The pain stop is worked out on the server." },
  { name: "meals", area: "Other", stores: "A meal with a calorie and protein range and an optional photo.", columns: "time, description, calorie range, protein range, photo path, confirmed or not",
    writer: "you", writtenBy: "Nothing yet. The Food screen is not built.", readBy: "Nothing yet", migration: "0002_tracking_tables.sql", note: "Ready for later. Estimates are always ranges and need your confirmation." },

  // ---- chat and memory
  { name: "chat_threads", area: "Chat and memory", stores: "One conversation with the coach.", columns: "title, when it started",
    writer: "service", writtenBy: "The coach service when you send the first message", readBy: "The Chat page", migration: "0018_chat_memory.sql", note: "You can delete your own threads." },
  { name: "chat_messages", area: "Chat and memory", stores: "The messages in a conversation, yours and the coach's.", columns: "thread, role (you or coach), the text",
    writer: "service", writtenBy: "The coach service, after a turn passes its checks", readBy: "The Chat page, and the coach as short term memory (the last 20)", migration: "0018_chat_memory.sql" },
  { name: "coach_memory", area: "Chat and memory", stores: "Short facts the coach keeps because you asked it to.", columns: "the fact (200 characters at most), where it came from",
    writer: "service", writtenBy: "The coach's save memory tool", readBy: "Every chat, as long term memory. The Chat page shows them.", migration: "0018_chat_memory.sql", note: "You can delete any fact with the Forget button." },

  // ---- library
  { name: "library_chunks", area: "Library", stores: "The coach's library, cut into short pieces, each with its meaning stored as 1536 numbers.", columns: "source document, kind (sample or evidence), heading, the text, a fingerprint, the numbers",
    writer: "service", writtenBy: "coach/library.py when someone indexes a document", readBy: "The coach's search library tool, through the match_library_chunks function", migration: "0019_library_chunks.sql",
    note: "Only pieces of kind evidence may be cited as a source for health advice. The evidence library itself is still empty." },
  { name: "evidence_library", area: "Library", stores: "A planned list of health sources the app may cite.", columns: "title, claim, link, year, verified or not",
    writer: "service", writtenBy: "Nothing yet", readBy: "Nothing yet", migration: "0003_evidence_security.sql", note: "Shared reference data. It is on hold until the resource library is ready." },

  // ---- costs
  { name: "llm_calls", area: "Costs", stores: "A receipt for every model call.", columns: "time, purpose, model, tokens in and out, cost, whether it worked, a short error code",
    writer: "service", writtenBy: "coach/guard.py after each chat model call, and coach/embeddings.py after each embedding call", readBy: "The Costs page, the Chat spending line, the cap check", migration: "0017_llm_calls.sql",
    note: "Never holds a question, an answer, a photo or a key." },
  { name: "coach_settings", area: "Costs", stores: "Your settings for the coach. Today that is the monthly spending cap.", columns: "monthly cap in dollars",
    writer: "you", writtenBy: "You can change your own cap", readBy: "The cap check, the Costs and Chat pages", migration: "0017_llm_calls.sql", note: "With no row, the cap is $10." },

  // ---- other
  { name: "calendar_feeds", area: "Other", stores: "The private calendar link, stored as a fingerprint of the token.", columns: "a hash of the token",
    writer: "you", writtenBy: "The Calendar page", readBy: "The calendar_feed function", migration: "0009_calendar_feed.sql", note: "The real token is shown once and never stored." },
];

export type FunctionDoc = { name: string; what: string; migration: string };
export const FUNCTIONS: FunctionDoc[] = [
  { name: "adopt_plan_proposal", what: "Copies a draft plan into the plan tables as a new version in one step, cancels sends for days that changed, and records the change.", migration: "0010_plan_proposals.sql" },
  { name: "calendar_feed", what: "Hands the calendar app the planned runs for a link token. It is the only thing a signed out visitor may call.", migration: "0009_calendar_feed.sql" },
  { name: "match_library_chunks", what: "Finds the library pieces closest in meaning to a question. It runs as you, so Row Level Security still applies.", migration: "0019_library_chunks.sql" },
];
