// What Jericho may touch on your PC. Checked in code before anything runs, and again
// inside each tool. Three tiers:
//   safe    - runs straight away (open an app or a web page, volume, media keys, timers,
//             clipboard, list/read/search files in the allowed folders)
//   (also safe: write and move files in the allowed folders; an overwritten file is backed up)
//   confirm - read back exactly what will happen, then needs your spoken yes
//             (delete to the Recycle Bin, run a command, anything that sends, posts or calls)
//   blocked - never: paths outside pc.allowedFolders, system/registry/security changes,
//             reading .env or anything that holds secrets
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expandHome, ROOT, settings } from "../config.js";

const isWin = process.platform === "win32";
const CHEATS = path.resolve(ROOT, ".."); // the folder Jericho lives in (Cheats)

/**
 * pc.trusted (off by default): when enabled, its extra folders and apps are added, and commands
 * that start with one of its `commands` run without a yes. The blocked lists, secret files, the
 * kill switch and the action log apply exactly as before.
 */
export function trustedSettings() {
  const t = settings.pc?.trusted || {};
  return {
    enabled: t.enabled === true,
    folders: Array.isArray(t.folders) ? t.folders : [],
    apps: t.apps && typeof t.apps === "object" ? t.apps : {},
    commands: Array.isArray(t.commands) ? t.commands.map((c) => String(c).trim()).filter(Boolean) : [],
  };
}

export function pcSettings() {
  const pc = settings.pc || {};
  const trusted = trustedSettings();
  const folders = pc.allowedFolders || ["~/Desktop", "~/Documents", "~/Downloads", "{cheats}"];
  return {
    allowedFolders: trusted.enabled ? [...folders, ...trusted.folders] : folders,
    commandTimeoutSeconds: pc.commandTimeoutSeconds ?? 60,
    maxReadKB: pc.maxReadKB ?? 200,
    apps: trusted.enabled ? { ...(pc.apps || {}), ...trusted.apps } : pc.apps || {},
    trusted: trusted.enabled,
  };
}

/**
 * A command the trusted tier lets run without a yes: it starts with one of pc.trusted.commands
 * (a whole word boundary after it), has no chaining, redirection or substitution, and isn't blocked.
 */
