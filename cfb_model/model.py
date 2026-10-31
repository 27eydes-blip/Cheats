#!/usr/bin/env python3
"""College football power-rating and betting model (v2).

Rates every team two ways and blends them:
  * stat rating:    51 stats in 14 categories, z-scored and weighted (optional)
  * results rating: opponent-adjusted offense and defense ratings fit to game
                    scores, with recent games weighted more, blowouts softened,
                    home field learned from the data and an optional preseason prior

Then it predicts spreads, totals and win probabilities, and turns sportsbook
lines into a ranked list of bets with the chance each one hits and its
expected value.

Usage:
    python model.py rate     --teams data/teams.csv --games data/games.csv
    python model.py predict  --teams data/teams.csv --games data/games.csv --matchups data/matchups.csv
    python model.py bets     --teams data/teams.csv --games data/games.csv --matchups data/matchups.csv [--top 10]
    python model.py backtest --teams data/teams.csv --games data/games.csv

teams.csv needs only a `team` column. Stat columns are optional: with none,
the model runs on game results alone. An optional `prior_rating` column
(points vs an average FBS team, e.g. last season's final rating) steadies
early-season ratings.

matchups.csv takes `home, away, neutral` plus any of the market columns
`vegas_home_spread, vegas_total, home_ml, away_ml, spread_odds, total_odds`.
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

# Defaults; weights.json can override any of these.
DEFAULTS = {
    "home_field_advantage": 2.5,  # prior for home field; the fit adjusts it
    "hfa_prior_games": 150,       # how strongly the home-field fit sticks to the prior
    "points_per_sd": 13.0,        # stat composite: 1 SD of team quality in points
    "results_blend": 0.75,        # max share of the rating that comes from results
    "margin_sd": 15.5,            # spread error, for win and cover probabilities
    "total_sd": 16.0,             # total error, for over/under probabilities
    "mov_cap": 28,                # blowouts are softened past this margin
    "recency": 0.93,              # each older week counts this much as the next
    "ridge": 2.0,                 # shrinks low-sample teams toward their prior
    "prior_games": 3.0,           # a preseason prior is worth this many games early on
    "fcs_rating": -24.0,          # teams not in teams.csv are pooled at this level
    "min_ev": 0.0,                # a bet needs at least this expected value to count as a value bet
    "market_blend": 0.5,          # final chance = this share model + the rest market; books are sharp
    "max_favorite": -400,         # bets list skips prices shorter than this (e.g. -1000 moneylines)
}

FCS = "__FCS__"


def load_weights(path):
    with open(path) as f:
        w = json.load(f)
    unknown = set(w.get("category_weights", {})) - set(CATEGORIES)
    if unknown:
        sys.exit(f"Unknown categories in weights file: {sorted(unknown)}")
    return {**DEFAULTS, **w}


# ----------------------------------------------------------------- stat side

def zscore(series):
    s = pd.to_numeric(series, errors="coerce")
    sd = s.std(ddof=0)
    if not sd or np.isnan(sd):
        return pd.Series(0.0, index=s.index)
    # Missing values become league average (0) rather than dropping the team.
    return ((s - s.mean()) / sd).fillna(0.0).clip(-3, 3)


def stat_ratings(teams, weights):
    """Z-score every available stat, average into categories, weight into one score.
    Returns (None, None, {}) when the teams file has no usable stat columns."""
    cat_scores, used = {}, {}
    for cat, stats in CATEGORIES.items():
        cols = [(c, hib) for c, hib in stats if c in teams.columns and teams[c].notna().any()]
        if not cols:
            continue
        zs = [zscore(teams[c]) * (1 if hib else -1) for c, hib in cols]
        cat_scores[cat] = sum(zs) / len(zs)
        used[cat] = [c for c, _ in cols]
    cw = {c: weights.get("category_weights", {}).get(c, 0.0) for c in cat_scores}
    total = sum(cw.values())
    if not cat_scores or total <= 0:
        return None, None, {}
    cats = pd.DataFrame(cat_scores, index=teams.index)
    composite = sum(cats[c] * (cw[c] / total) for c in cats.columns)
    return cats, composite, used


# -------------------------------------------------------------- results side

def soft_cap(margin, cap):
    """Shrink blowouts smoothly: about linear for close games, flattens past `cap`."""
    return cap * math.tanh(margin / cap)


def fit_results(games, team_list, weights, priors=None):
    """Opponent-adjusted offense/defense ratings from scores.

    Each game gives two equations (one per side):
        points_scored = mu + off[team] - def[opp] + hfa/2 * home_sign
    fit by weighted ridge regression. Recent games count more, and ratings
    shrink toward each team's prior (or 0) rather than a hard league average.
    Teams missing from team_list (usually FCS) share one pooled rating.
    """
    hfa0 = weights["home_field_advantage"]
    g = games.dropna(subset=["home_points", "away_points"]).reset_index(drop=True)
    if g.empty:
        return None
    known = set(team_list)
    for side in ("home", "away"):
        g[side] = g[side].astype(str).str.strip().where(g[side].astype(str).str.strip().isin(known), FCS)
    teams = list(team_list) + ([FCS] if (g["home"] == FCS).any() or (g["away"] == FCS).any() else [])
    idx = {t: i for i, t in enumerate(teams)}
    n = len(teams)
    neutral = g["neutral"].fillna(False).astype(bool) if "neutral" in g else pd.Series(False, index=g.index)
    if "week" in g:
        wk = pd.to_numeric(g["week"], errors="coerce").fillna(0)
        w = weights["recency"] ** (wk.max() - wk)
    else:
        w = pd.Series(1.0, index=g.index)

    # Unknowns: off[0..n-1], def[0..n-1], mu, hfa
    cols = 2 * n + 2
    rows, ys, ws = [], [], []
    cap = weights["mov_cap"]
    for k, (_, r) in enumerate(g.iterrows()):
        h, a = idx[r["home"]], idx[r["away"]]
        hp, ap = float(r["home_points"]), float(r["away_points"])
        # Soften blowouts by shrinking each side toward the game's midpoint.
        mid, half = (hp + ap) / 2, soft_cap(hp - ap, cap) / 2
        hs = 0.0 if neutral.loc[r.name] else 0.5
        for (o, d, pts, s) in ((h, a, mid + half, hs), (a, h, mid - half, -hs)):
            x = np.zeros(cols)
            x[o] = 1
            x[n + d] = -1
            x[2 * n] = 1
            x[2 * n + 1] = s
            rows.append(x)
            ys.append(pts)
            ws.append(float(w.loc[r.name]))
    X, y, W = np.array(rows), np.array(ys), np.array(ws)

    # Ridge targets: priors split evenly into offense and defense; mu/hfa get weak/strong priors.
    target = np.zeros(cols)
    lam = np.full(cols, weights["ridge"])
    if priors is not None:
        pg = weights["prior_games"]
        for t, i in idx.items():
            p = priors.get(t)
            if p is not None and not pd.isna(p):
                target[i] = target[n + i] = float(p) / 2
                lam[i] = lam[n + i] = weights["ridge"] + pg
    if FCS in idx:
        i = idx[FCS]
        target[i] = target[n + i] = weights["fcs_rating"] / 2
        lam[i] = lam[n + i] = 25.0
    lam[2 * n] = 1e-6
    target[2 * n + 1] = hfa0
    lam[2 * n + 1] = weights["hfa_prior_games"]

    A = X.T @ (X * W[:, None]) + np.diag(lam)
    b = X.T @ (W * y) + lam * target
    beta = np.linalg.solve(A, b)
    off = pd.Series(beta[:n], index=teams)
    dfn = pd.Series(beta[n:2 * n], index=teams)
    return {"off": off, "def": dfn, "mu": float(beta[2 * n]), "hfa": float(beta[2 * n + 1]),
            "games": len(g), "teams": teams}


def build_ratings(teams, games, weights):
    teams = teams.copy()
    teams["team"] = teams["team"].astype(str).str.strip()
    teams = teams.drop_duplicates("team").set_index("team", drop=False)

    out = pd.DataFrame(index=teams.index)
    out["team"] = teams["team"]
    if "conference" in teams.columns:
        out["conference"] = teams["conference"]

    cats, composite, used = stat_ratings(teams, weights)
    if composite is not None:
        out["stat_rating"] = composite / (composite.std(ddof=0) or 1) * weights["points_per_sd"]

    priors = None
    if "prior_rating" in teams.columns:
        priors = pd.to_numeric(teams["prior_rating"], errors="coerce").to_dict()
    elif "stat_rating" in out:
        priors = out["stat_rating"].to_dict()

    fit = fit_results(games, list(teams.index), weights, priors) if games is not None and len(games) else None
    meta = {"used": used, "n_games": 0, "hfa": weights["home_field_advantage"], "mu": None}
    if fit:
        out["off_rating"] = fit["off"].reindex(out.index)
        out["def_rating"] = fit["def"].reindex(out.index)
        out["results_rating"] = out["off_rating"] + out["def_rating"]
        meta.update(n_games=fit["games"], hfa=fit["hfa"], mu=fit["mu"])
        if "stat_rating" in out:
            gp = fit["games"] * 2 / max(len(teams), 1)
            w_res = weights["results_blend"] * min(1.0, gp / 8)
            out["power_rating"] = (1 - w_res) * out["stat_rating"] + w_res * out["results_rating"]
        else:
            out["power_rating"] = out["results_rating"]
    elif "stat_rating" in out:
        out["power_rating"] = out["stat_rating"]
    elif priors is not None:
        out["power_rating"] = pd.Series(priors).reindex(out.index).fillna(0.0)
    else:
        sys.exit("Need stat columns, a prior_rating column, or game results to rate teams.")

    if cats is not None:
        for c in cats.columns:
            out[f"cat_{c}"] = cats[c]
    out = out.sort_values("power_rating", ascending=False)
    out.insert(0, "rank", range(1, len(out) + 1))
    return out, meta


# ------------------------------------------------------------- probabilities

def norm_cdf(x, sd):
    return 0.5 * (1 + math.erf(x / (sd * math.sqrt(2))))


def american_to_prob(odds):
    odds = float(odds)
    return 100 / (odds + 100) if odds > 0 else -odds / (-odds + 100)


def american_payout(odds):
    """Profit per 1 unit staked."""
    odds = float(odds)
    return odds / 100 if odds > 0 else 100 / -odds


def no_vig(p1, p2):
    s = p1 + p2
    return (p1 / s, p2 / s) if s > 0 else (p1, p2)


def project(ratings, meta, home, away, neutral, weights):
    """Projected home margin, total and scores."""
    hfa = 0.0 if neutral else meta["hfa"]
    spread = ratings.at[home, "power_rating"] - ratings.at[away, "power_rating"] + hfa
    total = None
    if meta.get("mu") is not None and "off_rating" in ratings and not pd.isna(ratings.at[home, "off_rating"]):
        hp = meta["mu"] + ratings.at[home, "off_rating"] - ratings.at[away, "def_rating"] + hfa / 2
        ap = meta["mu"] + ratings.at[away, "off_rating"] - ratings.at[home, "def_rating"] - hfa / 2
        total = hp + ap
    return spread, total


def _num(m, k):
    v = m.get(k)
    return None if v is None or pd.isna(v) or v == "" else float(v)


def predict(ratings, matchups, weights, meta):
    rows = []
    msd, tsd = weights["margin_sd"], weights["total_sd"]
    for _, m in matchups.iterrows():
        h, a = str(m["home"]).strip(), str(m["away"]).strip()
        if h not in ratings.index or a not in ratings.index:
            print(f"warning: skipping {a} @ {h} (team not in teams file)", file=sys.stderr)
            continue
        neutral = bool(m.get("neutral", False)) if not pd.isna(m.get("neutral", False)) else False
        spread, total = project(ratings, meta, h, a, neutral, weights)
        row = {"away": a, "home": h, "neutral": neutral, "pick": h if spread >= 0 else a,
               "home_spread": round(-spread, 1), "home_win_prob": round(norm_cdf(spread, msd), 3)}
        if total is not None:
            row["proj_total"] = round(total, 1)
            row["proj_score"] = f"{a} {round(total / 2 - spread / 2)} - {h} {round(total / 2 + spread / 2)}"
        line = _num(m, "vegas_home_spread")
        if line is not None:
            row["vegas_home_spread"] = line
            row["edge_pts"] = round(line + spread, 1)   # >0: model likes home vs the line
            row["ats_pick"] = h if row["edge_pts"] > 0 else a
            row["ats_cover_prob"] = round(max(norm_cdf(spread + line, msd), 1 - norm_cdf(spread + line, msd)), 3)
        vt = _num(m, "vegas_total")
        if vt is not None and total is not None:
            row["vegas_total"] = vt
            p_over = 1 - norm_cdf(vt - total, tsd)
            row["ou_pick"] = "OVER" if p_over > .5 else "UNDER"
            row["ou_prob"] = round(max(p_over, 1 - p_over), 3)
        rows.append(row)
    return pd.DataFrame(rows)


def bet_board(ratings, matchups, weights, meta):
    """Every available bet with the model's chance to hit and its expected value.

    Spread and total bets assume -110 unless spread_odds/total_odds are given.
    Moneylines need home_ml/away_ml; the market's own probability is shown with
    the bookmaker's cut removed so the two can be compared fairly.
    """
    msd, tsd, wm = weights["margin_sd"], weights["total_sd"], weights["market_blend"]
    bets = []
    for _, m in matchups.iterrows():
        h, a = str(m["home"]).strip(), str(m["away"]).strip()
        if h not in ratings.index or a not in ratings.index:
            continue
        neutral = bool(m.get("neutral", False)) if not pd.isna(m.get("neutral", False)) else False
        spread, total = project(ratings, meta, h, a, neutral, weights)
        game = f"{a} @ {h}" if not neutral else f"{a} vs {h} (neutral)"

        def add(kind, pick, raw, odds, market_prob, note):
            prob = wm * raw + (1 - wm) * market_prob
            pay = american_payout(odds)
            ev = prob * pay - (1 - prob)
            bets.append({"game": game, "bet": kind, "pick": pick, "odds": int(odds), "model_prob": prob, "raw_model": raw,
                         "market_prob": market_prob, "edge": prob - market_prob, "ev_per_unit": ev,
                         "kelly": max(0.0, (prob * (pay + 1) - 1) / pay), "note": note})

        line = _num(m, "vegas_home_spread")
        if line is not None:
            so = _num(m, "spread_odds") or -110
            p_home = 1 - norm_cdf(-line - spread, msd)       # home margin > -line
            mp = .5
            add("spread", f"{h} {line:+g}", p_home, so, mp, f"model {h} {-spread:+.1f}")
            add("spread", f"{a} {-line:+g}", 1 - p_home, so, mp, f"model {h} {-spread:+.1f}")
        vt = _num(m, "vegas_total")
        if vt is not None and total is not None:
            to = _num(m, "total_odds") or -110
            p_over = 1 - norm_cdf(vt - total, tsd)
            add("total", f"OVER {vt:g}", p_over, to, .5, f"model total {total:.1f}")
            add("total", f"UNDER {vt:g}", 1 - p_over, to, .5, f"model total {total:.1f}")
        hml, aml = _num(m, "home_ml"), _num(m, "away_ml")
        if hml is not None and aml is not None:
            ph = norm_cdf(spread, msd)
            mh, ma = no_vig(american_to_prob(hml), american_to_prob(aml))
            add("moneyline", h, ph, hml, mh, f"model {h} {-spread:+.1f}")
            add("moneyline", a, 1 - ph, aml, ma, f"model {h} {-spread:+.1f}")
    if not bets:
        return pd.DataFrame()
    df = pd.DataFrame(bets)
    df["value"] = df["ev_per_unit"] > weights["min_ev"]
    return df[df["odds"] >= weights["max_favorite"]] if weights["max_favorite"] else df


# ----------------------------------------------------------------- backtest

def backtest(teams, games, weights):
    """Walk forward week by week: rate using only earlier games, predict the next week.
    If games.csv has vegas_home_spread / vegas_total, also grades picks against the line."""
    if "week" not in games.columns:
        sys.exit("backtest needs a 'week' column in games.csv")
    g = games.dropna(subset=["home_points", "away_points"]).reset_index(drop=True)
    weeks = sorted(g["week"].unique())
    res = []
    for wk in weeks[1:]:
        past, cur = g[g["week"] < wk], g[g["week"] == wk]
        r, meta = build_ratings(teams, past, weights)
        for _, row in cur.iterrows():
            h, a = str(row["home"]).strip(), str(row["away"]).strip()
            if h not in r.index or a not in r.index:
                continue
            neutral = bool(row.get("neutral", False)) if not pd.isna(row.get("neutral", False)) else False
            sp, tot = project(r, meta, h, a, neutral, weights)
            actual = row["home_points"] - row["away_points"]
            out = {"week": wk, "pred": sp, "actual": actual, "correct": (sp >= 0) == (actual > 0),
                   "brier": (norm_cdf(sp, weights["margin_sd"]) - (actual > 0)) ** 2,
                   "pred_total": tot, "actual_total": row["home_points"] + row["away_points"]}
            line = row.get("vegas_home_spread")
            if line is not None and not pd.isna(line) and actual + line != 0:
                p = 1 - norm_cdf(-line - sp, weights["margin_sd"])
                out.update(ats_prob=max(p, 1 - p), ats_win=(p > .5) == (actual + line > 0))
            res.append(out)
    if not res:
        sys.exit("not enough games to backtest")
    df = pd.DataFrame(res)
    err = df["pred"] - df["actual"]
    print(f"Games tested:        {len(df)}")
    print(f"Straight-up correct: {df['correct'].mean():.1%}")
    print(f"Mean abs error:      {err.abs().mean():.1f} pts   (actual margin SD around picks: {err.std():.1f})")
    print(f"Brier score:         {df['brier'].mean():.3f}  (0.25 = coin flip, lower is better)")
    print(f"  -> margin_sd in weights.json is {weights['margin_sd']}; the data suggests about {err.std():.1f}")
    if df["pred_total"].notna().any():
        terr = (df["pred_total"] - df["actual_total"]).dropna()
        print(f"Totals error:        {terr.abs().mean():.1f} pts mean abs, SD {terr.std():.1f}, bias {terr.mean():+.1f}")
        print(f"  -> total_sd in weights.json is {weights['total_sd']}; the data suggests about {terr.std():.1f}")
    print("\nCalibration (model favorite's win chance vs how often it won):")
    fav_p = df["pred"].apply(lambda s: max(norm_cdf(s, weights["margin_sd"]), 1 - norm_cdf(s, weights["margin_sd"])))
    for lo, hi in ((.5, .6), (.6, .7), (.7, .8), (.8, .9), (.9, 1.01)):
        sel = (fav_p >= lo) & (fav_p < hi)
        if sel.any():
            print(f"  {lo:.0%}-{min(hi, 1):.0%}: predicted {fav_p[sel].mean():.1%}, won {df.loc[sel, 'correct'].mean():.1%}  ({sel.sum()} games)")
    if "ats_win" in df:
        a = df.dropna(subset=["ats_win"])
        print(f"\nAgainst the spread:  {a['ats_win'].mean():.1%} of {len(a)} games (52.4% breaks even at -110)")
        for cut in (.55, .6, .65):
            s = a[a["ats_prob"] >= cut]
            if len(s):
                print(f"  model cover chance >= {cut:.0%}: {s['ats_win'].mean():.1%} of {len(s)}")
    return df


# --------------------------------------------------------------------- CLI

def read_csv(path):
    if not path:
        return None
    if not os.path.exists(path):
        sys.exit(f"File not found: {path}")
    return pd.read_csv(path)


def fmt_bets(df, top):
    show = df.drop(columns=["raw_model"], errors="ignore").rename(columns={"model_prob": "hit_prob"})
    for c in ("hit_prob", "market_prob", "edge"):
        show[c] = (show[c] * 100).round(1).astype(str) + "%"
    show["ev_per_unit"] = show["ev_per_unit"].map(lambda v: f"{v:+.3f}")
    show["kelly"] = (show["kelly"] * 100).round(1).astype(str) + "%"
    return show.head(top).to_string(index=False)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("command", choices=["rate", "predict", "bets", "backtest"])
    p.add_argument("--teams", required=True)
    p.add_argument("--games")
    p.add_argument("--matchups")
    p.add_argument("--weights", default=os.path.join(HERE, "weights.json"))
    p.add_argument("--out", help="write results to this CSV")
    p.add_argument("--top", type=int, default=25)
    p.add_argument("--min-prob", type=float, default=0.0, help="bets: only show bets at least this likely to hit (0-1)")
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

    ratings, meta = build_ratings(teams, games, weights)

    if a.command == "rate":
        if meta["used"]:
            print(f"Stats used ({sum(len(v) for v in meta['used'].values())}):")
            for cat, cols in meta["used"].items():
                print(f"  {cat:20s} {', '.join(cols)}")
        print(f"Games used: {meta['n_games']}   Home field: {meta['hfa']:.1f} pts\n")
        show = ["rank", "team"] + [c for c in ("conference", "power_rating", "off_rating", "def_rating", "stat_rating") if c in ratings]
        print(ratings[show].head(a.top).round(1).to_string(index=False))
        if a.out:
            ratings.round(3).to_csv(a.out, index=False)
        return

    m = read_csv(a.matchups)
    if m is None:
        sys.exit(f"{a.command} needs --matchups")
    if a.command == "predict":
        preds = predict(ratings, m, weights, meta)
        print(preds.to_string(index=False))
        if a.out:
            preds.to_csv(a.out, index=False)
        return

    board = bet_board(ratings, m, weights, meta)
    if board.empty:
        sys.exit("No bets: matchups.csv needs vegas_home_spread, vegas_total or home_ml/away_ml columns.")
    board = board[board["model_prob"] >= a.min_prob]
    value = board[board["value"]].sort_values(["model_prob", "ev_per_unit"], ascending=False)
    print(f"Home field used: {meta['hfa']:.1f} pts   Games rated: {meta['n_games']}\n")
    print("MOST LIKELY TO HIT (only bets where the model also beats the price):")
    print(fmt_bets(value, a.top) if len(value) else "  none")
    print("\nBEST VALUE (highest expected profit per unit):")
    print(fmt_bets(board.sort_values("ev_per_unit", ascending=False), a.top))
    if a.out:
        board.sort_values("model_prob", ascending=False).to_csv(a.out, index=False)


if __name__ == "__main__":
    main()
