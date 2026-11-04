---
name: safety-rules
description: The hard safety limits for the training plan. Use when writing or changing the safety check functions in coach/safety/, their tests, or anything that validates a plan.
---

# Safety rules

Set by Vicky on 2026-11-02. Each rule is a plain, tested function in coach/safety/. A function returns a list of violations. Each violation has a rule id, a level (warning or fail), the week or date, and a plain sentence. Code never edits a plan. Fails go back to the model for a revised plan. Warnings are shown to Vicky.

Never weaken a limit to make a test pass. Never move a limit into a prompt. To change a number, Vicky decides, then add a decision log entry.

## 1. Weekly mileage ramp (rule id: ramp)
* Compare each week's total km with the highest of the previous four weeks (changed 2026-11-04 by Vicky; it used to be the last non recovery week). A dip from a race or a recovery week does not lower the baseline, and a peak more than four weeks back is forgotten.
* Warning above 10 percent. Fail above 15 percent. Exactly 10 percent is fine.
* Week 2 is exempt. Its baseline is 33.55 km, the average of 34.08 and 33.02, not the 8.01 km of week 1.
* Race week (week 23) is exempt.
* Falling mileage is never a violation.

## 2. Long run (rule ids: long_run_cap, long_run_share)
* Fail if any single run is above 32 km, except on race day.
* Share of the weekly total: warning above 45 percent, fail above 50 percent.
* Race week and the half marathon test week (week 19) are exempt from the share check.

## 3. Rest days (rule ids: rest_running, rest_full)
* At least 2 days a week with no running.
* At least 1 day a week with no running and no heavy lifting. Saturday mobility counts as light.
* Fail level.

## 4. Quality sessions and heavy legs (rule ids: quality_max, legs_gap, legs_dates)
* Maximum 1 quality session per week. In a test week (10K trial or half marathon) the test counts as one, and the limit is 2, so the test plus one quality run. Vicky chose this on 2026-11-02 after v5.1 week 19 had both.
* No heavy leg session within 72 hours before a long run, a test or the race.
* No heavy leg session the day before a quality run.
* Last heavy legs: 2027-03-11 only if Vicky recovered from the 7 March half marathon. Otherwise 2027-02-25. No legs in race week.
* Fail level.

## 5. Pain and injury stop (rule id: pain_stop)
* Use persistent_pain_stop from the plan JSON exactly as written.
* Also stop the same way on any swelling, giving way, gait change, or inability to bear weight.
* The message always says to seek sports physio or clinician assessment. Inability to bear weight says to seek prompt medical assessment.
* This is not medical advice.

## 6. Ankle gate (rule id: ankle_return_w2)
* Stored exactly as written in the plan JSON, including the "26 km" text in on_fail. Do not fix it.
* The app records Vicky's answer and the result of each of the four checks, with the date, as the first approval record.
* Week 2 sessions stay locked until that record says passed.
* Other gates (long_run_25k_gate) are recorded the same way before their date.

## How the code reads the rules (code: coach/safety/)
* plan_rules.py checks plans, health_rules.py checks pain and the ankle gate. Both return Violation objects.
* Week 1 (phase Actual) is history and is never checked.
* Weekly distance is the sum of the daily runs, not the declared total_km. In v5.1 they match.
* Heavy lifting or heavy legs means a lifting session with more than 10 sets. Mobility and empty days are light. Vicky chose this on 2026-11-02. It keeps the 2 to 4 set activation sessions in weeks 19, 22 and 23, and the 10 set session in week 21, light.
* 72 hours means 3 full days. Heavy legs on Thursday and a long run on Sunday is allowed. Friday is not.
* A test or the race also counts as a quality run for the "day before" rule.
* Recovery from the half marathon is True, False or None. None means Vicky has not recorded it yet. With None, heavy legs on 11 March pass with a warning. With False they fail.
* Pain: the plan says lasting "24 to 48 hours". The code stops at more than 24 hours, the cautious end.
* Unknown pain flags raise an error instead of being ignored.

## v5.1 against these rules (2026-11-02)
No fails. Warnings: ramp in weeks 3, 4, 7 and 15, long run share in weeks 6 and 8 (45.5 percent), and heavy legs on 11 March until recovery is recorded.

## Notes for the next model revision
See docs/notes_for_model.md.
