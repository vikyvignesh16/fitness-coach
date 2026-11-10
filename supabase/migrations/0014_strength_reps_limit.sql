-- A continuous movement, like the "Whole Body" block on 2026-08-30, can count over a thousand reps in one set.
-- The first limit (1000) was a guess and rejected a real value. The real number is kept, and the limit is now 10000,
-- which is still far above anything a person does and still catches a bug that writes a nonsense number.
alter table strength_sets drop constraint strength_sets_reps_check;
alter table strength_sets add constraint strength_sets_reps_check check (reps between 0 and 10000);
