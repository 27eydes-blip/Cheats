/* Plain-text version of a report, for email. Plain text only: nothing in a report
   (some of which comes from the scanned site) can render as HTML in the reader's inbox. */
const LABEL = { pass: "PASS", warn: "NEEDS WORK", fail: "AT RISK", info: "INFO", skip: "NOT CHECKED" };

export function formatReportText(report, { siteOrigin }) {
  const L = [];
  const rule = "-".repeat(60);
  L.push(`Website Security Check: ${report.domain}`);
  L.push(`Grade ${report.grade} (${report.score}/100) - ${report.headline}`);
  L.push(`Checked ${report.scannedAt.replace("T", " ").slice(0, 16)} UTC${report.platform?.label ? ` - Detected: ${report.platform.label}` : ""}`);
  L.push("");
  if (report.priorities?.length) {
    L.push("YOUR TOP FIXES");
    L.push(rule);
    report.priorities.forEach((p, i) => {
      L.push(`${i + 1}. ${p.title}  [${p.impact} impact, ${p.effort}, ${p.who}]`);
      L.push(`   ${p.why}`);
    });
    L.push("");
  }
  if (report.industry?.note) {
    L.push(`FOR ${report.industry.label.toUpperCase()} BUSINESSES`);
    L.push(rule);
    L.push(report.industry.note);
    L.push("");
  }
  for (const s of report.sections) {
    L.push(s.title.toUpperCase());
    L.push(rule);
    for (const c of s.checks) {
      L.push(`[${LABEL[c.status] || c.status}] ${c.title}`);
      L.push(`   ${c.detail}`);
      if (c.fix && c.status !== "pass" && c.status !== "skip") L.push(`   How to fix: ${c.fix}`);
      for (const sn of c.snippets || []) {
        L.push(`   ${sn.label}:`);
        for (const line of String(sn.code).split("\n")) L.push(`      ${line}`);
      }
    }
    L.push("");
  }
  L.push("WANT US TO FIX THESE?");
  L.push(rule);
  L.push(`Book a full security audit: ${siteOrigin}/contact?website=${encodeURIComponent(report.domain)}&score=${report.score}`);
  L.push(`Run the check again any time: ${siteOrigin}/security-check`);
  L.push("");
  L.push(report.disclaimer);
  return L.join("\n");
}
