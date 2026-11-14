# Combat Upgrade — shooting, weapons, leveling

Branch `upgrade/combat` (**not merged into main yet**). Only `hunt/` changed. Screenshots are in `docs/combat/`.

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
- **Perks:** at mastery 2, 5 and 8 you pick 1 of 2 (you can re-pick any time). They're small on purpose:

| Mastery | Option A | Option B |
|---|---|---|
| 2 | Quick Hands: swap 40% faster | Deep Pockets: +1 magazine |
| 5 | Fast Reload: 12% faster | Long Barrel: +8% range |
| 8 | Hollow Point: +6% damage | Steady Aim: 30% less spread |

- **Emotes:** a **!?** button under the minimap; 8 original call-outs (HEY!, GG, I SEE YOU, RUN., ...), 2 free.
- **Server checks:** the server decides your loadout from your account. Locked weapons and perks you haven't earned are dropped.

## Checks
| Check | Result |
|---|---|
| Tests | All Node tests pass (new: combat, leveling and mastery, weapon balance gate). **56/56** browser tests on Chromium (new `combat.spec.js`). Firefox and WebKit can't be installed here. |
| Server bandwidth | **18.4 KB/s per player, was 27.4 KB/s (−33%)** in the 20-bot Big Hunt benchmark. |
| Server CPU | Snapshot work dropped slightly (0.161 ms vs 0.167 ms per tick). The whole tick is **0.274 ms vs 0.262 ms (+4.6%)**; all of that is bot AI managing a second weapon. Human players don't add it. |
| Frame rate, iPhone SE size | **60 fps** with 24 hunters on screen all firing (76 bullets in the air). With the CPU slowed 4×: normal Big Hunt about 47–50 fps (same as before the upgrade). The 24-hunter worst case is about 23 fps, and it is the same with nobody firing, so the limit is drawing 24 detailed hunters in this software-rendering test browser, not combat. |

## Bugs found and fixed along the way
- **Free Play reconnect:** after a dropped connection, the client got only partial player data; it now gets everything again.
- Effects drawing code had been placed in the update step (a frame error that hid behind the game's error guard). Browser tests now fail on any swallowed frame error.

## Needs Sam's decision
1. **Your message was cut off** at "Mastery levels 2, 5 and 8 unlock a choice of ONE perk (pick 1 of 2). Example for". I designed the perks above. Tell me what followed and I'll match it.
2. **Bot CPU:** bots now cost about 5% more server time because they juggle two weapons. Options: accept it, or simplify bot weapon choice.
3. **Weapon drops in Free Play** last until you die. Should a found weapon unlock permanently instead?
4. **Mastery only counts in Quick Hunt matches** (Free Play has no match end to record). Should Free Play also count?
5. **Level curve:** level 40 takes about 150 average matches. Is that the pace you want?
6. **Drawing many hunters on old phones:** caching each hunter as a picture would speed up very crowded screens. It's a bigger change to the art system, so I left it.
