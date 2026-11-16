// Space lobby fonts: a squared techno face for titles and a narrow sans for details. Loaded on the
// side (never blocking paint or the game) with display=swap; space.css lists system fallbacks.
export const SPACE_FONTS_URL = 'https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;700&family=Barlow+Semi+Condensed:wght@500;600;700&display=swap';
export function loadSpaceFonts(doc = document) {
  if (doc.querySelector('link[data-space-fonts]')) return;
  const l = doc.createElement('link');
  l.rel = 'stylesheet'; l.href = SPACE_FONTS_URL; l.media = 'print'; l.dataset.spaceFonts = '1';
  l.onload = () => { l.media = 'all'; };
  doc.head.appendChild(l);
}
