// Hidden music test page: tap the GLYDRIFT logo 5 times on the home screen (or open ?music).
// Play every reggae track (and, for comparison, the old house tracks), push intensity to hear
// the layers build, try the death sweep, or play the full journey: every realm in order with
// all the real transitions, the realm titles landing on the beat like in a run.
import Phaser from "phaser";
import { BIOMES, blendPalette } from "../biomes/biomes.js";
import { fitCamera, VIEW } from "../config.js";
import { CALM_INFO, JOURNEY_ROUTE, Music, TRACK_INFO } from "../audio/music.js";
import { button, hex, neonText, plainText, slider } from "../ui/ui.js";

// (the Calm sits between the Glitch Realm and the Abyss, as in a run)
const CALM_AT = JOURNEY_ROUTE.indexOf("abyss");
const REGGAE = [
  "menu",
  ...JOURNEY_ROUTE.slice(0, CALM_AT),
  "calm",
  ...JOURNEY_ROUTE.slice(CALM_AT),
];
// the old house soundtrack predates Sakura Skies: it has no track for it
const HOUSE = ["menu", ...JOURNEY_ROUTE.filter((id) => id !== "sakura")];
const colorOf = (id) =>
  id === "menu"
    ? 0xb45cff
    : id === "calm"
      ? 0x8a80b0
      : (BIOMES.find((b) => b.id === id)?.neon ?? 0x3ef4ff);
const palOf = (id) =>
  Math.max(
    0,
    BIOMES.findIndex((b) => b.id === (id === "calm" ? "glitch" : id)),
  );

export class MusicTestScene extends Phaser.Scene {
  constructor() {
    super("MusicTest");
  }

  create() {
    fitCamera(this);
    const W = VIEW.W;
    const H = VIEW.H;
    const top = (this.registry.get("safeTop") || 0) + 10;
    this.backdrop = this.scene.get("Backdrop");
    this.pal = blendPalette({ a: BIOMES[0], b: BIOMES[0], t: 0 }, {});
    this.intensity = 1;
    this.mode = "reggae";
    this.house = null;
    // the old engine is only fetched here, ahead of the tap that plays it (iOS gesture rules)
    import("../audio/house/houseEngine.js").then((m) => {
      this.house = m;
    });

    button(this, 80, top + 40, 120, 60, "BACK", {
      color: 0xff4fd8,
      size: 18,
      onClick: () => {
        this.house?.HouseMusic.stop();
        Music.stop();
        Music.play("menu");
        this.scene.start("Menu");
      },
    });
    neonText(this, W / 2 + 40, top + 40, "MUSIC TEST", 32, 0x39ff88, { blur: 10 });
    plainText(this, W / 2, top + 88, "Pre-rendered reggae · tap a track to play", 17, "#bfb6e8");
    this.modeBtns = ["reggae", "house"].map((m, i) =>
      button(
        this,
        W / 2 + (i ? 160 : -160),
        top + 140,
        300,
        60,
        m === "reggae" ? "REGGAE (NEW)" : "HOUSE (OLD)",
        {
          color: m === "reggae" ? 0x39ff88 : 0x8a80b0,
          size: 18,
          onClick: () => this.setMode(m),
        },
      ),
    );
    this.gridTop = top + 222;
    this.rows = [];
    this.buildGrid();

    const cy = this.gridTop + 7 * 90 + 6;
    button(this, W / 2, cy, 620, 72, "PLAY FULL JOURNEY", {
      color: 0xffd23f,
      size: 22,
      sub: "every realm in order, with all transitions",
      onClick: () => this.journey(),
    });
    slider(
      this,
      90,
      cy + 78,
      W - 180,
      this.intensity,
      0xffd23f,
      (v) => {
        this.intensity = v;
      },
      { label: "INTENSITY (speed: drums+bass → skank → lead)" },
    );
    const small = [
      [
        "DEATH",
        0xff2a3d,
        () => (this.mode === "house" ? this.house?.HouseMusic.deathSweep() : Music.deathSweep()),
      ],
      [
        "RETRY",
        0x39ff88,
        () => (this.mode === "house" ? this.house?.HouseMusic.restore() : Music.restore()),
      ],
      ["STOP", 0x8a80b0, () => this.stopAll()],
      ["DROP", 0xb45cff, () => this.jumpToDrop()],
    ];
    small.forEach(([label, color, onClick], i) =>
      button(this, 110 + i * 167, cy + 150, 150, 60, label, { color, size: 16, onClick }),
    );
    this.status = plainText(this, W / 2, Math.min(H - 70, cy + 210), "", 19, "#ffffff");
    this.info = plainText(this, W / 2, Math.min(H - 38, cy + 240), "", 15, "#bfb6e8");
    this.banner = neonText(this, W / 2, H * 0.36, "", 44, 0xffffff, { blur: 14 })
      .setDepth(50)
      .setAlpha(0);
    this.setMode("reggae");
  }

