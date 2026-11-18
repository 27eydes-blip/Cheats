// Writes dist/_headers: the security headers Cloudflare Pages sends with every response.
// Run after dist/index.html is final (the deploy fills in the server address first), because the
// Content Security Policy allows the page's one inline <script> and one inline <style> by their
// exact SHA-256 hashes instead of 'unsafe-inline'.
//
//   node scripts/build-headers.mjs dist
// Environment: SB_URL       the Supabase project URL (allowed in connect-src), optional
//              CSP_ENFORCE  "1" sends the enforcing Content-Security-Policy; anything else sends
//                           Content-Security-Policy-Report-Only (violations are only reported)
//              HSTS_SUBDOMAINS  "1" adds includeSubDomains to HSTS (only once no subdomain uses plain HTTP)
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const dir = process.argv[2] || 'dist';
const html = readFileSync(join(dir, 'index.html'), 'utf8');
const hashes = tag => [...html.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g'))]
  .filter(m => !/\ssrc=/.test(m[0].slice(0, m[0].indexOf('>'))))
  .map(m => `'sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}'`);
const scripts = hashes('script'), styles = hashes('style');
if (scripts.length !== 1 || styles.length !== 1) throw new Error(`expected 1 inline script and 1 inline style, found ${scripts.length} and ${styles.length}`);
if (/\sstyle="/.test(html)) throw new Error('inline style="" attributes are not allowed by the CSP: use a class');

const sb = (process.env.SB_URL || '').trim();
if (sb && !/^https:\/\/[A-Za-z0-9.-]+$/.test(sb)) throw new Error('SB_URL must look like https://xxxx.supabase.co');
const csp = [
  "default-src 'self'",
  `script-src 'self' ${scripts.join(' ')}`,
  `style-src 'self' ${styles.join(' ')} https://fonts.googleapis.com`, // the game's own CSS + the Google Fonts stylesheet
  "font-src https://fonts.gstatic.com",                                // Orbitron, Rajdhani, Silkscreen
  "img-src 'self' data:",                                              // the icons, plus character previews drawn on a canvas
  `connect-src 'self'${sb ? ' ' + sb : ''}`,                           // the leaderboard / accounts server (Supabase), if set up
  "media-src 'none'",                                                  // all sound is synthesized with Web Audio
  "worker-src 'none'",
  "manifest-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');
const enforce = process.env.CSP_ENFORCE === '1';
const headers = [
  `Strict-Transport-Security: max-age=31536000${process.env.HSTS_SUBDOMAINS === '1' ? '; includeSubDomains' : ''}`, // never preload
  `${enforce ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only'}: ${csp}`,
  'X-Frame-Options: DENY',
  'Permissions-Policy: camera=(), microphone=(), geolocation=()',
  'X-Content-Type-Options: nosniff',
  'Referrer-Policy: strict-origin-when-cross-origin',
];
writeFileSync(join(dir, '_headers'), '/*\n' + headers.map(h => '  ' + h).join('\n') + '\n');
console.log(`wrote ${join(dir, '_headers')} (${enforce ? 'enforcing' : 'report-only'} CSP${sb ? ', connect-src ' + sb : ', no server'})`);
