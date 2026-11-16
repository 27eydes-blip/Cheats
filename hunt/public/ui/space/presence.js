// The lobby's side of the live feed (src/space-feed.js): "I am online" pings while the page is
// visible, and the shared ticker feed (cached for 15 s, one request at a time).
//   startPresence(() => token) -> stop()          fetchFeed() -> feed | null
const PING_MS = 60_000, FEED_MS = 15_000;
export function startPresence(getToken, { every = PING_MS, fetcher = (...a) => fetch(...a), onOnline = null } = {}) {
  let timer = 0, stopped = false;
  const ping = () => {
    const tok = getToken && getToken();
    if (stopped || document.hidden || !tok) return;
    fetcher('/api/space/ping', { method: 'POST', headers: { authorization: 'Bearer ' + tok } })
      .then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && Number.isFinite(j.online) && onOnline) onOnline(j.online); }).catch(() => {});
  };
  const vis = () => { if (!document.hidden) ping(); };
  ping();
  timer = setInterval(ping, every);
  document.addEventListener('visibilitychange', vis);
  return () => { stopped = true; clearInterval(timer); document.removeEventListener('visibilitychange', vis); };
}
let feed = null, feedAt = 0, inflight = null;
export function fetchFeed({ fetcher = (...a) => fetch(...a), now = Date.now() } = {}) {
  if (feed && now - feedAt < FEED_MS) return Promise.resolve(feed);
  if (inflight) return inflight;
  inflight = fetcher('/api/space/feed').then((r) => (r.ok ? r.json() : null)).then((f) => { if (f) { feed = f; feedAt = Date.now(); } return f || feed; })
    .catch(() => feed).finally(() => { inflight = null; });
  return inflight;
}
