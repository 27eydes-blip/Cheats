#!/usr/bin/env python3
"""Download a real college football season from ESPN's public scoreboard feed.

Writes, in the model's formats:
    data/<season>/teams.csv     FBS teams and conferences
    data/<season>/games.csv     every completed game, with closing lines when ESPN has them
    data/<season>/matchups.csv  the upcoming week's games with the current spread, total and moneylines

Usage:
    python fetch_espn.py --season 2026 --week 10
then:
    python model.py bets --teams data/2026/teams.csv --games data/2026/games.csv --matchups data/2026/matchups.csv

No API key needed. The session or computer running this must be allowed to reach
site.api.espn.com.
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.request

import pandas as pd

BASE = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard"
HERE = os.path.dirname(os.path.abspath(__file__))


def get(params):
    url = BASE + "?" + "&".join(f"{k}={v}" for k, v in params.items())
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "cfb-model"}), timeout=30) as r:
                return json.load(r)
        except Exception as e:  # network hiccup: back off and retry
            if attempt == 3:
                sys.exit(f"Could not download {url}: {e}")
            time.sleep(2 ** attempt)


def team_name(c):
    t = c.get("team", {})
    return t.get("location") or t.get("shortDisplayName") or t.get("displayName")


def parse_odds(comp, home, away, home_abbr, away_abbr):
    """Spread from the home team's view (negative = home favored), total and moneylines."""
    out = {}
    odds = (comp.get("odds") or [None])[0]
    if not odds:
        return out
    spread = odds.get("spread")
    details = (odds.get("details") or "").strip()
    if details.upper() in ("EVEN", "PK", "PICK"):
        spread = 0.0
    elif spread is None and details:
        m = re.match(r"(\S+)\s+([-+]?\d+(\.\d+)?)", details)
        if m:
            fav, pts = m.group(1), float(m.group(2))
            spread = pts if fav == home_abbr else -pts if fav == away_abbr else None
    elif spread is not None and details:
        # ESPN's `spread` is sometimes from the favorite's view; trust `details` for the sign.
        m = re.match(r"(\S+)\s+([-+]?\d+(\.\d+)?)", details)
        if m:
            fav, pts = m.group(1), abs(float(m.group(2)))
            spread = -pts if fav == home_abbr else pts if fav == away_abbr else spread
    if spread is not None:
        out["vegas_home_spread"] = float(spread)
    if odds.get("overUnder") is not None:
        out["vegas_total"] = float(odds["overUnder"])
    hml = (odds.get("homeTeamOdds") or {}).get("moneyLine")
    aml = (odds.get("awayTeamOdds") or {}).get("moneyLine")
    if hml is not None and aml is not None:
        out["home_ml"], out["away_ml"] = int(hml), int(aml)
    so = (odds.get("homeTeamOdds") or {}).get("spreadOdds")
    if so is not None:
        out["spread_odds"] = int(so)
    return out


def week_events(season, week, seasontype=2):
    data = get({"dates": season, "seasontype": seasontype, "week": week, "groups": 80, "limit": 400})
    rows = []
    for ev in data.get("events", []):
        comp = ev["competitions"][0]
        cs = {c["homeAway"]: c for c in comp["competitors"]}
        if "home" not in cs or "away" not in cs:
            continue
        h, a = cs["home"], cs["away"]
        st = comp.get("status", ev.get("status", {})).get("type", {})
        row = {"week": week if seasontype == 2 else 100 + week, "date": ev.get("date", "")[:10],
               "home": team_name(h), "away": team_name(a),
               "home_conf": h.get("team", {}).get("conferenceId"), "away_conf": a.get("team", {}).get("conferenceId"),
               "neutral": bool(comp.get("neutralSite")), "completed": bool(st.get("completed"))}
        if row["completed"]:
            row["home_points"], row["away_points"] = int(h.get("score", 0)), int(a.get("score", 0))
        row.update(parse_odds(comp, row["home"], row["away"], h.get("team", {}).get("abbreviation"), a.get("team", {}).get("abbreviation")))
        rows.append(row)
    return rows


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--season", type=int, required=True)
    p.add_argument("--week", type=int, required=True, help="the upcoming week to build matchups for")
    p.add_argument("--out", default=None, help="output folder (default data/<season>)")
    a = p.parse_args()
    out = a.out or os.path.join(HERE, "data", str(a.season))
    os.makedirs(out, exist_ok=True)

    rows = []
    for wk in range(1, a.week + 1):
        print(f"week {wk}...", file=sys.stderr)
        rows += week_events(a.season, wk)
    df = pd.DataFrame(rows)
    if df.empty:
        sys.exit("ESPN returned no games for that season/week.")

    # FBS teams: those that play mostly against each other. FCS opponents show up only a few times.
    counts = pd.concat([df["home"], df["away"]]).value_counts()
    fbs = sorted(counts[counts >= max(3, min(6, a.week // 2))].index)
    conf = {}
    for side in ("home", "away"):
        for t, c in zip(df[side], df[f"{side}_conf"]):
            conf.setdefault(t, c)
    pd.DataFrame({"team": fbs, "conference": [conf.get(t) for t in fbs]}).to_csv(os.path.join(out, "teams.csv"), index=False)

    done = df[df["completed"]]
    gcols = [c for c in ["week", "date", "home", "away", "home_points", "away_points", "neutral", "vegas_home_spread", "vegas_total"] if c in done]
    done[gcols].to_csv(os.path.join(out, "games.csv"), index=False)

    up = df[(df["week"] == a.week) & (~df["completed"])]
    mcols = [c for c in ["date", "home", "away", "neutral", "vegas_home_spread", "vegas_total", "home_ml", "away_ml", "spread_odds"] if c in up]
    up[mcols].to_csv(os.path.join(out, "matchups.csv"), index=False)
    print(f"{len(fbs)} FBS teams, {len(done)} completed games, {len(up)} upcoming week-{a.week} games -> {out}")


if __name__ == "__main__":
    main()
