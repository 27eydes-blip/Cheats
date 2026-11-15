# Combat Upgrade — shooting, weapons, leveling

Branch `upgrade/combat`, merged into `main`. Only `hunt/` changed. Screenshots are in `docs/combat/`.

## Part 1 — shooting feel and fairness
- **Lag compensation:** the server checks hits where targets were on *your* screen, up to 150 ms back.
- **Your own shots fly instantly** (predicted with the same spread the server uses); the server confirms the hit.
- **Hit markers:** a tick sound and a white X on a hit, gold on a critical hit, red with a deeper sound on a kill.
- **Aim assist:** a shot within 6° of a visible enemy bends half-way toward them. It never locks on, and it is off for snipers (Needle, Longshot, Wisp).
- **Aim line shows exactly what you hold:**
  - range tick at the end of every line
  - cone for shotguns and spread weapons
  - thin line for snipers
  - swing arc for melee
  - landing ring for grenades
  - charge ring for Longshot
- **Tap to auto-aim** picks the closest enemy you can actually see and hit.
- **New settings:**
  - aim sensitivity slider
  - left-handed layout (mirrors the controls)
  - hold to fire (instead of fire on release)
- **Feel:** recoil, muzzle flash, shell casings, a small camera nudge, and bullets you can watch travel, each weapon with its own trail.
- **Critical hits** show bigger gold damage numbers.
- **Reduce Flashing** turns off the muzzle flash, hit-marker flash and camera nudge; all sounds stay.
- **Performance:**
  - bullets, particles and damage numbers are pooled (no garbage per shot)
  - the server checks hits with a spatial grid
  - bullets go over the network once, as "fired" events, and each phone simulates them itself
  - each player is capped at 16 trigger pulls a second

## Part 2 — weapons
- **Loadout:** your brawler's signature attack plus ONE secondary from the new **Armory** (lobby rail). Swap with the ⇄ button (R / Tab on a keyboard); the swap takes 0.4 s.
- **15 original weapons:** Stormline, Ratchet, Breaker, Slugger, Longshot, Needle, Hornet, Viper, Thumper, Rocketeer, Cleaver, Spear, Arc Gun, Frost Cannon, Flare Gun.
- **Armory:** shows Damage, Fire Rate, Range, Reload and Spread bars for each weapon, and each class has its own look.
- **Balance:** 300 bot matches per weapon on 3 seeds (900 each); both sides used the same brawler, so only the weapon differed. Every weapon wins **45.9–53.5%** (target 45–55%). `npm test` now fails if any weapon drifts outside that range.
- **Free Play crates drop weapons:**
  - walk over a drop to take it for this life
  - rare and epic drops glow
  - when you respawn you get your armory weapon back

## Part 3 — leveling
- **Account level 1–100:**
  - XP comes from kills, assists, placement, bounty, bounty steals and daily missions (+40 XP each)
  - about 2 matches per level early on, level 40 after about 150 average matches
- **A reward at every level:**
  - coins every level, extra at every 10th
  - 12 weapon unlocks: 3 weapons at the start, all 15 by level 40
  - 6 emotes
  - 6 new hunter skins
  - 6 new titles
  - old saves get every reward they have already earned at their next match
- **Results screen** lists level-ups and mastery-ups.
- **Weapon mastery 1–10:**
  - earned from damage and kills with that weapon
  - weapon skins: Bronze at 3, Silver at 6, Gold at 9, and the animated **Hunter's Bane** at 10. They tint your bullet trails.
  - the matching badge shows next to your name
  - mastery 7 adds a kill effect for that weapon class
- **Perks:** at mastery 2, 5 and 8 you pick 1 of 2 *for that weapon* (you can re-pick any time). Each is about 10% or less. Tier 5 is each weapon's own pair, for example:
  - Stormline: Fast Reload (10% faster) **or** Extra Round (+1 round per burst)
  - Breaker: Extra Pellet **or** Fast Reload
  - Thumper: Short Fuse **or** Wide Blast
  - Flare Gun: Long Burn **or** Wide Light

  Tiers 2 and 8 come from the weapon's class (for example, rifles get Steady Grip / Quick Hands, then Hollow Point / Hair Trigger).

- **Emotes:** a **!?** button under the minimap; 8 original call-outs (HEY!, GG, I SEE YOU, RUN., ...), 2 free.
- **Server checks:** the server decides your loadout from your account. Locked weapons and perks you haven't earned are dropped.

## Brawler Power
- **Levels 1–11 for each brawler**, bought with coins you earn by playing: every match pays 12–72 coins, plus the level-up coins. Test currency only; nothing that affects combat can ever be bought with real money.
- **Cost:** 40 coins for level 2, up to 1,000 coins for level 11 (4,100 in total).
- **Effect:** each level adds 4% HP and 4% damage, so Power 11 is +40%.
- **Where:** tap POWER on the lobby nameplate.
- **Gadget at Power 7:** an active ability with 3 uses per match. Use the GADGET button next to Super, or F on a keyboard. Two to choose from per brawler:

