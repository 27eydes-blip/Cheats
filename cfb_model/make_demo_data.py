"""Generate FAKE demo data (Team 01..Team 60) to try the model. Not real teams, stats or lines."""
import numpy as np, pandas as pd, model
rng = np.random.default_rng(7)
N, WEEKS = 60, 10
true = rng.normal(0, 13, N)
off = rng.normal(0, 6, N) + true / 2
dfn = true - off
teams = pd.DataFrame({"team": [f"Team {i+1:02d}" for i in range(N)],
                      "conference": [f"Conf {chr(65 + i % 5)}" for i in range(N)],
                      "prior_rating": (true + rng.normal(0, 7, N)).round(1)})  # last year's rating: useful but noisy
for cat, stats in model.CATEGORIES.items():
    for col, hib in stats:
        teams[col] = (true / 13 * (1 if hib else -1) + rng.normal(0, 1.0, N)) * 5 + 50
teams["off_ppg"] = 28 + off + rng.normal(0, 3, N)
teams["def_ppg"] = 28 - dfn + rng.normal(0, 3, N)

def market_line(h, a):
    # A sharp-ish market: true spread plus a little noise.
    return -round((true[h] - true[a] + 2.5 + rng.normal(0, 2.5)) * 2) / 2

def score(h, a):
    hp = 27 + off[h] - dfn[a] + 1.25 + rng.normal(0, 10)
    ap = 27 + off[a] - dfn[h] - 1.25 + rng.normal(0, 10)
    return max(0, round(hp)), max(0, round(ap))

games, matchups = [], []
for wk in range(1, WEEKS + 2):
    order = rng.permutation(N)
    for h, a in zip(order[::2], order[1::2]):
        line = market_line(h, a)
        tot = round((54 + off[h] + off[a] - dfn[h] - dfn[a] + rng.normal(0, 2.5)) * 2) / 2
        if wk <= WEEKS:
            hp, ap = score(h, a)
            games.append({"week": wk, "home": teams.team[h], "away": teams.team[a], "home_points": hp, "away_points": ap,
                          "neutral": False, "vegas_home_spread": line, "vegas_total": tot})
        else:
            p = model.norm_cdf(-line, 15)
            fair = lambda q: -round(q / (1 - q) * 100) if q >= .5 else round((1 - q) / q * 100)
            vig = lambda q: min(.97, q + .022)
            matchups.append({"home": teams.team[h], "away": teams.team[a], "neutral": False, "vegas_home_spread": line,
                             "vegas_total": tot, "home_ml": fair(vig(p)), "away_ml": fair(vig(1 - p))})
teams.round(2).to_csv("data/demo_teams.csv", index=False)
pd.DataFrame(games).to_csv("data/demo_games.csv", index=False)
pd.DataFrame(matchups).to_csv("data/demo_matchups.csv", index=False)
print("demo data written")
