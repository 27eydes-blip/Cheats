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
