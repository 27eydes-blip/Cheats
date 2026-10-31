# College Football Model (v2)

Rates every team two ways and blends them:

- **Stat rating:** 51 stats in 14 categories. This part is optional.
- **Results rating:** separate offense and defense ratings fit to real scores. Recent games count more, blowouts are softened, home field is learned from the data, FCS opponents are pooled, and an optional preseason rating steadies the early weeks.

It then projects spreads, totals and win chances. Given sportsbook lines, it lists every bet with its chance to hit, its expected profit and a Kelly stake size.

## Real data in one command

```bash
cd cfb_model
pip install pandas numpy
python fetch_espn.py --season 2026 --week 10        # needs access to site.api.espn.com
python model.py bets --teams data/2026/teams.csv --games data/2026/games.csv --matchups data/2026/matchups.csv
```

`fetch_espn.py` downloads every completed FBS game and the upcoming week's spreads, totals and moneylines from ESPN's free scoreboard feed. No API key is needed.

## The bets board

`python model.py bets ...` prints two lists:

1. **Most likely to hit:** bets where the model also beats the price, sorted by chance to hit.
2. **Best value:** sorted by expected profit per unit staked.

How the chances are calculated:

- **Blended with the market:** each chance mixes the model's view with the market's, with the bookmaker's cut removed (`market_blend`, default 50/50). Sportsbook lines are sharp, and a model on its own is overconfident.
- **Short favorites skipped:** prices shorter than `max_favorite` (default -400) are left out. Big-favorite moneylines hit often but pay almost nothing.
- **Kelly column:** the full-Kelly stake as a share of bankroll. Most bettors use a quarter of it or less.

## Try it with fake demo data

```bash
cd cfb_model
pip install pandas numpy
python make_demo_data.py          # FAKE demo teams, only for trying it out
python model.py rate     --teams data/demo_teams.csv --games data/demo_games.csv
python model.py predict  --teams data/demo_teams.csv --games data/demo_games.csv --matchups data/demo_matchups.csv
python model.py backtest --teams data/demo_teams.csv --games data/demo_games.csv
python model.py bets     --teams data/demo_teams.csv --games data/demo_games.csv --matchups data/demo_matchups.csv
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

## v2 settings in weights.json

| Setting | What it does |
|---|---|
| `results_blend` | Max share of the rating from game results (vs stats). |
| `recency` | Each older week counts this much as the next (0.93). |
| `mov_cap` | Margins past this are softened, not just cut off. |
| `prior_games` | How many games a preseason `prior_rating` is worth. |
| `margin_sd` / `total_sd` | Error sizes behind win, cover and over/under chances. `backtest` prints the values your data suggests. |
| `market_blend` | Share of the final chance that comes from the model rather than the market. |
| `max_favorite` | Bets priced shorter than this are skipped. |

The backtest also grades picks against the closing line when `games.csv` has `vegas_home_spread`. It prints a calibration table showing whether 70% picks really win about 70% of the time.

**Reality check:** no model guarantees wins. Beating -110 spreads needs about 52.4% correct over a large sample. Bet only what you can afford to lose.
