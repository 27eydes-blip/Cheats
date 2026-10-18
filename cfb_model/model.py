#!/usr/bin/env python3
"""College football power-rating model.

Rates every team on many stat categories, combines them into one power
rating, adjusts for opponents using game results, and predicts spreads,
win probabilities and totals for upcoming games.

Usage:
    python model.py rate     --teams data/teams.csv [--games data/games.csv]
    python model.py predict  --teams data/teams.csv --games data/games.csv --matchups data/matchups.csv
    python model.py backtest --teams data/teams.csv --games data/games.csv

Only `team` is required in teams.csv. Any stat column that is missing is
skipped and its weight is shared out among the stats that are present.
"""
import argparse
import json
import math
import os
import sys

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))

# Each stat: (column, higher_is_better). Grouped into categories that each
# get a weight in weights.json.
CATEGORIES = {
    "offense_efficiency": [
        ("off_ppg", True),
        ("off_yards_per_play", True),
        ("off_success_rate", True),
        ("off_points_per_drive", True),
        ("off_third_down_pct", True),
    ],
    "defense_efficiency": [
        ("def_ppg", False),
        ("def_yards_per_play", False),
        ("def_success_rate", False),
        ("def_points_per_drive", False),
        ("def_third_down_pct", False),
    ],
    "rushing": [
        ("off_rush_ypc", True),
        ("def_rush_ypc", False),
        ("off_line_yards", True),
        ("def_stuff_rate", True),
    ],
    "passing": [
        ("off_pass_ypa", True),
        ("def_pass_ypa", False),
        ("off_qb_rating", True),
        ("def_qb_rating", False),
        ("off_sack_rate_allowed", False),
    ],
    "explosiveness": [
        ("off_explosive_rate", True),
        ("def_explosive_rate", False),
    ],
    "finishing_drives": [
        ("off_red_zone_td_pct", True),
        ("def_red_zone_td_pct", False),
        ("off_points_per_scoring_opp", True),
        ("def_points_per_scoring_opp", False),
    ],
    "havoc_pressure": [
        ("def_havoc_rate", True),
        ("def_sacks_per_game", True),
        ("def_tfl_per_game", True),
        ("off_havoc_allowed", False),
    ],
    "ball_security": [
        ("turnover_margin_per_game", True),
        ("off_turnovers_per_game", False),
        ("def_takeaways_per_game", True),
    ],
    "special_teams": [
        ("fg_pct", True),
        ("net_punt_avg", True),
        ("kick_return_avg", True),
        ("punt_return_avg", True),
        ("opp_kick_return_avg", False),
    ],
    "field_position": [
        ("off_avg_start_yardline", True),   # own yardline, higher = better
        ("def_avg_start_yardline", False),  # opponent's own yardline
    ],
    "discipline": [
        ("penalty_yards_per_game", False),
        ("penalties_per_game", False),
    ],
    "talent_experience": [
        ("recruiting_score", True),         # e.g. 247 team talent composite
        ("returning_production", True),     # 0-1
        ("transfer_portal_score", True),
    ],
    "schedule_results": [
        ("win_pct", True),
        ("strength_of_schedule", True),     # avg opponent rating, higher = harder
        ("point_margin_per_game", True),
    ],
    "situational": [
        ("time_of_possession_min", True),
        ("off_fourth_down_pct", True),
        ("def_fourth_down_pct", False),
        ("close_game_win_pct", True),
    ],
}

# Home-field advantage in points (FBS average is roughly 2-3).
DEFAULT_HFA = 2.5
# Std. dev. of actual margin around the predicted spread, used for win prob.
MARGIN_SD = 15.5
# Cap blowouts so running up the score doesn't over-inflate ratings.
MOV_CAP = 28
# Ridge penalty for the opponent-adjusted fit (shrinks low-sample teams to 0).
RIDGE = 2.0


def load_weights(path):
    with open(path) as f:
        w = json.load(f)
    unknown = set(w["category_weights"]) - set(CATEGORIES)
    if unknown:
        sys.exit(f"Unknown categories in weights file: {sorted(unknown)}")
    return w


def zscore(series):
    s = pd.to_numeric(series, errors="coerce")
    sd = s.std(ddof=0)
    if not sd or np.isnan(sd):
        return pd.Series(0.0, index=s.index)
    # Missing values become league average (0) rather than dropping the team.
    return ((s - s.mean()) / sd).fillna(0.0).clip(-3, 3)


