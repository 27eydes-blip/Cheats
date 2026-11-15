// Build id shared by the client and the server. 'dev' in the repo; a deploy stamps the real id
// (scripts/stamp-version.mjs), so an open tab can tell when the server has moved on.
export const VERSION = 'dev';
