// Fake bulbs: prints the command and remembers state. Swap for hue.js / kasa.js later.
const state = new Map(); // room -> { on, brightness }

export async function setLight(room, on, brightness) {
  const prev = state.get(room) || { on: false, brightness: 100 };
  const next = { on, brightness: brightness ?? prev.brightness };
  state.set(room, next);
  console.log(
    `💡 [MOCK LIGHTS] ${room} -> ${on ? "ON" : "OFF"}${on ? ` (${next.brightness}%)` : ""}`,
  );
  return next;
}

export async function getState() {
  return Object.fromEntries(state);
}
