// One line per failed test (after retries) in failures.txt — CI prints it as the job's last
// step so the reason for a red run is the first thing in the log.
import { writeFileSync } from "node:fs";

export default class SummaryReporter {
  constructor() {
    this.failed = new Map();
  }
  onTestEnd(test, result) {
    const key = `${test.parent.project()?.name} › ${test.title}`;
    if (result.status === "passed" || result.status === "skipped") this.failed.delete(key);
    else {
      const msg = (result.error?.message || result.status).replace(/\u001b\[[0-9;]*m/g, "");
      // the first lines name the failure; for "no console errors" the next ones are the errors
      this.failed.set(key, msg.split("\n").filter(Boolean).slice(0, 9).join(" | ").slice(0, 1200));
    }
  }
  onEnd(result) {
    const lines = [...this.failed].map(([k, v]) => `FAIL ${k}: ${v}`);
    writeFileSync(
      "failures.txt",
      `${result.status}: ${lines.length} failed\n${lines.join("\n")}\n`,
    );
  }
}
