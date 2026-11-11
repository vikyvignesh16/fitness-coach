# Example questions and queries

This is practice material for the coach library. Each example pairs a plain question with a query that answers it. It is not health evidence.

## How far did I run each week this month?

```sql
select date_trunc('week', started_at at time zone 'Europe/Paris')::date as week,
       round(sum(distance_km)::numeric, 1) as km
from runs
where started_at >= date_trunc('month', now())
group by 1
order by 1;
```

## What was my average resting heart rate over the last 14 days?

```sql
select round(avg(resting_hr), 0) as avg_resting_hr
from health_daily
where day >= current_date - 13
  and resting_hr is not null;
```

Days without a reading are left out. They are not counted as zero.

## On which nights did I sleep under six hours?

```sql
select day, sleep_asleep_min
from health_daily
where sleep_asleep_min < 360
order by day desc
limit 20;
```

## What are my longest runs?

```sql
select started_at::date as day, distance_km
from runs
order by distance_km desc
limit 10;
```

## How did my HRV compare with its normal range last week?

```sql
select day, hrv_avg_ms, hrv_normal_low_ms, hrv_normal_high_ms, hrv_label
from health_daily
where day >= current_date - 6
order by day;
```

## What did the plan say for a given date?

```sql
select pd.date, pd.run, pd.gym
from plan_days pd
join plan_versions pv on pv.id = pd.plan_version_id
where pd.date = '2026-11-18'
order by pv.created_at desc
limit 1;
```

The newest plan version is the one that counts.
