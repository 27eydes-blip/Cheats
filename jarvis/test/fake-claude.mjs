#!/usr/bin/env node
// Stands in for the real `claude` CLI in tests: writes a file in cwd and prints JSON.
import fs from "node:fs";
fs.writeFileSync("made-by-fake-claude.txt", process.argv.slice(2).join(" "));
console.log(JSON.stringify({ type: "result", is_error: false, result: "Built it.\nSUMMARY: Created a hello world app." }));
