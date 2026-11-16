# Racing controls (iPhone SE 667x375, iPhone Pro Max 932x430, iPad 1180x820 at 2x; desktop 1440x900)

- `*-joystick-idle`: the steering joystick, always drawn bottom left (bottom right when left-handed).
- `*-slide-to-steer-hint`: first races only, until the player has steered for a moment.
- `*-steer-and-drift`: two thumbs: the stick held (arrow on the car shows the heading) + DRIFT.
- `*-go-countdown`, `*-reset-pulsing`, `*-settings`, `desktop-keys-hint`.
- `*-tutorial-1..4`, `*-tutorial-5-ready`: the tutorial overlay and its four prompts.

Taken before the engine branch was merged: the tutorial overlay is shown over a normal race with
the server's `tut` step events fed by the screenshot script, and RESET pulses from a `stuck`
value the script writes into the snapshot. After the merge the server provides both.
