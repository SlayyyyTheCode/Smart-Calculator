import zlib from "node:zlib";

import { beforeAll, describe, expect, it } from "vitest";

import { buildPdf } from "@/lib/export/pdf";
import { EXPORT_FIXTURE } from "@/test/export-fixture";

/**
 * The report is rendered for real and its text read back out, so these check
 * the document a user opens rather than the code that meant to produce it.
 *
 * Reading the text means inflating the content streams and decoding the hex
 * strings inside the TJ operators, which is how pdfkit writes text.
 */
function extractText(pdf: Buffer): string {
  const latin = pdf.toString("latin1");
  const lines: string[] = [];
  const streamStart = /stream\r?\n/g;
  let match: RegExpExecArray | null;

  while ((match = streamStart.exec(latin))) {
    const start = match.index + match[0].length;
    const end = latin.indexOf("endstream", start);
    if (end < 0) continue;

    let contents: string | null = null;
    // The stream may or may not have a trailing newline before `endstream`.
    for (const trim of [0, 1, 2]) {
      try {
        contents = zlib.inflateSync(pdf.subarray(start, end - trim)).toString("latin1");
        break;
      } catch {
        contents = null;
      }
    }
    if (!contents) continue;

    for (const block of contents.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
      let line = "";
      for (const piece of block[1].matchAll(/<([0-9a-fA-F\s]*)>|\(((?:[^()\\]|\\.)*)\)/g)) {
        if (piece[1] !== undefined) {
          const hex = piece[1].replace(/\s+/g, "");
          for (let i = 0; i + 1 < hex.length; i += 2) {
            line += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
          }
        } else {
          line += piece[2].replace(/\\(.)/g, "$1");
        }
      }
      if (line.trim()) lines.push(line);
    }
  }

  return lines.join("\n");
}

function countPages(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

describe("buildPdf", () => {
  let pdf: Buffer;
  let text: string;

  beforeAll(async () => {
    pdf = await buildPdf(EXPORT_FIXTURE);
    text = extractText(pdf);
  });

  it("renders a valid PDF", () => {
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.subarray(-6).toString("latin1")).toContain("%%EOF");
  });

  it("puts each month on its own page", () => {
    expect(countPages(pdf)).toBe(2);
    expect(text).toContain("January 2026");
    expect(text).toContain("February 2026");
  });

  it("renders a single-month range without a page break", async () => {
    const single = await buildPdf({
      ...EXPORT_FIXTURE,
      to: "2026-01-01",
      months: EXPORT_FIXTURE.months.slice(0, 1),
    });
    expect(countPages(single)).toBe(1);
  });

  it("carries the headline figures", () => {
    expect(text).toContain("$3,415.00");
    expect(text).toContain("$6,120.00");
    expect(text).toContain("44%");
  });

  it("states budget status in words, so it survives a greyscale print", () => {
    expect(text).toContain("Exceeded");
    expect(text).toContain("Close to limit");
    expect(text).toContain("On track");
  });

  it("lists drafts and says they are excluded", () => {
    expect(text).toContain("Draft");
    expect(text).toContain("excluded from every total");
  });

  it("never splits a word across lines with a hyphen", () => {
    // react-pdf hyphenates by default, which turned "passive" into "pas-sive".
    expect(/[a-z]-\n[a-z]/.test(text)).toBe(false);
  });

  it("has no stray space before a percent sign", () => {
    // Adjacent JSX text children lay out separately and rendered as "138 %".
    expect(/ %/.test(text)).toBe(false);
  });
});