| Brawler | Gadgets | Star Powers |
|---|---|---|
| Volt | Surge Step (dash) · Jolt Field (slow enemies near you) | Overclock (reload +10%) · Spark Boots (speed +6%) |
| Brick | Iron Skin (−30% damage for 2.5s) · Ground Pound (shove + 400 damage) | Bulwark (−8% damage taken) · Second Wind (heal 25% once under 25% HP) |
| Wisp | Vanish (invisible 1.5s) · Hunter's Mark (reveal enemies within 900) | Ghost Step (speed +6%) · Cold Focus (super charges 15% faster) |
| Dune | Sand Mend (heal 20%) · Quicksand (slow enemies near you) | Drifter (speed +6%) · Storm Heart (super charges 15% faster) |
| Rook | Spring Trap (drop a trap) · Chain Hook (pull the nearest enemy) | Iron Will (−8% damage taken) · Scavenger (heal 15% per takedown) |
| Flicker | Blink Step (dash) · Smoke Veil (invisible 1s + heal 10%) | Shadow Step (speed +6%) · Killer Instinct (reload +10%) |

- **Star Power at Power 9:** a passive bonus (the right-hand column above).
- **Fair matches:**
  - **Matchmaking:** Quick Hunt puts you with players of a similar power, in four groups: 1–3, 4–6, 7–8 and 9–11.
  - **Bots** play at the humans' average power, with gadgets and star powers when that's high enough.
- **Nameplates:** every player shows their power level and their secondary weapon, so you can see why you lost.

## Screens
- **Armory:**
  - weapon grid with a different look per class
  - stats panel and mastery bar
  - that weapon's own perk choices
  - **TEST RANGE** button
- **Test Range:** a private open map with 6 target dummies (one strafes) that never fight back. They're as tough as you and heal when you stop shooting. You carry the weapon you picked, and the server checks it's unlocked. No rewards, so it can't be farmed. Leave any time.
- **After a match:**
  - XP and the level bar, plus coins earned
  - a mastery bar for the weapon you used most
  - a card that flips in for each unlock (level, new weapon, emote, skin, title, mastery-up)
- **In a match:** the current weapon's icon, name and ammo sit next to the fire button, with the swap button just above it.

## Checks
| Check | Result |
|---|---|
| Tests | All Node tests pass. New tests cover lag compensation hits, the bullet cap, weapon swap, mastery and level saves, old saves loading, power, gadgets, star powers, matchmaking groups, the Test Range, and the weapon balance gate. **58/58** browser tests on Chromium. Firefox and WebKit still can't be installed here (the machine is missing their system libraries); run `npx playwright install firefox webkit && npm run e2e` on your computer. |
| Server bandwidth | **18.4 KB/s per player, was 27.4 KB/s (−33%)** in the 20-bot Big Hunt benchmark. These are raw JSON bytes. The game's sockets compress (permessage-deflate), so about **4 KB/s per player** actually crosses the network; `node test/bench.js` now prints both, and the tick's p50 / p95 / p99 / max next to the mean (0.41 ms mean, 1.2 ms p99 on this machine). |
| Server CPU | Snapshot work dropped slightly (0.161 ms vs 0.167 ms per tick). The whole tick is **0.274 ms vs 0.262 ms (+4.6%)**; all of that is bot AI managing a second weapon. Human players don't add it. |
| Frame rate, iPhone SE size | **60 fps** with 24 hunters on screen all firing (76 bullets in the air). With the CPU slowed 4×: normal Big Hunt about 47–50 fps (same as before the upgrade). The 24-hunter worst case is about 23 fps, and it is the same with nobody firing, so the limit is drawing 24 detailed hunters in this software-rendering test browser, not combat. |

## Bugs found and fixed along the way
- In-match emotes were rejected by the server's input check. They work now, with a test.
- **Free Play reconnect:** after a dropped connection, the client got only partial player data; it now gets everything again.
- Effects drawing code had been placed in the update step (a frame error that hid behind the game's error guard). Browser tests now fail on any swallowed frame error.

## Needs Sam's decision
1. **Power numbers:** the coin costs (4,100 to reach 11) and the four matchmaking groups are first guesses. When few people are online, a small group means longer waits, or more bots to fill matches.
2. **Bot CPU:** bots cost about 5% more server time because they juggle two weapons.
3. **Weapon drops in Free Play** last until you die. Should a found weapon unlock permanently instead?
4. **Mastery and coins** only count in Quick Hunt matches; Free Play has no match end to record. Should Free Play count too?
5. **Level pace:** level 40 takes about 150 average matches.
6. **Crowded screens on old phones:** with 24 hunters on screen, a slowed CPU drops to about 23 fps. That's the hunter drawing, not combat. Caching each hunter as a picture would fix it, but it's a bigger art-system change.
