// Glydrift adapter — the ONLY game-specific file. Runs inside the page (injected by the recorder
// before the game's own scripts; nothing here ships with the game). It tells the demo bot how to
// read the game and press its buttons, and lets moments.json stage scenes (warp to a realm, pick a
// hero...). test/fixture.adapter.js is a complete, working example against the stand-in game.
//
// STATUS: not wired up yet — the Glydrift source wasn't available when this was written.
// Fill in each TODO against the game's real objects (e.g. a global `game`, a store, or a module
// exposed on window in dev builds). Coordinates may be in any unit (game px recommended) as long
// as player, hazards, bounds and predict() all agree.
(() => {
  const todo = (what) => {
    throw new Error(`[glydrift.adapter] TODO: implement ${what} — see config/glydrift.adapter.js`);
  };
  const G = () => window.game; // TODO: however the running game instance can be reached

  window.__glyAdapter = {
    /** true once the game has booted to its menu and can start a run */
    ready: () => !!G(),

    /** go from the menu straight into a run, and hand control to the bot */
    startRun() {
      todo("startRun() — e.g. G().start() or dispatch the tap that starts a run");
      window.__demoBot.enabled = true;
    },

    /** every distinct input the player can give in one frame; first = "no input" */
    actions: ["none", "left", "right"], // TODO: e.g. ["release", "hold"] for one-touch glide

    /** apply one action for the coming frame */
    apply(action) {
      todo(`apply("${action}") — set the game's input state (or dispatch pointer events)`);
    },

    /**
     * Snapshot for the bot:
     *  alive   false once the player has died
     *  player  {x, y, vx, vy, r}       position, velocity (units/s), hit radius
     *  hazards [{id, x, y, w, h, vx, vy}]  axis-aligned boxes, or {x, y, r} circles; velocities in units/s
     *  bounds  {x, y, w, h}            playable area (optional)
     *  realm   "solar" | "frozen" | "glitch" | "calm" | "abyss" | ...  (changes emit events)
     *  score, combo
     */
    state() {
      return todo("state()");
    },

    /** one 1/60s step of the player's physics under `action` (copy of the game's own update) */
    predict(player, action, ms, state) {
      return todo("predict() — mirror the player's movement code so the bot can plan");
    },

    /** optional game events, drained every frame: [{type: "eyeBeam"}, {type: "flex"}, {type: "surf"}] */
    events() {
      return []; // TODO: push "eyeBeam" when the Eye Beam warning starts, "flex"/"surf" for hero moves
    },

    // ---- staging helpers used by config/moments.json
    /** jump the run to ~2s before the transition INTO `realm`, so the transition plays on camera */
    warp(realm) {
      todo(`warp("${realm}")`);
    },
    /** select a hero before startRun(): "yarms", "sonjuwon" (the electric tiger) */
    hero(id) {
      todo(`hero("${id}")`);
    },
    /** god mode so a bot misjudgement can't end a showcase take (hitboxes still drive near-misses) */
    invincible(on) {
      todo(`invincible(${on})`);
    },
    /** open a menu screen: "leaderboard" | "shop" */
    openScreen(name) {
      todo(`openScreen("${name}")`);
    },
  };
})();
