# College Football Model

Rates every team on **51 stats in 14 categories** and combines them into one power rating, measured in points. It also uses game results to adjust for strength of schedule. Then it predicts spreads, win probabilities, totals and projected scores, and flags picks against the Vegas line.

## Quick start

```bash
cd cfb_model
pip install pandas numpy
python make_demo_data.py          # FAKE demo teams, only for trying it out
python model.py rate     --teams data/demo_teams.csv --games data/demo_games.csv
python model.py predict  --teams data/demo_teams.csv --games data/demo_games.csv --matchups data/demo_matchups.csv
python model.py backtest --teams data/demo_teams.csv --games data/demo_games.csv
```

Add `--out results.csv` to any command to save the output.

## Using real data

Fill in the templates in `data/`:

| File | What goes in it |
|---|---|
| `teams_template.csv` | One row per team. Only `team` is required. Fill in whichever stat columns you have; empty columns are skipped and their weight is spread across the rest. |
| `games_template.csv` | Completed games: `week, home, away, home_points, away_points, neutral`. Used for the schedule adjustment and the backtest. |
| `matchups_template.csv` | Upcoming games. `vegas_home_spread` and `vegas_total` are optional. When filled in, you get ATS and over/under picks. |

Good free sources: collegefootballdata.com (success rate, havoc, explosiveness, points per drive, talent, returning production), cfbstats.com, and ESPN/NCAA team stats.

## What it rates

| Category | Stats |
|---|---|
| Offense efficiency | PPG, yards/play, success rate, points/drive, 3rd-down % |
| Defense efficiency | same, allowed |
| Rushing | YPC for/against, line yards, stuff rate |
| Passing | YPA for/against, QB rating for/against, sack rate allowed |
| Explosiveness | explosive-play rate for/against |
| Finishing drives | red-zone TD %, points per scoring opportunity (both sides) |
| Havoc / pressure | havoc rate, sacks, TFLs, havoc allowed |
| Ball security | turnover margin, giveaways, takeaways |
| Special teams | FG %, net punt, kick/punt return, return coverage |
| Field position | average starting yardline for/against |
| Discipline | penalties and penalty yards per game |
| Talent / experience | recruiting score, returning production, transfer portal score |
| Schedule / results | win %, strength of schedule, point margin |
| Situational | time of possession, 4th-down % for/against, close-game win % |

## How it works

1. **Stat rating:** each stat is z-scored, so it's measured against the league average and capped at ±3 SD so one outlier can't dominate. Stats are averaged within each category, and the categories are combined using the weights in `weights.json`. The result is scaled to points.
2. **Results rating:** a ridge regression on game margins, with home field removed and blowouts capped at 28 points. This gives an opponent-adjusted rating where beating good teams counts more.
3. **Power rating:** a blend of the two. Results get more trust as the season goes on, up to `results_blend` once teams have played about 8 games.
4. **Predictions:** spread = rating difference + home field (2.5 pts, none at neutral sites). Win probability uses a normal curve with a 15.5-pt SD. The total comes from each offense's PPG against the other defense's PPG allowed.

## Tuning

Edit `weights.json` to change category weights, home-field advantage, or how much game results count. Re-run `backtest` after each change to see whether accuracy improves (higher straight-up %, lower Brier score).

**Backtest caveat:** the backtest predicts each week using only earlier games. But the team stats you load are whatever is in `teams.csv`. If those are end-of-season stats, the backtest gets a peek at the future and will look better than reality.
