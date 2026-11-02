"""Import plan v5.1 into Supabase, unchanged.

Dry run by default. Pass --apply to write. Refuses to run if the version already exists.
Uses the service role key from the environment, because RLS blocks everything else.
"""
import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

PLAN_FILE = Path(__file__).resolve().parent.parent / "data" / "paris_marathon_2027_v5_1_coros_ready.json"


def expand_plan(plan: dict) -> tuple[list[dict], list[dict], list[dict]]:
    """Split the plan into week rows, day rows and gate rows. Does not change any value."""
    weeks, days, gates = [], [], []
    for w in plan["weeks"]:
        weeks.append({
            "week": w["week"],
            "start_date": w["start_date"],
            "phase": w["phase"],
            "total_km": w["total_km"],
        })
        for d in w["days"]:
            days.append({
                "date": d["date"],
                "week": w["week"],
                "run": d.get("run"),
                "gym": d.get("gym"),
                "nutrition": d.get("nutrition"),
            })
    for g in plan["gates"]:
        gates.append({"gate_id": g["id"], "definition": g})
    return weeks, days, gates


def find_owner(client) -> str:
    """The app has one user. If there is not exactly one, stop and ask."""
    users = client.auth.admin.list_users()
    if len(users) != 1:
        sys.exit(f"Expected exactly 1 Supabase user, found {len(users)}. Create your login first.")
    return users[0].id


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="write to the database")
    args = parser.parse_args()

    plan = json.loads(PLAN_FILE.read_text())
    weeks, days, gates = expand_plan(plan)
    print(f"Plan {plan['plan_version']}: {len(weeks)} weeks, {len(days)} days, {len(gates)} gates")
    if not args.apply:
        print("Dry run. Nothing written. Pass --apply to import.")
        return

    load_dotenv()
    from supabase import create_client
    client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    owner = find_owner(client)

    existing = client.table("plan_versions").select("id").eq("version", plan["plan_version"]).execute()
    if existing.data:
        sys.exit(f"Version {plan['plan_version']} already exists. Plan versions are never overwritten.")

    row = client.table("plan_versions").insert(
        {"user_id": owner, "version": plan["plan_version"], "source": plan}
    ).execute().data[0]
    pid = row["id"]

    def tag(rows):
        return [{**r, "plan_version_id": pid, "user_id": owner} for r in rows]

    client.table("plan_weeks").insert(tag(weeks)).execute()
    client.table("plan_days").insert(tag(days)).execute()
    client.table("gates").insert(tag(gates)).execute()
    print(f"Imported plan {plan['plan_version']} as {pid}")


if __name__ == "__main__":
    main()
