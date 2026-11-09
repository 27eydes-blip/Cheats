/**
 * Pulls the text out of a PowerPoint (.pptx) file, one entry per slide, in
 * slide order. Speaker notes are included because they often hold the
 * explanation. (Keynote and Google Slides users can export to PDF instead.)
 */
export async function pptxToSlides(data: ArrayBuffer): Promise<string[]> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(data);
  const slideNames = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]));
  const slides: string[] = [];
  for (const name of slideNames) {
    const xml = await zip.file(name)!.async("string");
    const num = name.match(/(\d+)\.xml$/)![1];
    const notesXml = await zip.file(`ppt/notesSlides/notesSlide${num}.xml`)?.async("string");
    const body = xmlParagraphs(xml);
    const notes = notesXml ? xmlParagraphs(notesXml).filter((l) => !/^\d+$/.test(l)) : [];
    slides.push([body.join("\n"), notes.length ? `\nSpeaker notes:\n${notes.join("\n")}` : ""].join("").trim());
  }
  return slides;
}

function decode(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Text of each <a:p> paragraph (runs joined). */
export function xmlParagraphs(xml: string): string[] {
  const out: string[] = [];
  for (const p of xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)) {
    const text = [...p[1].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => decode(m[1])).join("");
    if (text.trim()) out.push(text.trim());
  }
  return out;
}
