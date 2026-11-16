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
- **Cost:** 40 coins for level 2, up to 1,000 coins for level 11 (3,740 in total).
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
1. **Power numbers:** the coin costs (3,740 to reach 11) and the four matchmaking groups are first guesses. When few people are online, a small group means longer waits, or more bots to fill matches.
2. **Bot CPU:** bots cost about 5% more server time because they juggle two weapons.
3. **Weapon drops in Free Play** last until you die. Should a found weapon unlock permanently instead?
4. **Mastery and coins** only count in Quick Hunt matches; Free Play has no match end to record. Should Free Play count too?
5. **Level pace:** level 40 takes about 150 average matches.
6. **Crowded screens on old phones:** with 24 hunters on screen, a slowed CPU drops to about 23 fps. That's the hunter drawing, not combat. Caching each hunter as a picture would fix it, but it's a bigger art-system change.

## Oblivion GP weapons (racing)

Server-authoritative (`src/race/sim.js`), data in `public/race/items.js`, wire format in
`public/race/PROTOCOL.md`, client art in `public/race/weapons-fx.js`.

**Two slots.** FIRE = the driver's built-in weapon (recharges on its cooldown). ITEM = one pickup from
the item boxes. The HUD shows both (top centre, and on the ITEM / FIRE buttons), with the item's
level as pips (2 cyan pips = level II, 3 gold pips = level III).

**Level-up.** Drive through a box while holding an item: the box rolls as usual, with the held
item 5x as likely; the same item again levels it up (max III), anything else leaves your item as
it is. Every item has three levels; each level adds something clear (see `up` in items.js).

**Odds by position.** The leader rolls weaker, defensive items (no missiles, EMPs or drones); the
back of the pack rolls the catch-up items (missiles, turbos, drones, EMPs).

**Protection.** For 2 s after another racer's hit lands on you (damage or a spin-out), no racer's
item or weapon can damage or spin you (thin dashed halo on your car). Slows, EMP and gravity still
work. Track damage still works.

**Big hits** (Homing Missile II+, Sticky Bomb, the combo trap, the Gravity Well III crush) spin the
car out on the server and blow up on screen. Any hit you deal or take freezes the picture for
0.08 s (hit-stop, client only). A takedown shows a short callout: `NAME TOOK OUT NAME`.
Reduce Flashing removes flashes and strobes (arming traps breathe slowly instead of blinking, the
lock-on frame is steady); all sounds stay.

### Every item and its counter

| Item | What it does | Level II / III | Counter |
| --- | --- | --- | --- |
| Homing Missile | Locks on to the racer one place ahead (they get a LOCK-ON warning) | harder hit + spin-out / twin missiles, smaller dodge range | Press DRIFT when it is close (inside ~330 px; DRIFT NOW! shows): the lock breaks. A shield eats it. Ghost Mode. |
| Rocket Volley | 3 rockets straight ahead | 4 / 5 rockets, more damage | Steer out of the line; shield. |
| Oil Slick | Dropped behind; whoever drives in spins out | wider / widest, longer spin | It blinks while it arms (0.45 s): drive round it, jump it, shield, ghost. |
| Spike Strip | Dropped behind; hurts and slows | wider, more hits | Blinks while arming: drive round, jump, shield, ghost. |
| Shield | Blocks the next hit | lasts longer / blocks two hits | EMP pops it; a cheap rocket or bolt uses it up. |
| EMP Blast | Shuts down nearby racers' items and weapons, cuts their boost, slows | bigger radius, longer | Keep your distance; a shield blocks it. |
| Turbo | A burst of speed | longer / faster | EMP cuts a boost; traps behind the leader. |
| Chain Lightning | Zaps the nearest racer in reach, then jumps racer to racer | reach + 1 jump / 4 jumps | Spread out from the pack; shield; ghost. |
| Gravity Well | Lobbed onto the nearest racer in reach; pulls racers in and holds them | bigger pull / crushes at the centre | Drive round the rim or boost through; airborne and ghosts are immune. |
| Ghost Mode | 3 s: pass through racers and every hit (no attacking while ghosted) | 3.6 s / 4.2 s | An EMP knocks a ghost back into the real world (and shuts it down). |
| Sticky Bomb | Flies ahead, sticks to the first racer it touches; passes to whoever the carrier bumps; blows up when its fuse runs out | splash / bigger splash, shorter fuse | Bump someone to pass it on; Ghost Mode shakes it off; a shield eats the blast. |
| Hunter Drone | Chases the racer ahead (LOCK-ON warning), hits and slows | faster / strikes twice | FIRE your weapon when it is close (FIRE TO SWAT!) to swat it; outrun it with a boost; shield; ghost. |
| Built-in weapons | (one per driver) | | Sand Mines blink while arming; everything else: shield, ghost, distance. |

**Combos.** An EMP-ed racer takes 1.5x missile damage (`COMBO!`). An oil slick and a spike strip
dropped on top of each other merge into one bigger trap that spins, hurts and slows several racers.

