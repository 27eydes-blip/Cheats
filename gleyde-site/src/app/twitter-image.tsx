// The Twitter/X card reuses the Open Graph image.
export { default, alt, size, contentType } from "./opengraph-image";

// Route segment config can't be re-exported, so it is declared here too.
export const dynamic = "force-static";
