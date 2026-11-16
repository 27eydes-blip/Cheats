# Racing controls (iPhone SE 667x375, iPhone Pro Max 932x430, iPad 1180x820 at 2x; desktop 1440x900)

- `*-joystick-idle`: the steering joystick, always drawn bottom left (bottom right when left-handed).
- `*-slide-to-steer-hint`: first races only, until the player has steered for a moment.
- `*-steer-and-drift`: two thumbs: the stick held (arrow on the car shows the heading) + DRIFT.
- `*-go-countdown`, `*-reset-pulsing`, `*-settings`, `desktop-keys-hint`.
- `*-tutorial-1..4`, `*-tutorial-5-ready`: the tutorial overlay and its four prompts.

The tutorial shots are a real tutorial run (cone slalom, drift curve, item boxes, target car),
taken on a trial merge with the engine branch (fix/rc-steer), driven by touch. RESET pulsing is
shown with a `stuck` value written into the snapshot by the screenshot script (being stuck on
purpose is hard to stage); the server reports it for real.
