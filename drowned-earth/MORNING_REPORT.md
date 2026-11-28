# Morning report — overnight pass

## 1. Deployed link
**https://drowned-earth.27eydes.workers.dev** — press Ctrl+F5 once. Checked after deploying: menu → story → playing with no console errors and no failed requests.

## 2. What improved
- **Smoother**
  - **Shaders:** places you approach now compile their shaders in the background (people and hidden parts included). Mid-play shader compiles on a Portage walk + boat + dive went from 9 frames (up to 7 programs each) to 4 frames (1–2 each). Over 5 minutes of play: 15 programs in 6 frames (was 17 in 7).
  - **Logic:** 5 minutes of play has 0 logic stalls over 200 ms (average 1.9 ms per frame).
  - **Default quality:** first launch uses Standard on a dedicated graphics card and Light otherwise. Safe mode drops to Light if it struggles.
  - **Load:** the route draws 7% fewer draw calls and 5% fewer triangles than at the start of the night (start-of-night vs final code, back to back). Sustained frame rate is unchanged within what can be measured here.
- **Water:** no longer turns white in the middle distance on hazy days. Reflections are capped and tinted, the sun glint is clamped, and the horizon line reads.
- **Buildings and docks** (shader only, no extra geometry): boarded-up windows, mostly on low floors; rust streaks; cracks; moss on ledges; plank joints, patched boards, stains and worn paths on wood decks.
- **People:**
  - Nobody jogs away from you anymore. They step aside calmly and only run from a drawn weapon.
  - Nobody hovers in a sitting pose. There are no seats on the rafts, so they stand, and sleepers are indoors.
- **Boats:**
  - **Handling:** the bow rises and settles as you get up to speed, and the stern slides on hard turns.
  - **Camera:** the view widens with speed and judders slightly in waves (both off with Reduce motion).
  - **Look:** a weathered hull with patches, a waterline grime band, rust and worn paint.
  - **Sound:** a wake hiss that rises with speed, hull slap, engine strain, and a splash when you jump off.
- **Portage:**
  - Market vendors call out in the daytime.
  - There are three hidden things to find:
    - a note under the chapel raft's bell;
    - a stash tin on the sleeping pontoon;
    - a hooded figure on the water-barrel raft, between 1 and 4 am.
- **Bug sweep:** 20 confirmed bugs fixed (details in OVERNIGHT.md). Some you might have hit:
  - E stopped leaving the boat while the gull wanted food.
  - The emergency exit could drop you at the world's origin.
  - A moored boat drifted off when you got out.
  - Safe mode could reload forever.

## 3. What was reverted, or not done
- **Reverted:** nothing. Every phase passed its tests and stayed inside the draw-call and triangle budget, judged on route totals because single route phases swing ±20% between runs.
- **Not done, because tonight's rules excluded new assets and features:**
  - new animations (lean, laugh, sweep, carry, fishing, sitting on an edge);
  - a new boat model;
  - balconies and rooftop clutter;
  - kids, haggling and new town events.
- **Still failing:** one creature test (gull-rats are not scared off by the flashlight). It failed the same way before tonight. Logged in PROGRESS.md.

## 4. What I could not judge without a GPU
- Frame rate on a real PC. Everything here renders on the CPU at about 1 fps, so only draw calls, triangles, shader compiles and logic time were measured.
- How the water, sky, facade details, hull weathering and decks look at full resolution. I only saw small software-rendered screenshots, and the facade details only from a distance.
- Faces, eyes, hair and clothing. I didn't change them, because I couldn't judge subtle shading.
- All the new boat sounds and vendor voices. There's no audio here; I only checked that the code runs without errors.

## 5. Check these first
1. Press **F3** in the game and drive a loop around Portage. Is it smooth? Press **F4** to save a frame log if it stutters, and send it.
2. Midday on the boat: does the distant water look right, not white and not too dark?
3. Walk around Portage: do people step aside calmly, and is nobody floating?
4. Drive fast: do the planing, the turn drift, the FOV push and the new sounds feel good, or too much?
5. Find the three Portage secrets (hint: the chapel raft's bell).
