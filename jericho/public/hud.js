// Live corner readouts: time and date, the current weather and the next calendar event.
// Look only: it reads /api/hud (the same weather and calendar code the voice tools use) every
// few minutes, and a readout that can't be fetched just stays hidden.
const $ = (id) => document.getElementById(id);
const REFRESH_MS = 5 * 60_000;

function token() {
  try {
    return localStorage.getItem("jericho-token") || "";
  } catch {
    return "";
  }
}

function tick() {
  const now = new Date();
  $("hud-time").textContent = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  $("hud-date").textContent = now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

function show(id, on) {
  const el = $(id);
  if (el) el.hidden = !on;
}

async function refresh() {
  try {
    const res = await fetch("/api/hud", { headers: { "x-jericho-token": token() } });
    if (!res.ok) throw new Error(String(res.status));
    const { weather, event } = await res.json();
    if (weather?.ok) {
      $("hud-weather-now").textContent = `${weather.now}°${weather.units} · ${weather.sky}`;
      $("hud-weather-sub").textContent = `H ${weather.high}° · L ${weather.low}° · ${weather.place}`;
    }
    show("hud-weather", Boolean(weather?.ok));
    if (event?.ok) {
      $("hud-event-title").textContent = event.title;
      $("hud-event-when").textContent = `${event.day} · ${event.time}`;
    }
    show("hud-event", Boolean(event?.ok));
  } catch {
    // offline or not allowed: hide quietly, try again next time
    show("hud-weather", false);
    show("hud-event", false);
  }
}

tick();
// line the clock up with the minute, then update once a minute
setTimeout(() => {
  tick();
  setInterval(tick, 60_000);
}, 60_000 - (Date.now() % 60_000) + 50);
refresh();
setInterval(() => !document.hidden && refresh(), REFRESH_MS);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    tick();
    refresh();
  }
});
