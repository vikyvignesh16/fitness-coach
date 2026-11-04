"""Vicky's home time zone. Which calendar day a run or an approval belongs to is decided here.

The web app has the same value in web/lib/weeks.ts (HOME_TIME_ZONE). Change both together.
"""
from zoneinfo import ZoneInfo

HOME_ZONE = ZoneInfo("Europe/Paris")