def stat_ratings(teams, weights):
    """Z-score every available stat, average into categories, weight into one score."""
    cat_scores = {}
    used = {}
    for cat, stats in CATEGORIES.items():
        cols = [(c, hib) for c, hib in stats if c in teams.columns and teams[c].notna().any()]
        if not cols:
            continue
        zs = [zscore(teams[c]) * (1 if hib else -1) for c, hib in cols]
        cat_scores[cat] = sum(zs) / len(zs)
        used[cat] = [c for c, _ in cols]

    cw = {c: weights["category_weights"].get(c, 0.0) for c in cat_scores}
    total = sum(cw.values())
    if total <= 0:
        sys.exit("No usable stat columns found in teams file (or all weights are 0).")
    cats = pd.DataFrame(cat_scores, index=teams.index)
    composite = sum(cats[c] * (cw[c] / total) for c in cats.columns)
    return cats, composite, used


def opponent_adjusted(games, team_list, hfa, ridge=RIDGE):
    """Ridge regression: margin = rating_home - rating_away + hfa (if not neutral)."""
    idx = {t: i for i, t in enumerate(team_list)}
    g = games.dropna(subset=["home_points", "away_points"])
    g = g[g["home"].isin(idx) & g["away"].isin(idx)]
    if g.empty:
        return pd.Series(0.0, index=team_list), 0
    X = np.zeros((len(g), len(team_list)))
    y = np.zeros(len(g))
    neutral = g.get("neutral", pd.Series(False, index=g.index)).fillna(False).astype(bool)
    for r, (_, row) in enumerate(g.iterrows()):
        X[r, idx[row["home"]]] = 1
        X[r, idx[row["away"]]] = -1
        margin = np.clip(row["home_points"] - row["away_points"], -MOV_CAP, MOV_CAP)
        y[r] = margin - (0 if neutral.loc[row.name] else hfa)
    A = X.T @ X + ridge * np.eye(len(team_list))
    beta = np.linalg.solve(A, X.T @ y)
    return pd.Series(beta - beta.mean(), index=team_list), len(g)


def build_ratings(teams, games, weights):
    teams = teams.copy()
    teams["team"] = teams["team"].astype(str).str.strip()
    teams = teams.drop_duplicates("team").set_index("team", drop=False)
    hfa = weights.get("home_field_advantage", DEFAULT_HFA)

    cats, composite, used = stat_ratings(teams, weights)
    # Convert the composite z-score to points. Calibrated to ~ the spread of
    # FBS team strength (1 SD of team quality is ~ 12-14 points).
    points_per_sd = weights.get("points_per_sd", 13.0)
    stat_pts = composite / (composite.std(ddof=0) or 1) * points_per_sd

    out = pd.DataFrame(index=teams.index)
    out["team"] = teams["team"]
    if "conference" in teams.columns:
        out["conference"] = teams["conference"]
    out["stat_rating"] = stat_pts

    blend = weights.get("results_blend", 0.5)
    n_games = 0
    if games is not None and len(games):
        adj, n_games = opponent_adjusted(games, list(teams.index), hfa)
        out["results_rating"] = adj
        # Trust results more as the season goes on (more games per team).
        gp = n_games * 2 / max(len(teams), 1)
        w_res = blend * min(1.0, gp / 8)
        out["power_rating"] = (1 - w_res) * out["stat_rating"] + w_res * out["results_rating"]
    else:
        out["power_rating"] = out["stat_rating"]

    for c in cats.columns:
        out[f"cat_{c}"] = cats[c]
    out = out.sort_values("power_rating", ascending=False)
    out.insert(0, "rank", range(1, len(out) + 1))
    return out, used, n_games


def win_prob(spread):
    return 0.5 * (1 + math.erf(spread / (MARGIN_SD * math.sqrt(2))))


