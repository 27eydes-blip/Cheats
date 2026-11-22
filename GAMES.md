# Games and projects in this repo

Each game or project has its own top-level folder. Everything else at the
repo root (`apps/`, `crates/`, `packages/`, `evals/`, `docs/`, `scripts/`,
`README.md` and the Cargo/pnpm files) belongs to BrowserSkill, which is
separate from the games.

| Game / project | Folder | Live link | Deployed by |
|---|---|---|---|
| Tandem | [`tandem/`](tandem/) | https://27eydes-blip.github.io/Cheats/tandem/ | `gh-pages` branch. The folder is a copy of the built files there; no source exists |
| Glydrift | `glydrift/` (not added yet) | https://27eydes-blip.github.io/Cheats/glydrift/ · https://glydrift.com | Glydrift's own branches publish to `gh-pages` and Cloudflare |
| Glydaway | [`glydaway/`](glydaway/) | https://glydaway.com · https://glydaway.pages.dev | `.github/workflows/glydaway.yml` (Cloudflare Pages project `glydaway`) |
| Hunt / Oblivion GP | [`hunt/`](hunt/) | https://hunt.27eydes.workers.dev | Cloudflare Worker `hunt` (`hunt/wrangler.jsonc`) |
| Motor City 1915 | [`motorcity/`](motorcity/) | Cloudflare Pages project `motor-city-1915` (URL to confirm) | Its deploy workflow lives on the `claude/motor-city-1915-*` branches, not on `main` |
| gleyde-security | [`gleyde-security/`](gleyde-security/) | https://gleyde.com (to confirm) | Its deploy workflow lives on `claude/gleyde-cybersecurity-site-cv4rjj`, not on `main` |

Where each folder came from:

- `motorcity/`: `claude/motor-city-1915-bots-gatsby` (7e1141c), the newest
  `claude/motor-city-1915-*` branch.
- `gleyde-security/`: `claude/gleyde-cybersecurity-site-cv4rjj` (6036ad2).
- `tandem/`: `gh-pages:tandem/` (5ce740d), unchanged.

Gleyde Technologies, LLC · Created by Sam Eyde III