  buildGrid() {
    for (const r of this.rows) r.b.destroy();
    const W = VIEW.W;
    const list = this.mode === "reggae" ? REGGAE : HOUSE;
    this.rows = list.map((id, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const info =
        this.mode === "reggae"
          ? id === "calm"
            ? CALM_INFO
            : TRACK_INFO[id]
          : this.house?.HOUSE_TRACKS[id];
      const name = (info?.name || id).replace(" (Menu)", "").toUpperCase();
      const sub =
        this.mode === "reggae"
          ? `${info.bpm} BPM${info.feel && info.feel !== "one drop" ? ` ${info.feel.split(" ")[0]}` : ""} · ${info.key}`
          : `${info?.bpm ?? "?"} BPM · house`;
      const b = button(this, W / 2 + (col ? 162 : -162), this.gridTop + row * 90, 312, 80, name, {
        color: colorOf(id),
        size: 19,
        sub,
        onClick: () => this.playTrack(id),
      });
      return { id, b };
    });
  }

  setMode(m) {
    if (m === "house" && !this.house) return;
    this.stopAll();
    this.mode = m;
    this.modeBtns.forEach((b, i) => b.setAlpha((i === 0) === (m === "reggae") ? 1 : 0.45));
    this.buildGrid();
  }

  stopAll() {
    this.calmDemo = null;
    this.house?.HouseMusic.stop();
    Music.stop();
  }

  playTrack(id) {
    this.calmDemo = null;
    this.selected = id;
    if (this.mode === "house") {
      Music.stop();
      const H = this.house.HouseMusic;
      H.unlock();
      H.play(id, { startBar: 0 });
      return;
    }
    this.house?.HouseMusic.stop();
    Music.unlock();
    if (id === "calm") {
      // the Calm as it happens in a run: the Glitch Realm dissolving into echo + heartbeat
      Music.play("glitch", { startBar: 16, restart: true });
      this.calmDemo = { t0: performance.now() + 2500 };
      return;
    }
    Music.play(id, { startBar: 0, intro: true, restart: true });
  }

  jumpToDrop() {
    const id = Music.status().id;
    if (this.mode === "reggae" && id) Music.play(id, { startBar: 16, restart: true });
    if (this.mode === "house") {
      const h = this.house?.HouseMusic;
      const hid = h?.status().id;
      if (hid) {
        h.stop();
        h.play(hid, { startBar: 32 });
      }
    }
  }

  journey() {
    if (this.mode !== "reggae") this.setMode("reggae");
    this.calmDemo = null;
    Music.unlock();
    // the context may still be starting: try again on the next frames
    const go = () =>
      Music.journey((id) => {
        if (!id) return this.showBanner("JOURNEY COMPLETE", 0xffffff);
        this.showBanner(`ENTERING ${TRACK_INFO[id].name.toUpperCase()}`, colorOf(id));
      });
    if (!go()) this.time.delayedCall(200, go);
  }

  showBanner(text, color) {
    this.banner.setText(text);
    this.banner.setTint?.(color);
    this.tweens.killTweensOf(this.banner);
    this.banner.setAlpha(1).setScale(1.25);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 260, ease: "Back.easeOut" });
    this.tweens.add({ targets: this.banner, alpha: 0, delay: 1700, duration: 500 });
  }

  update() {
    const reggae = this.mode === "reggae";
    if (reggae) {
      Music.tick();
      if (!Music.journeyState) Music.setIntensity(this.intensity);
      if (this.calmDemo) {
        const k = (performance.now() - this.calmDemo.t0) / 7000;
        if (k > 0) Music.setCalm(Math.min(1, k));
      }
    } else this.house?.HouseMusic.setIntensity(this.intensity);
    const st = reggae ? Music.status() : this.house?.HouseMusic.status() || {};
    const id = st.pending || st.id;
    if (id) {
      const i = palOf(id);
      blendPalette({ a: BIOMES[i], b: BIOMES[i], t: 0 }, this.pal);
    }
    this.backdrop.drive(this.pal, { scroll: 90, dim: 0.55, scenery: false });
    for (const r of this.rows) r.b.setAlpha(r.id === st.id ? 1 : r.id === st.pending ? 0.8 : 0.55);
    const info = reggae ? TRACK_INFO[st.id] : this.house?.HOUSE_TRACKS[st.id];
    this.status.setText(
      !st.unlocked
        ? "Tap anywhere to enable audio"
        : `${info ? info.name : "—"}  ·  ${String(st.section).toUpperCase()}  ·  bar ${st.bar + 1}  ·  ${st.bpm} BPM${st.pending ? `  →  ${TRACK_INFO[st.pending].name}` : ""}`,
    );
    this.status.setColor(st.id ? hex(colorOf(st.id)) : "#ffffff");
    this.info.setText(info ? (reggae ? `${info.style} · ${info.key}` : info.mood) : "");
  }
}
