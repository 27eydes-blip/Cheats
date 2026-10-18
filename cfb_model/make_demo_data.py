"""Generate FAKE demo data (Team 01..Team 40) to try the model. Not real stats."""
import numpy as np, pandas as pd, model
rng = np.random.default_rng(7)
N = 40
true = rng.normal(0, 13, N)
teams = pd.DataFrame({"team": [f"Team {i+1:02d}" for i in range(N)],
                      "conference": [f"Conf {chr(65 + i % 4)}" for i in range(N)]})
for cat, stats in model.CATEGORIES.items():
    for col, hib in stats:
        teams[col] = (true / 13 * (1 if hib else -1) + rng.normal(0, 0.8, N)) * 5 + 50
teams["off_ppg"] = 28 + true / 2 + rng.normal(0, 3, N)
teams["def_ppg"] = 28 - true / 2 + rng.normal(0, 3, N)
games = []
for wk in range(1, 8):
    order = rng.permutation(N)
    for h, a in zip(order[::2], order[1::2]):
        m = true[h] - true[a] + 2.5 + rng.normal(0, 15)
        tot = 56 + rng.normal(0, 10)
        games.append({"week": wk, "home": teams.team[h], "away": teams.team[a],
                      "home_points": max(0, round(tot / 2 + m / 2)), "away_points": max(0, round(tot / 2 - m / 2)), "neutral": False})
teams.round(2).to_csv("data/demo_teams.csv", index=False)
pd.DataFrame(games).to_csv("data/demo_games.csv", index=False)
pd.DataFrame({"home": ["Team 01", "Team 05"], "away": ["Team 02", "Team 30"],
              "neutral": [False, True], "vegas_home_spread": [-3.5, -10], "vegas_total": [55.5, 49]}).to_csv("data/demo_matchups.csv", index=False)
print("demo data written")
