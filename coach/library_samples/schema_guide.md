# Athlete app database guide

This is practice material for the coach library. It describes the tables in plain words. It is not health evidence.

## Units and dates

Run durations are in seconds. Sleep and nap times are in minutes. Distances are in kilometres. Heart rate is in beats per minute. HRV (heart rate variability) is in milliseconds. All dates are Paris dates.

## runs

One row per run recorded by the COROS watch. Columns include started_at, distance_km, duration_s, avg_hr (average heart rate), elevation_m, training_load (the COROS load number for that run) and perceived_effort (how hard it felt, from Very Easy to Very Hard). Pace is not stored. It is worked out as duration divided by distance.

Run notes are private. The coach never reads them.

## health_daily

One row per day of watch health data. Sleep columns: sleep_score, sleep_asleep_min, sleep_deep_min, sleep_rem_min, sleep_light_min, sleep_awake_min. Heart rate variability columns: hrv_avg_ms for last night, hrv_normal_low_ms and hrv_normal_high_ms for the normal range COROS gives for that day, and hrv_label with COROS's words such as Low or Normal. Other columns: resting_hr, stress_avg, load_ratio (short term load compared with long term load), load_label and recovery_last (recovery percent).

A missing number is null. It means the watch did not record it. It never means zero.

## plan_versions and plan_days

The training plan is stored in versions. A version is never overwritten. A new plan from the model becomes a new version. plan_days holds one row per date for a version, with a run part and a gym part stored as JSON. The run part has type, distance_km, duration_min and pace_or_effort. The gym part has a session name and key_exercises.

## strength_sessions and strength_sets

One row per gym session recorded on the COROS watch, with workout_name, duration_s, sets_count, avg_hr, calories and training_load. strength_sets holds one row per set with the exercise, reps and weight_kg. Body weight sets have an empty weight. The workout_note column is private and is never read by the coach.

## llm_calls and coach_settings

llm_calls logs every model call with its purpose, model, token counts, cost in dollars and whether it worked. It never stores the question or the answer. coach_settings holds the monthly spending cap in dollars.

## chat_threads, chat_messages and coach_memory

chat_threads and chat_messages hold the conversations. coach_memory holds short facts the runner asked the coach to remember, up to 50 facts of 200 characters each.
