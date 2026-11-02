// Renders scripts/icon/icon.html to the PWA icon set in public/.
//   node scripts/icon/make-icons.cjs   (needs Playwright + Chromium)
const path = require("node:path");
const { chromium } = require("playwright");

const OUT = path.resolve(__dirname, "../../public");
const PAGE = `file://${path.resolve(__dirname, "icon.html")}`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
  const shot = async (safe, file, size) => {
    await page.goto(`${PAGE}?safe=${safe}`);
    await page.waitForFunction(() => window.__done === true);
    await page.setViewportSize({ width: 1024, height: 1024 });
    const buf = await page.locator("#c").screenshot({ type: "png" });
    // downscale through a canvas for smooth resampling
    const data = await page.evaluate(
      async ({ b64, size }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const cv = document.createElement("canvas");
        cv.width = cv.height = size;
        const ctx = cv.getContext("2d");
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, size, size);
        return cv.toDataURL("image/png").split(",")[1];
      },
      { b64: buf.toString("base64"), size },
    );
    require("node:fs").writeFileSync(path.join(OUT, file), Buffer.from(data, "base64"));
    console.log("wrote", file, size);
  };
  await shot(1, "icon-512.png", 512);
  await shot(1, "icon-192.png", 192);
  await shot(1, "apple-touch-icon.png", 180);
  await shot(0.78, "icon-maskable.png", 512); // content inside Android's safe circle
  await browser.close();
})();
