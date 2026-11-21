/**
 * Run one news ingest now and print the result.
 *   npm run news:ingest            (only feeds that are due)
 *   npm run news:ingest -- --all   (every active feed)
 * Useful as a Railway cron service if you set NEWS_INGEST=off on the web service.
 */
import { runIngest } from "../src/lib/newsroom/ingest";
import { registerNewsAlerts } from "../src/lib/push/news-alerts";

registerNewsAlerts();

runIngest({ trigger: "cli", force: process.argv.includes("--all") })
  .then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
