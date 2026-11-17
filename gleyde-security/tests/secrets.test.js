/* Secret-leak scan of the working tree AND every commit in git history.
   Default scope: this site's folder. SCAN_WHOLE_REPO=1 scans every path in the repository.
   For CI, also consider gitleaks (https://github.com/gitleaks/gitleaks). */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = (...args) => execFileSync("git", args, { cwd: SITE, encoding: "utf8", maxBuffer: 1 << 30 });
const ROOT = git("rev-parse", "--show-toplevel").trim();
const SCOPE = process.env.SCAN_WHOLE_REPO ? ROOT : SITE;
const REL = path.relative(ROOT, SCOPE) || ".";

export const PATTERNS = {
  "Resend API key": /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{8,}\b|\bre_[A-Za-z0-9]{24,}\b/,
  "Turnstile secret key": /\b0x4AAAAAA[A-Za-z0-9_-]{20,}\b/,
  "Cloudflare API token/key": /\b(?:CF|CLOUDFLARE)_API_(?:TOKEN|KEY)\s*[=:]\s*['"]?[A-Za-z0-9_-]{37,}/i,
  "AWS access key": /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  "GitHub token": /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{60,}\b/,
  "Slack token": /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/,
  "Stripe live key": /\b[sr]k_live_[A-Za-z0-9]{20,}\b/,
  "Google API key": /\bAIza[0-9A-Za-z_-]{35}\b/,
  "OpenAI/Anthropic key": /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{32,}\b/,
  "Private key block": /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/,
  "JWT": /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  "Hard-coded secret assignment":
    /\b(?:secret|password|passwd|api[_-]?key|auth[_-]?token|access[_-]?token|private[_-]?key)\b["']?\s*[:=]\s*["'][^"'\s$]{16,}["']/i,
};

/* Whole-repo findings that were reviewed by hand and are NOT secrets (exact paths only):
   - remote-tls/key.pem: self-signed key for CN=localhost, used only by a Rust TLS test.
   - the two test files hold dummy values ('3f2b8c1e-aaaa-…' UUID, "user@example.com"). */
const REVIEWED_PATHS = new Set([
  "crates/bsk-cli/tests/fixtures/remote-tls/key.pem",
  "hunt/test/deploy.test.js",
  "apps/extension/src/tools/vom/__tests__/semantic-graph.test.ts",
]);

/* Known-safe values: Cloudflare's published Turnstile test keys and our placeholders. */
const ALLOW = [/1x0000000000000000000000000000000AA/, /re_x{8,}/, /change-me-to-a-long-random-string/];

export function findSecrets(text) {
  const hits = [];
  for (const line of text.split("\n")) {
    if (ALLOW.some((a) => a.test(line))) continue;
    for (const [name, re] of Object.entries(PATTERNS)) if (re.test(line)) hits.push(`${name}: ${line.trim().slice(0, 120)}`);
  }
  return hits;
}

test("scanner detects known secret shapes (self-test)", () => {
  const fake = [
    "RESEND_API_KEY=re_" + "Ab12Cd34_Ef56Gh78Ij90Kl12Mn34",
    "TURNSTILE_SECRET_KEY=0x4AAAAAA" + "Bcdefghijklmnopqrstuvwxyz",
    "aws = AKIA" + "ABCDEFGHIJKLMNOP",
    "-----BEGIN " + "PRIVATE KEY-----",
    'const apiKey = "' + "q8Zt3LmP0vXr7NcY2wK" + '"',
  ];
  for (const f of fake) assert.equal(findSecrets(f).length > 0, true, f);
  assert.deepEqual(findSecrets("TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA"), []);
});

test(`working tree (${REL}) contains no secrets`, () => {
  const files = git("ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", SCOPE).split("\0").filter(Boolean);
  const hits = [];
  for (const f of files) {
    if (REVIEWED_PATHS.has(f)) continue;
    if (/\.(woff2?|png|jpe?g|gif|ico|pdf)$/i.test(f) || /package-lock\.json$|pnpm-lock\.yaml$|Cargo\.lock$/.test(f)) continue;
    let text;
    try { text = readFileSync(path.join(ROOT, f), "utf8"); } catch { continue; }
    for (const h of findSecrets(text)) hits.push(`${f} -> ${h}`);
  }
  assert.deepEqual(hits, []);
});

test(`git history (${REL}, all branches) contains no secrets`, () => {
  const log = git("log", "--all", "-p", "--no-color", "--no-ext-diff", "--format=@@COMMIT %H", "--", SCOPE,
    ":(exclude,glob)**/*.woff2", ":(exclude,glob)**/*.pdf", ":(exclude,glob)**/package-lock.json",
    ":(exclude,glob)**/pnpm-lock.yaml", ":(exclude,glob)**/Cargo.lock");
  const hits = [];
  let commit = "";
  let file = "";
  for (const line of log.split("\n")) {
    if (line.startsWith("@@COMMIT ")) { commit = line.slice(9, 17); continue; }
    if (line.startsWith("+++ ")) { file = line.replace(/^\+\+\+ (b\/)?/, ""); continue; }
    if (!line.startsWith("+") || REVIEWED_PATHS.has(file)) continue; // only lines ever added
    for (const h of findSecrets(line.slice(1))) hits.push(`${commit} ${file} -> ${h}`);
  }
  assert.deepEqual(hits, []);
});

test(".dev.vars / .env files are git-ignored and were never committed", () => {
  for (const f of [".dev.vars", ".env", ".env.production"]) {
    assert.doesNotThrow(() => git("check-ignore", "-q", path.join(SITE, f)), `${f} must be ignored`);
  }
  const ever = git("log", "--all", "--name-only", "--format=", "--", ":(glob)**/.dev.vars", ":(glob)**/.env", ":(glob)**/.env.*").trim();
  assert.equal(ever, "", `committed at some point:\n${ever}`);
});

test(".dev.vars.example holds only placeholders / Cloudflare test keys", () => {
  const text = readFileSync(path.join(SITE, ".dev.vars.example"), "utf8");
  assert.deepEqual(findSecrets(text), []);
  assert.match(text, /TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA/);
  assert.match(text, /RESEND_API_KEY=re_x+/);
});

test("no secrets in wrangler.toml (it is committed and readable by anyone with repo access)", () => {
  const text = readFileSync(path.join(SITE, "wrangler.toml"), "utf8");
  assert.ok(!/^\s*(TURNSTILE_SECRET_KEY|RESEND_API_KEY|RATE_LIMIT_SALT)\s*=/m.test(text));
});
