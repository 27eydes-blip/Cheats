# PROGRESS — Drowned Earth

Overnight build log. Newest stage at the bottom of "Stages"; final report at the end.

## Stages
### A. World bible, Standing, raft cities, economy, heat, patrol — done
- `WORLD.md` holds the full bible (map rings, five raft cities, Highmark, the truth, Standing tiers, creatures, radio, endings, set pieces).
- Renamed Kettle Drift → **Portage** (Madam Oru Vance). Added two satellite rafts built by the same data-driven raft system: **Greentide Seedboat** (Elder Tamsin Koa) and **Rusthold Tender** (Bram Hollis). 14 named NPCs.
- **Standing** (`data/standing.json`, `society/Standing.js`): tiers 1–7, wristband HUD with dive tally, reputation per faction, Standing steps (Drifter tag from Sal, Trader permit from Vance) with costs and reputation tradeoffs, forged tags that can be exposed.
- Standing in the world: coloured dock lamps; the Exchange Dock refuses Deep-Born (dockmaster line); Odile overcharges Deep-Born (×1.45); the Keeper, Vance, Koa and Bram treat you the same regardless; NPCs keep a wider distance from Deep-Born; Ward stops search/seize by tier.
- **Economy** (`society/Economy.js`): four currencies (scrap, seals, salt, glass), per-raft price multipliers by item tag for Portage/Greentide/Rusthold, supply & demand from your trades, rumours (storms, harvests, crackdowns, ration cuts), a weekly ration level shown on a ration board on every raft.
- **Heat** (`society/Heat.js`) + **Tide Ward patrol state machine** (patrol → suspicious → search → chase → stop): searchlight cone with line of sight, boat noise (C cuts the engine), lamps, fog. Boarding inspection with comply / bribe / flee.
- **Boat upgrades** at Rusthold: baffled engine (quiet), rebored engine (fast/loud), hull plating, bow spotlight.
- Set pieces wired: lantern-boat festival at dusk on Portage, fog-bound patrol run on the first night, midnight storm that tears Low Row loose (tow it home), the Beacon's sweep answered by a tone from the Deep, Ward 9's flooded basement with glowing growth, a Bloomwalker and Teo's dive tag.
- Teo thread: recordings at Linden Court and in his dive bag at Rusthold, his tag in Ward 9, a request on the Night Songs radio station.
- Radio: 6 stations (Highmark Official, Raft Free Voice, Vigil Evensong, Lowlight 3.3, Night Songs, static) with broadcast hours and lines that change with flags and heat.
- Procedural music (`audio/Music.js`): sparse by default, regional colour, swells on discoveries and the festival, silence under danger.

### B. Life-sim layer — done
- `life/Life.js`: seeded life simulation (same seed → same life). 12 stats, 5 resources, reputation with 8 factions, Standing tier, careers with ranks/pay/promotions/hazards, relationships that age and die, world simulation (glow, rations, uprising, leaders who die and are replaced), death from health/old age/events, life summary, continue as your child with inherited traits.
- Content (`data/life_core.json`, `data/life_events.json`): 8 birth origins (Portage, Greentide, Rusthold, the Vigil, Lowlight, a Drifter boat, the Deep-Born crews, and a rare 4% Highmark lower-ring birth), **24 careers** (raft, outlaw, Highmark, Ward, deep), 9 activities, **156 event cards** across childhood, teens, adulthood and old age, plus repeatable career cards and rare cards. Four ending cards (shut down / expose / join the Concord / free the Cathedral).
- `life/LifeUI.js`: phone-first UI (390×780 tested): profile bar with wristband, stat bars, tabs (Life log, You, People, Work, Do, World), big AGE UP, worn-paper event cards, a timing-needle mini-game for skill choices (with Auto), death summary.
- `life/Scenarios.js`: **6 hybrid 3D moments** launched from cards — first dive (Linden basement), lantern festival, fog patrol stop, the storm breakaway, the Ward 9 quarantine dive, and free time on the water. The 3D world is snapshotted, staged, judged and restored; the result returns to the life log. "Skip — let fate decide" rolls against the relevant stat.
- Title screen now offers Continue / The Drowned District (story) / A Life on the Water / Options, over a slow cinematic dawn flight across the district, with a procedural stencil logo.
- Options: quality, difficulty (Calm/Standard/Harsh), text size, sound captions, subtitles, reduce motion, colour-safe indicators, high contrast, one-handed touch layout, lens effects, music level.
- Tests: `scripts/life-smoke.mjs` plays whole lives through the UI with random choices and fails on console errors (4 lives to old age, clean).
