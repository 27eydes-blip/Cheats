# The glydrift.com launch event

This pop-up appears only on the old address (`27eydes-blip.github.io/Cheats/glydrift/`), on the home screen. It joins the usual one-at-a-time queue, after the name prompt and the daily reward.

| | Guest | Signed in |
|---|---|---|
| Headline | GLYDRIFT HAS A NEW HOME · glydrift.com | same |
| Line | "Lock in your progress before the jump." | "You're all set! Your progress is coming with you." |
| Main button | CREATE ACCOUNT, which opens sign-up | LET'S GO |
| Second button | LATER (small) | none |
| When it shows | Once. After LATER, once more on a later launch. Never twice in one launch, and never a third time. Only when accounts are open on the server. | Once |

## The reward: Founding Drifter

- **Trail:** "Founding Drifter", legendary. A portal-coloured stream with gold glints.
- **Title:** "Founding Drifter", gold, listed under EVENTS on the Titles screen.
- **When it's given:** when a guest creates an account or signs in from the pop-up, or when a signed-in player taps LET'S GO. It's worn automatically only if nothing is already worn in that slot.
- **Exclusive:** never for sale. It never appears in the daily shop or the Mystery Pod (the test checks 60 days of daily shops and 400 pods).
- **Kept for good:** it's saved to the account's cloud copy straight away, so it follows the player to glydrift.com. Cloud saves merge owned items, so it can't be lost.
- **Email still to confirm:** if a new account's email isn't confirmed yet, the player sees "CHECK YOUR EMAIL". The pop-up comes back signed-in on a later launch, so they can claim the reward then.

## What happens on screen

1. **Rift (0–0.5 s):** a glowing slash tears open in the centre and widens into a portal. It plays a whoosh and a light haptic.
2. **Panel (0.3–0.75 s):** the panel flies out of the rift with a slight spin and bounce. It lands with confetti, plus gold stars unless Reduce Flashing is on, and a light haptic.
3. **Domain:** "glydrift.com" types in letter by letter with a neon flicker, then plays a sparkle chime and pulses gently in gold.
4. **Preview:** the player's own hero loops through the header portal in a figure-eight, wearing the Founding trail.
5. **Buttons:** CREATE ACCOUNT / LET'S GO glows and breathes. Tapping it gives a confetti burst and a light haptic.
6. **"PROGRESS LOCKED IN!":** a celebratory sting and a strong haptic. The trail and title pop in, confetti falls, then both fly into HEROES ("Added to your collection"). It closes on a tap or after 3.2 s.

## Reduce Flashing

- No letter flicker.
- No pulsing scale on the button, and the glow breathes slowly.
- Fewer confetti, and no star bursts.
- The portal swirls at about 40% speed and doesn't wobble.

## Performance

The pop-up adds:
- one Graphics redraw per frame (the portal: 3 ellipses and 12 small squares);
- one extra hero;
- one pooled particle set, created once.

Every tween is cleaned up when the pop-up closes.

## Recording

`docs/move/launch-event.mp4`: a guest from the portal to the celebration, then the same player signed in on a later launch with LET'S GO.
