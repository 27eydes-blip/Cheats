# NPC realism + raft collision: morning report

## 1. Link

**https://drowned-earth.27eydes.workers.dev**

The final build is deployed and was boot-checked headless: it serves the new bundle, the game runs, and there
were no console errors and no failed requests.

## 2. What improved

### Rafts are solid (Phase 1)

- **Root cause:** the boat was one 1.3 m circle at its centre with no sub-steps, so the bow and stern rode
  1.5–2.8 m into rafts. Small outer rafts could even push the centre out the far side.
- **Hull:** now three circles along the keel, swept in steps of at most 0.25 m. Raised raft decks are no longer
  skipped, and parked boats are solid.
- **Never stuck:** a hull left overlapping anything slides out to the nearest open water.
- **On contact:**
  - scrape sound at low speed
  - thud, bump and slow-down at speed
  - a top-speed ram costs about 17–20 % hull
- **NPC and patrol boats:** they use the same hull collision.
- **Test:** `raft-collision-test` covers 5 rafts (small to large) × 3 speeds × 6 angles, plus a parked boat.
  The old code fails all of them; the new code passes 7/7.

### Faces and bodies agree (Phase 2)

- **Presentation:** every named NPC has a recorded presentation, and the generator follows it.
- **Facial hair:** none on women. Beards only on men over 18, stubble on men over 16. Bald heads show scalp
  stubble. Age lines only past 50.
- **Voice pitch:** now follows presentation and age. Before, it depended only on body size.
- **Test:** `npc-traits-test` generates 500 random people plus all 23 named NPCs. It passes 523/523, and it
  fails on any violation.

### How they look (Phase 2, shader-only, no new draw calls)

- **Skin:** colour variation and uneven sheen on everyone, so the tone isn't flat and waxy.
- **Eyes:** a corneal catch-light and a wet sheen.
- **Hair:** the scalp under the hair is tinted with the hair colour.
- **Clothes show the job:**
  - mechanics and scavengers: oil and tar
  - dock hands: salt
  - elders and traders: cleaner
  - labourers: more patches

### How they move (Phase 3)

- **New actions:** sweeping (broom), carrying a crate, mending nets on the lap, fishing with a rod, hauling
  rope, hammer rhythm, stirring, handing something over, crossed arms, leaning, nodding, laughing, hands over
  the ears, plus small fidgets.
- **Seats:** anyone who sits now sits on a crate fitted under their hips. Before, rafts had no seats, so
  sitters just stood.
- **Test:** `gesture-shots` poses one person through 17 activities and passes 17/17. I checked the contact
  sheet.

### How they act (Phase 4)

- **Eye contact:** they look at you, glance politely away and look back. Shy people look down.
- **Greetings:** they fit the hour and the person's speech style, and they're remembered: "Back again?",
  "There's our regular". One at a time across the town.
- **Conversations:** pairs face each other, the listener nods, a joke gets a laugh, and bystanders turn to
  listen.
- **World reactions:**
  - look up at thunder
  - cover their ears at gunfire nearby
  - the curious walk over to look at a crash
  - hunch, and walk to a doorway if there is one, in hard rain
- **Mood and personality:** wary people fold their arms and tired people slouch. Hard workers sweep instead of
  standing idle.
- **Schedules:** they now use the new jobs: the net-mender mends, the rope-maker hauls, the runner sweeps,
  fishers sit with rods.
- **Calm by default:** they only run from real threats.
- **Test:** `npc-life-test` loads real humans in Portage and checks all of the above. It passes 9/9.

**Performance:**
- Route draw calls and triangles are flat from start to finish (raft city 587 → 585 draw calls, 558k
  triangles).
- Props and seats exist only on full-detail people within 20 m (8 m on phones). The test saw 2–3 of them at
  the market.

## 3. Reverts

- **No phase was reverted.** Every phase gate passed.
- **Fixed rather than reverted:**
  - Procedural poses were compounding on bones the clips don't animate; people folded over within seconds.
    Found on the contact sheet and fixed with a snapshot/restore of the pose each frame.
  - The checkpoint deploy hit Cloudflare's rate limit. The deploy script now uploads only changed files,
    puts `index.html` last and backs off when throttled.
- **Still failing, unchanged from before this pass:** the creature test's `raid` scenario (the flashlight
  never registers on the gull-rats).

## 4. What I couldn't judge without a GPU

All rendering here is software (about 1 fps), so:

- whether the skin now reads as less waxy (the before/after close-ups differ only subtly)
- whether the eye catch-light shows (it's too small at the resolution I could render)
- the hard hairline on long styles: it's the hair mesh's own edge, so fixing it needs new hair assets
- how the procedural actions look in motion at real frame rates (sweep rhythm, laugh shake, nod speed)
- real frame times; draw-call and triangle counts are the reliable numbers

## 5. Animations: done vs missing

| Wanted | Status |
|---|---|
| talking gestures | ✅ mocap clip |
| sitting on crates/benches | ✅ mocap clip + seat |
| hammering | ✅ mocap clip + procedural rhythm |
| cooking | ✅ mocap clip + stir layer |
| handing items over | ✅ mocap Interact + give layer |
| listening/nodding, laughing, arms crossed, leaning | 🟡 procedural layer |
| sweeping, carrying crates, mending nets, fishing, hauling rope | 🟡 procedural layer + prop |
| breathing, weight shifts, fidgets | ✅ procedural |
| smooth transitions, no T-poses | ✅ cross-fades + layer blends |
| no foot sliding | ✅ walk speed matched to ground speed (unchanged) |

**Missing:**
- Real mocap for all the 🟡 rows. Legs and hips don't take part: no step into a sweep stroke, no squat to
  lift a crate.
- Hands don't close around props.
- No hammer or ladle prop.

## 6. Check first

1. Ram a small raft at full speed from several angles. You should bump off, slow, hear a thud and lose a bit
   of hull, and never end up on the deck.
2. Walk into Portage market in the morning, then come back a minute later. You should get a greeting, then
   "Back again?".
3. Stand near two NPCs until they chat: they should face each other, and the listener should nod.
4. Look at Osk (chapel raft, net-mender) and the fishers: they should be seated on crates with a net or rod.
   Check whether the seat height looks right.
5. Fire a gun near people: they should cover their ears.
6. Look at a few women and men up close: no facial hair on women, and skin that isn't waxy. These need your
   eyes on a real GPU.
7. Press F3: frame time should be no worse than before around the market.

Details: `OVERNIGHT.md` (the "NPC realism + raft collision pass" section). The new tests are
`scripts/raft-collision-test.mjs`, `npc-traits-test.mjs`, `npc-life-test.mjs` and `gesture-shots.mjs`.
