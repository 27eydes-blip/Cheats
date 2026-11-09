# Glydrift: project instructions

- Never remove or hide the Sam Eyde III creator credit or copyright line.
  It appears on the home screen ("Created by Sam Eyde III"), in Settings → CREDITS
  ("Created by Sam Eyde III, Founder & CEO" and "© 2026 Sam Eyde III. All rights reserved."),
  on the loading screen ("A Sam Eyde III game"), in the website footer, README and LICENSE.
  The text lives in src/legal.js; tests/e2e/credit.spec.js fails the build if any of it goes
  missing. Redesigns, cleanups and polish passes must keep it, readable, on every screen size.
- Use exactly "Sam Eyde III".
