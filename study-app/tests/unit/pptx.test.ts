import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { pptxToSlides } from "@/lib/ingest/pptx";

const slide = (texts: string[]) =>
  `<p:sld><p:cSld><p:spTree>${texts.map((t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`).join("")}</p:spTree></p:cSld></p:sld>`;

describe("pptx import", () => {
  it("extracts slide text and speaker notes in order", async () => {
    const zip = new JSZip();
    zip.file("ppt/slides/slide10.xml", slide(["Last"]));
    zip.file("ppt/slides/slide2.xml", slide(["Photosynthesis", "Light &amp; dark reactions"]));
    zip.file("ppt/slides/slide1.xml", slide(["Intro"]));
    zip.file("ppt/notesSlides/notesSlide2.xml", slide(["Remember chlorophyll", "2"]));
    const buf = await zip.generateAsync({ type: "arraybuffer" });
    const slides = await pptxToSlides(buf);
    expect(slides).toEqual(["Intro", "Photosynthesis\nLight & dark reactions\nSpeaker notes:\nRemember chlorophyll", "Last"]);
  });
});
