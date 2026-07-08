// Unit tests for the document drag-to-upload engine (ui/doc-drag.js) — the two testable, DOM-only
// pieces: setting a real File on an <input type=file>, and finding the file input under a drop
// point (including one hidden behind a styled "dropzone"). The pointer-drag interaction itself is
// exercised in a real browser, not jsdom.
import { describe, it, expect, beforeEach } from "vitest";

import docDrag from "./doc-drag.js";

beforeEach(() => {
  document.body.innerHTML = "";
});

function fileInput(attrs = {}) {
  const el = document.createElement("input");
  el.type = "file";
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

describe("setFileOnInput", () => {
  it("sets the File and fires input+change in a browser; fails safely where files is read-only", () => {
    const input = fileInput();
    document.body.append(input);
    const events = [];
    input.addEventListener("input", () => events.push("input"));
    input.addEventListener("change", () => events.push("change"));

    const file = new File(["résumé bytes"], "Resume.pdf", { type: "application/pdf" });
    const ok = docDrag.setFileOnInput(input, file);

    if (ok) {
      // Chrome path: input.files = DataTransfer.files is supported.
      expect(input.files[0].name).toBe("Resume.pdf");
      expect(input.files[0].type).toBe("application/pdf");
      expect(events).toEqual(["input", "change"]);
    } else {
      // jsdom's file input has a read-only files list — the real assignment is verified in-browser.
      // The engine must at least degrade to a safe no-op rather than throw.
      expect(input.files).toHaveLength(0);
    }
  });

  it("returns false for a missing file or input", () => {
    expect(docDrag.setFileOnInput(null, new File(["x"], "a.txt"))).toBe(false);
    expect(docDrag.setFileOnInput(fileInput(), null)).toBe(false);
  });
});

describe("fileInputAt", () => {
  it("finds the input directly under the point", () => {
    const input = fileInput();
    document.body.append(input);
    document.elementFromPoint = () => input; // jsdom has no layout engine
    expect(docDrag.fileInputAt(10, 10)).toBe(input);
  });

  it("finds a hidden input nested in the styled dropzone under the point", () => {
    // Lever/Wellfound pattern: a visible dropzone/button wraps a 0×0 hidden file input.
    const zone = document.createElement("div");
    const label = document.createElement("span");
    label.textContent = "Drag to upload your resume, or browse";
    const hidden = fileInput({ style: "display:none" });
    zone.append(label, hidden);
    document.body.append(zone);
    document.elementFromPoint = () => label; // cursor over the caption

    expect(docDrag.fileInputAt(5, 5)).toBe(hidden);
  });

  it("resolves a label[for] to its file input", () => {
    const input = fileInput();
    input.id = "resume";
    const label = document.createElement("label");
    label.setAttribute("for", "resume");
    label.textContent = "Attach";
    document.body.append(label, input);
    document.elementFromPoint = () => label;

    expect(docDrag.fileInputAt(5, 5)).toBe(input);
  });

  it("returns null when nothing file-like is under the point", () => {
    const div = document.createElement("div");
    div.textContent = "just text";
    document.body.append(div);
    document.elementFromPoint = () => div;
    expect(docDrag.fileInputAt(5, 5)).toBeNull();
  });
});
