#!/usr/bin/env node
// Pair one of the LG TVs outside voice:  npm run tv:pair -- "living room"   (or "blue room")
// Scans the home network for port 3001, tries 192.168.4.217 and 192.168.4.48 first, and shows a
// pairing prompt on whichever TV answers: accept it with that TV's remote. Saves the IP, MAC and
// client key under the room name in data/lg-keys.json (git-ignored).
// For the very first room, have only that TV on, so it's clear which TV is which.
//   --force   pair even if more than one TV answers the scan
//   --list    show what's paired (no keys)
import { findRoom, lgSettings, pairedRooms, pairRoom } from "../server/lg/index.js";

const args = process.argv.slice(2);
const cfg = lgSettings();
const names = cfg.rooms.map((r) => r.name);

if (args.includes("--list")) {
  const paired = pairedRooms();
  if (!paired.length) console.log("No LG TVs paired yet.");
  for (const p of paired) console.log(`${p.room}: ${p.ip}${p.mac ? `, MAC ${p.mac}` : ", no MAC"} (paired ${p.pairedAt})`);
} else {
  const room = findRoom(args.filter((a) => !a.startsWith("--")).join(" "), cfg);
  if (!room || room === "all") {
    console.log(`Which TV? npm run tv:pair -- "${names[0]}"   (rooms: ${names.join(", ")})`);
    process.exitCode = 2;
  } else {
    console.log(`Pairing the ${room} TV. Looking for TVs on the network (port ${cfg.port})...`);
    const r = await pairRoom(room, {
      force: args.includes("--force"),
      onPrompt: (ip) => console.log(`A pairing prompt should be on the TV at ${ip} now. Accept it with that TV's remote (you have ${cfg.pairTimeoutSeconds} seconds).`),
    });
    if (r.ok) console.log(`Done: the ${room} TV is ${r.ip}${r.mac ? `, MAC ${r.mac}` : " (MAC unknown: turning it on by voice won't work until it's paired again while on)"}. Saved in data/lg-keys.json.`);
    else {
      console.log(r.error);
      process.exitCode = 1;
    }
  }
}
