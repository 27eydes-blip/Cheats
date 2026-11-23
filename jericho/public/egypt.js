// Look only: if the hieroglyph font can't load, switch the glyphs to thin gold SVG line icons
// (egypt.css draws them). Nothing else on the page depends on this file.
const FAMILY = '"Noto Sans Egyptian Hieroglyphs"';
const SAMPLE = "\u{132F9}\u{13080}"; // ankh, eye

function useIcons() {
  document.documentElement.classList.add("no-glyph-font");
}

if (!document.fonts?.load) useIcons();
else {
  // If it hasn't loaded after 4 seconds, use the icons (the font is local, so this is rare).
  const timer = setTimeout(useIcons, 4000);
  document.fonts
    .load(`16px ${FAMILY}`, SAMPLE)
    .then((faces) => {
      clearTimeout(timer);
      if (!faces.length) useIcons();
      else document.documentElement.classList.remove("no-glyph-font");
    })
    .catch(() => {
      clearTimeout(timer);
      useIcons();
    });
}