export function isTrustedCommand(command) {
  const t = trustedSettings();
  const c = String(command || "").trim();
  if (!t.enabled || !c || !checkCommand(c).ok) return false;
  if (/[;&|<>`$\n]|\$\(/.test(c)) return false;
  return t.commands.some((p) => c === p || (c.startsWith(p) && /\s/.test(c[p.length])));
}

function expand(p) {
  return path.resolve(expandHome(String(p).replace("{cheats}", CHEATS)));
}

/** The allowed folders as full paths. On Windows, OneDrive copies of Desktop and Documents count too. */
export function allowedRoots() {
  const roots = new Set();
  for (const f of pcSettings().allowedFolders) {
    const full = expand(f);
    roots.add(full);
    const base = path.basename(full);
    if (isWin && ["Desktop", "Documents"].includes(base)) {
      const od = path.join(os.homedir(), "OneDrive", base);
      if (fs.existsSync(od)) roots.add(od);
    }
  }
  return [...roots].map((r) => {
    try {
      return fs.realpathSync(r);
    } catch {
      return r;
    }
  });
}

const same = (a, b) => (isWin ? a.toLowerCase() === b.toLowerCase() : a === b);
function inside(child, parent) {
  const rel = path.relative(isWin ? parent.toLowerCase() : parent, isWin ? child.toLowerCase() : child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

// Files that hold secrets: never read, listed, written, moved or deleted.
const SECRET_NAME = /^(\.env(\..*)?|.*\.pem|.*\.key|.*\.p12|.*\.pfx|.*\.kdbx|id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|\.npmrc|\.pypirc|\.netrc|\.git-credentials|credentials(\..*)?|secrets?(\..*)?|.*\.keystore|known_hosts|authorized_keys)$/i;
const SECRET_DIR = /(^|[\\/])(\.ssh|\.gnupg|\.aws|\.azure|\.kube|\.docker|\.git)([\\/]|$)/i;
/**
 * Windows path tricks that slip past name checks: alternate data streams ("notes.txt:hidden",
 * ".env::$DATA") and 8.3 short names ("ENV~1", "GIT~1"). Refused outright.
 */
export function hasWindowsPathTricks(p) {
  // the drive letter's colon is fine (also after Windows' long-path prefix \\?\)
  const s = String(p || "").replace(/^(\\\\\?\\)?[a-z]:(?=[\\/])/i, "");
  if (s.includes(":")) return true;
  return s.split(/[\\/]/).some((part) => /~\d/.test(part));
}

/** The real path: links followed on the nearest part that exists, the rest added on. */
export function realPathOf(full) {
  const real = fs.realpathSync.native || fs.realpathSync;
  const rest = [];
  let cur = full;
  for (;;) {
    try {
      const r = real(cur);
      return rest.length ? path.join(r, ...rest.reverse()) : r;
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) return full;
      rest.push(path.basename(cur));
      cur = parent;
    }
  }
}

export function isSecretPath(p) {
  return SECRET_NAME.test(path.basename(p)) || SECRET_DIR.test(p);
}

/**
 * Turns a spoken or typed path into a full path inside an allowed folder, or explains why not.
 * Accepts full paths, "~/...", and paths that start with an allowed folder's name
 * ("Desktop/notes.txt", "Documents\\report.docx", "Cheats/jericho/README.md").
 */
export function resolvePath(input, { mustExist = false } = {}) {
  const raw = String(input || "").trim().replace(/^["']|["']$/g, "");
  if (!raw) return { ok: false, reason: "No path given." };
  if (/\0/.test(raw)) return { ok: false, reason: "That path isn't valid." };
  if (isWin && hasWindowsPathTricks(raw)) return { ok: false, reason: "That path isn't valid." };
  const roots = allowedRoots();
  let full;
  if (path.isAbsolute(raw) || /^[a-z]:[\\/]/i.test(raw) || raw.startsWith("~")) {
    full = path.resolve(expandHome(raw));
  } else {
    const first = raw.split(/[\\/]/)[0];
    const root = roots.find((r) => same(path.basename(r), first));
    if (!root) {
      return { ok: false, reason: `Say which folder it's in: ${roots.map((r) => path.basename(r)).join(", ")}.` };
    }
    full = path.resolve(root, raw.split(/[\\/]/).slice(1).join(path.sep));
  }
  // Follow links, so a shortcut can't lead outside the allowed folders, even through folders
  // that don't exist yet ("Desktop/link/newdir/x.txt" where "link" points elsewhere).
  const real = realPathOf(full);
  if (isWin && hasWindowsPathTricks(real)) return { ok: false, reason: "That path isn't valid." };
  if (!roots.some((r) => inside(real, r))) {
    return { ok: false, reason: `That's outside the folders I'm allowed to use (${roots.map((r) => path.basename(r)).join(", ")}).` };
  }
  if (isSecretPath(real)) return { ok: false, reason: "That file can hold secrets, so I won't touch it." };
  if (mustExist && !fs.existsSync(real)) return { ok: false, reason: `I can't find ${path.basename(real)}.` };
  return { ok: true, path: real, display: friendly(real, roots) };
}

/** "Documents\\notes.txt" instead of the full path, for reading back. */
export function friendly(p, roots = allowedRoots()) {
  const root = roots.find((r) => inside(p, r));
  return root ? path.join(path.basename(root), path.relative(root, p)) || path.basename(root) : p;
}