def predict(ratings, matchups, teams, weights):
    hfa = weights.get("home_field_advantage", DEFAULT_HFA)
    pace = None
    if {"off_ppg", "def_ppg"} <= set(teams.columns):
        t = teams.set_index("team")
        lg = pd.to_numeric(t["off_ppg"], errors="coerce").mean()
        pace = (t, lg)
    rows = []
    for _, m in matchups.iterrows():
        h, a = str(m["home"]).strip(), str(m["away"]).strip()
        if h not in ratings.index or a not in ratings.index:
            print(f"warning: skipping {a} @ {h} (team not in teams file)", file=sys.stderr)
            continue
        neutral = bool(m.get("neutral", False)) if not pd.isna(m.get("neutral", False)) else False
        spread = ratings.at[h, "power_rating"] - ratings.at[a, "power_rating"] + (0 if neutral else hfa)
        row = {
            "away": a, "home": h, "neutral": neutral,
            "pick": h if spread >= 0 else a,
            "home_spread": round(-spread, 1),
            "home_win_prob": round(win_prob(spread), 3),
        }
        if pace:
            t, lg = pace
            # Expected points: own offense vs opponent defense, relative to league avg.
            hp = float(t.at[h, "off_ppg"]) + float(t.at[a, "def_ppg"]) - lg
            ap = float(t.at[a, "off_ppg"]) + float(t.at[h, "def_ppg"]) - lg
            total = hp + ap
            row["proj_total"] = round(total, 1)
            row["proj_score"] = f"{a} {round(total / 2 - spread / 2)} - {h} {round(total / 2 + spread / 2)}"
        if "vegas_home_spread" in m and not pd.isna(m["vegas_home_spread"]):
            edge = float(m["vegas_home_spread"]) - row["home_spread"]
            row["vegas_home_spread"] = m["vegas_home_spread"]
            row["edge_pts"] = round(edge, 1)  # >0: model likes home vs the line
            row["ats_pick"] = h if edge > 0 else a
        if "vegas_total" in m and not pd.isna(m["vegas_total"]) and "proj_total" in row:
            row["vegas_total"] = m["vegas_total"]
            diff = row["proj_total"] - float(m["vegas_total"])
            row["ou_pick"] = "OVER" if diff > 0 else "UNDER" if diff < 0 else "PUSH"
        rows.append(row)
    return pd.DataFrame(rows)


def backtest(teams, games, weights):
    """Walk forward week by week: rate using only earlier games, predict the next week."""
    if "week" not in games.columns:
        sys.exit("backtest needs a 'week' column in games.csv")
    g = games.dropna(subset=["home_points", "away_points"]).copy()
    hfa = weights.get("home_field_advantage", DEFAULT_HFA)
    res = []
    for wk in sorted(g["week"].unique())[1:]:
        past = g[g["week"] < wk]
        cur = g[g["week"] == wk]
        r, _, _ = build_ratings(teams, past, weights)
        for _, row in cur.iterrows():
            if row["home"] not in r.index or row["away"] not in r.index:
                continue
            neutral = bool(row.get("neutral", False)) if not pd.isna(row.get("neutral", False)) else False
            sp = r.at[row["home"], "power_rating"] - r.at[row["away"], "power_rating"] + (0 if neutral else hfa)
            actual = row["home_points"] - row["away_points"]
            res.append({"week": wk, "pred": sp, "actual": actual,
                        "correct": (sp >= 0) == (actual > 0),
                        "brier": (win_prob(sp) - (actual > 0)) ** 2})
    if not res:
        sys.exit("not enough games to backtest")
    df = pd.DataFrame(res)
    print(f"Games tested:        {len(df)}")
    print(f"Straight-up correct: {df['correct'].mean():.1%}")
    print(f"Mean abs error:      {(df['pred'] - df['actual']).abs().mean():.1f} pts")
    print(f"Brier score:         {df['brier'].mean():.3f}  (0.25 = coin flip, lower is better)")
    return df


def read_csv(path):
    if not path:
        return None
    if not os.path.exists(path):
        sys.exit(f"File not found: {path}")
    return pd.read_csv(path)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("command", choices=["rate", "predict", "backtest"])
    p.add_argument("--teams", required=True)
    p.add_argument("--games")
    p.add_argument("--matchups")
    p.add_argument("--weights", default=os.path.join(HERE, "weights.json"))
    p.add_argument("--out", help="write results to this CSV")
    p.add_argument("--top", type=int, default=25)
    a = p.parse_args()

    weights = load_weights(a.weights)
    teams = read_csv(a.teams)
    if "team" not in teams.columns:
        sys.exit("teams file needs a 'team' column")
    games = read_csv(a.games)

    if a.command == "backtest":
        if games is None:
            sys.exit("backtest needs --games")
        df = backtest(teams, games, weights)
        if a.out:
            df.to_csv(a.out, index=False)
        return

    ratings, used, n_games = build_ratings(teams, games, weights)

    if a.command == "rate":
        print(f"Stats used ({sum(len(v) for v in used.values())}):")
        for cat, cols in used.items():
            print(f"  {cat:20s} {', '.join(cols)}")
        print(f"Games used for opponent adjustment: {n_games}\n")
        show = ["rank", "team"] + (["conference"] if "conference" in ratings else []) + \
               ["power_rating", "stat_rating"] + (["results_rating"] if "results_rating" in ratings else [])
        print(ratings[show].head(a.top).round(1).to_string(index=False))
        if a.out:
            ratings.round(3).to_csv(a.out, index=False)
    else:
        m = read_csv(a.matchups)
        if m is None:
            sys.exit("predict needs --matchups")
        preds = predict(ratings, m, teams, weights)
        print(preds.to_string(index=False))
        if a.out:
            preds.to_csv(a.out, index=False)


if __name__ == "__main__":
    main()