**Bots** use all 12 items (each with its own rule: missiles and drones from behind, traps with a
racer close behind, lightning / gravity / sticky with someone in reach, ghost and shield against an
incoming threat), steer into a rival to pass a sticky bomb, swat drones, and time a DRIFT press to
dodge a missile sometimes (easy 15%, normal 35%, hard 60% of missiles).

### Item balance (test/race-items-balance.test.js)

Win rate "45-55%" is measured HEAD-TO-HEAD (the lead's definition): for each item, 300 1v1 bot
races where racer A gets that item at every item box (holding it: it levels up) and racer B gets the
normal position-weighted roll at the same boxes (the neutral baseline is the item pool itself, so
the test asks "is this item worth about the same as an average item?"). Same car and bot level
(normal) for both, all 4 tracks, all 6 drivers, 150 fixed seeds each raced twice with the two grid
slots swapped. A's win rate must be within 45%-55% for every item. The full 3600 races run in the
default `npm test` (about 20-30 s over 3 worker threads).

Result (normal bots, 300 races per item, deterministic; re-tuned in Part 4 when the starter cars
were re-balanced for the car test below: missile damage -25% / turn -20% / spin halved, EMP shorter
and smaller, Turbo -30% length, Chain Lightning -40% damage, Spike Strip -15%, Shield -20% length):

| Item | A wins | Item | A wins | Item | A wins |
| --- | --- | --- | --- | --- | --- |
| Homing Missile | 52.0% | EMP Blast | 53.3% | Gravity Well | 48.7% |
| Oil Slick | 52.3% | Turbo | 53.3% | Ghost Mode | 50.7% |
| Shield | 53.7% | Spike Strip | 54.7% | Sticky Bomb | 54.3% |
| Rocket Volley | 51.7% | Chain Lightning | 54.3% | Hunter Drone | 50.7% |

Tuning notes: a spin-out is worth far more than damage in a race (a 0.3 s spin alone took the
missile to 68%), so missiles only spin from level II and only briefly; any boost (including a
"light" ghost boost) is strong because of the boost acceleration, so Ghost Mode has none.

## Car balance (Oblivion GP Part 4, test/race-cars-balance.test.js)

Win rate "45-55%" is measured HEAD-TO-HEAD (the lead's definition): every car (the 6 starters and
the 8 unlockable cars) races 1v1 against a rotating field of the other 13 cars, both driven by the
same bot brain at the same level (normal), weapons and items on as in a Grand Race, all 4 tracks,
12 fixed seeds per pair, each raced twice with the grid slots swapped (mirrored). That is 24 races
per pair and 13 x 24 = 312 races per car (2184 in all, ~20-30 s over 3 worker threads in
`npm test`). Every car's win rate must be within 45%-55%.

| Car | Wins | Car | Wins | Car | Wins |
| --- | --- | --- | --- | --- | --- |
| ARCWIRE (volt) | 53.8% | VOIDRUNNER (void) | 49.7% | REDLINE ZERO (redline) | 48.7% |
| WARHOG (brick) | 48.4% | SOLAR FANG (fang) | 51.6% | HELIX (helix) | 51.3% |
| PHANTOM (wisp) | 54.8% | FROSTBYTE (frost) | 50.3% | OBLIVION PRIME (prime) | 52.6% |
| SANDVIPER (dune) | 51.0% | GRAVITON (grav) | 46.8% | | |
| COBRA (rook) | 46.2% | PHANTOM VX (vx) | 49.0% | | |
| RAZOR (flicker) | 45.8% | | | | |

Before tuning the six starters alone ranged 19% (rook) to 76% (wisp): in a 1v1 race a few percent
of pace decides almost everything. Tuning: the starters' top speeds were evened out (lap pace within
about 1%), Rail Lance lost range (1150 -> 760) and damage (55 -> 40), Sentry Turret bolts gained
damage (16 -> 20); then only the new cars were tuned (so the item test above is not disturbed).

Perks are small tradeoffs paid for elsewhere: VOIDRUNNER (drift sparks charge 20% faster) has the
lowest top speed; SOLAR FANG (boosts last 25% longer) a weak pulse; FROSTBYTE (ice drives like road,
oil never spins it) weak mines; GRAVITON (item boxes within 120 px fly to it) a sentry; PHANTOM VX
(the first rival hit of the race passes through) low armor; REDLINE ZERO is the top speed leader
(846) with the worst handling (2.1) and acceleration; HELIX (built-in weapon recharges 25% faster)
a low top speed; OBLIVION PRIME has the best all-round stat bars (highest average and highest weakest
bar) but the lightest chassis (64 armor).

Built-in weapons of the new cars (variants of the six kinds): VOIDRUNNER Void Lance (rail), SOLAR
FANG Solar Flare (pulse), FROSTBYTE Ice Mines (mine, long slow), GRAVITON Orbit Sentry (turret),
PHANTOM VX Phase Slash (blink), REDLINE ZERO Redline Rail (rail, longest), HELIX Helix Arc (arc,
3 s with its perk), OBLIVION PRIME Event Horizon (pulse that drags racers in). Hitboxes are capsules
sized to the art (REDLINE ZERO 70 x 28, HELIX 52 x 42; area within -10%..+30% of the starters'
circle); walls use the same 22 px radius for every car.