// Apps that could change the system or run arbitrary code: never opened by voice.
const BLOCKED_APPS = /^(powershell|pwsh|cmd|command|wscript|cscript|mshta|rundll32|regedit|regedt32|reg|bcdedit|diskpart|format|netsh|sc|schtasks|gpedit(\.msc)?|secpol(\.msc)?|services(\.msc)?|compmgmt(\.msc)?|mmc|msconfig|taskschd(\.msc)?|wf(\.msc)?|lusrmgr(\.msc)?|control|ms-settings.*|windowsdefender.*|sudo|bash|sh|wsl|cmstp|certutil|bitsadmin|msiexec|installutil|regsvr32|vssadmin|wmic)(\.exe)?$/i;
export function checkApp(name) {
  const n = String(name || "").trim();
  if (!n) return { ok: false, reason: "Which app?" };
  const mapped = pcSettings().apps[n.toLowerCase()]; // your own names from settings.json
  if (!mapped && !/^[\w .+-]{1,60}$/.test(n)) return { ok: false, reason: "Just tell me the app's name." };
  const target = mapped || n;
  if (BLOCKED_APPS.test(n) || BLOCKED_APPS.test(path.basename(String(target)))) {
    return { ok: false, reason: "I don't open system tools, shells or settings apps by voice." };
  }
  return { ok: true, target };
}

export function checkUrl(url) {
  let u;
  try {
    u = new URL(String(url).trim());
  } catch {
    return { ok: false, reason: "That isn't a web address." };
  }
  if (!["http:", "https:"].includes(u.protocol)) return { ok: false, reason: "I only open http and https links." };
  if (u.username || u.password) return { ok: false, reason: "I won't open links with passwords in them." };
  return { ok: true, url: u.toString() };
}

// Commands that change the system, the registry or security settings, or read secrets: blocked.
const BLOCKED_COMMANDS = [
  /\breg(\.exe)?\s+(add|delete|import|load|restore|copy|save)\b/i,
  /\b(HKLM|HKCU|HKCR|HKU|HKCC|HKEY_[A-Z_]+|Registry::)/i,
  /\b(Set|New|Remove|Rename|Clear)-ItemProperty\b/i,
  /\b(bcdedit|diskpart|format(\.com)?|vssadmin|cipher\s+\/w|takeown|icacls|cacls|attrib\s+\+s)\b/i,
  /\b(Set-MpPreference|Add-MpPreference|Remove-MpPreference|Set-NetFirewall\w*|New-NetFirewall\w*|Disable-\w+|Enable-\w+|Set-ExecutionPolicy|Set-Service|Stop-Service|New-Service|Remove-Service|Set-LocalUser|New-LocalUser|Add-LocalGroupMember|Remove-LocalUser)\b/i,
  /\b(netsh|sc(\.exe)?\s+(config|delete|create|stop)|schtasks\s*\/(create|change|delete)|net\s+(user|localgroup|share|accounts)|gpupdate|secedit|auditpol|wevtutil\s+cl|shutdown|restart-computer|stop-computer|logoff)\b/i,
  /\b(Uninstall-|Install-WindowsFeature|Enable-WindowsOptionalFeature|dism|sfc|wusa|msiexec)\b/i,
  /(C:\\Windows|C:\\Program Files|\\System32|\/etc\/|\/usr\/|\/System\/)/i,
  /\b(iex|Invoke-Expression)\b|\|\s*(iex|sh|bash|cmd)\b|(curl|wget|iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b[^|]*\|/i,
  /\b(rm|del|erase|rmdir|rd|Remove-Item)\b[^\n]*(-Recurse|\/s\b|-rf\b|-fr\b)/i,
  /(^|[\\/\s"'])\.env\b|id_rsa|\.ssh|\.aws|\.git-credentials|credentials\.json|\.kdbx|\.pem\b/i,
  /\b(Get-Clipboard|ConvertFrom-SecureString|Get-Credential|cmdkey|vaultcmd|mimikatz|lsass|SAM\b|SECURITY\b)/i,
  /\bsudo\b|\bsu\s|chmod\s+777|chown\b/i,
];
export function checkCommand(command) {
  const c = String(command || "").trim();
  if (!c) return { ok: false, reason: "Which command?" };
  if (c.length > 500) return { ok: false, reason: "That command is too long to read back safely." };
  for (const re of BLOCKED_COMMANDS) {
    if (re.test(c)) return { ok: false, reason: "That command would change system, registry or security settings, delete folders, or touch secrets, so it's blocked." };
  }
  return { ok: true, command: c };
}
