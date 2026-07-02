// Block emitter tests — jsdom. The emitter walks an (already cleaned) DOM subtree and
// produces ordered, typed blocks. No visibility checks here (that's the harvester's job),
// so plain jsdom nodes work.
import { describe, it, expect } from "vitest";

import blocks from "./block-capture.js";

const { emitBlocks, legacyMarker, renderFieldMarker, isControl, BLOCK_TEXT_MAX } = blocks;

function domOf(html) {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
}

describe("emitBlocks", () => {
  it("emits heading, para, li and row blocks with sequential indices", () => {
    const root = domOf(`
      <h1>Senior <span>Data</span> Scientist</h1>
      <p>We are hiring.</p>
      <ul><li>Remote</li><li>Full-time</li></ul>
      <table><tr><th>Salary</th><td>$150k</td></tr></table>
    `);
    const out = emitBlocks(root);
    expect(out.map((b) => [b.kind, b.text])).toEqual([
      ["heading", "# Senior Data Scientist"],
      ["para", "We are hiring."],
      ["li", "- Remote"],
      ["li", "- Full-time"],
      ["row", "Salary | $150k"],
    ]);
    expect(out.map((b) => b.i)).toEqual([0, 1, 2, 3, 4]);
  });

  it("separates table cells (no SalaryLocation garbling)", () => {
    const root = domOf(
      "<table><tr><th>Salary</th><th>Location</th></tr><tr><td>$150k</td><td>Remote</td></tr></table>",
    );
    const out = emitBlocks(root);
    expect(out.map((b) => b.text)).toEqual(["Salary | Location", "$150k | Remote"]);
    expect(out.every((b) => b.kind === "row")).toBe(true);
  });

  it("emits field blocks for flow-level controls via markerFor and suppresses empty markers", () => {
    const root = domOf(`
      <label>Country</label>
      <select><option value="">Select…</option><option>USA</option><option>Canada</option></select>
      <input type="hidden" value="token">
    `);
    const seen = [];
    const out = emitBlocks(root, {
      markerFor: (el) => {
        seen.push(el.tagName);
        return el.tagName === "SELECT" ? '[field q1: dropdown "Country"]' : "";
      },
    });
    // hidden input consulted (counter parity) but suppressed (empty marker → no block)
    expect(seen).toEqual(["SELECT", "INPUT"]);
    expect(out.map((b) => [b.kind, b.text])).toEqual([
      ["para", "Country"],
      ["field", '[field q1: dropdown "Country"]'],
    ]);
  });

  it("keeps nested list structure as sibling li blocks", () => {
    const root = domOf(
      "<ul><li>Benefits<ul><li>Health</li><li>Dental</li></ul></li></ul>",
    );
    expect(emitBlocks(root).map((b) => b.text)).toEqual(["- Benefits", "- Health", "- Dental"]);
  });

  it("renders controls inside table cells inline through markerFor", () => {
    const root = domOf(
      "<table><tr><td>Phone</td><td><input type='tel'></td></tr></table>",
    );
    const out = emitBlocks(root, { markerFor: () => "[field q9: tel]" });
    expect(out).toEqual([{ i: 0, kind: "row", text: "Phone | [field q9: tel]" }]);
  });

  it("splits an oversized block into continuation blocks of the same kind", () => {
    const root = domOf(`<p>${"word ".repeat(1000)}</p>`); // ~5000 chars
    const out = emitBlocks(root);
    expect(out.length).toBeGreaterThan(1);
    expect(out.every((b) => b.kind === "para" && b.text.length <= BLOCK_TEXT_MAX)).toBe(true);
  });

  it("flushes paragraph text around block boundaries and drops empty blocks", () => {
    const root = domOf("<div>Intro <span>text</span><h2>Reqs</h2>tail</div>");
    expect(emitBlocks(root).map((b) => [b.kind, b.text])).toEqual([
      ["para", "Intro text"],
      ["heading", "## Reqs"],
      ["para", "tail"],
    ]);
  });
});

describe("legacyMarker", () => {
  it("keeps the old typed markers", () => {
    const sel = domOf(
      "<select><option>USA</option><option>Canada</option></select>",
    ).firstElementChild;
    expect(legacyMarker(sel)).toBe("[dropdown: USA | Canada]");
    const email = domOf('<input type="email" placeholder="you@x.com">').firstElementChild;
    expect(legacyMarker(email)).toBe("[email: you@x.com]");
    const hidden = domOf('<input type="hidden">').firstElementChild;
    expect(legacyMarker(hidden)).toBe("");
  });
});

describe("renderFieldMarker", () => {
  it("renders id, kind, label, required, options and placeholder", () => {
    expect(
      renderFieldMarker({
        id: "q7",
        label: "Country",
        kind: "select",
        options: ["United States", "Canada"],
        required: true,
      }),
    ).toBe('[field q7: dropdown "Country" (required) — options: United States | Canada]');
    expect(renderFieldMarker({ id: "q2", label: "Email", kind: "text", inputType: "email" })).toBe(
      '[field q2: email "Email"]',
    );
  });
});

describe("isControl", () => {
  it("matches inputs, textareas, selects and contenteditable", () => {
    expect(isControl(domOf("<input>").firstElementChild)).toBe(true);
    expect(isControl(domOf("<div contenteditable='true'></div>").firstElementChild)).toBe(true);
    expect(isControl(domOf("<div></div>").firstElementChild)).toBe(false);
  });
});
