// Where the game is running. In the App Store app (Capacitor on iPhone/iPad) it must feel like
// a native app: no browser install prompts, no web-only notices, store purchases through Apple.
export function isNativeApp() {
  const cap = typeof window !== "undefined" ? window.Capacitor : null;
  return !!cap?.isNativePlatform?.();
}

export function isIOSApp() {
  const cap = typeof window !== "undefined" ? window.Capacitor : null;
  return isNativeApp() && cap.getPlatform?.() === "ios";
}

/**
 * Open one of the game's web pages (privacy policy, support) outside the game: a new tab on the
 * web, Safari in the App Store app (never inside the game's own view).
 */
export function openSite(page) {
  const url = `https://glydrift.com/${page}`;
  try {
    window.open(url, "_blank", "noopener");
  } catch {
    // nothing more to do: the address is also listed on the App Store page
  }
}
