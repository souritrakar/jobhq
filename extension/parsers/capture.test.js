// Capture v2 integration — jsdom. Verifies the live-control ↔ clone-control ORDER linkage
// (the mechanism that lets field blocks carry harvested q<N> ids across the cleanDom clone)
// and the settle gate's timing behaviour.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import "./clean-dom.js";
import "./block-capture.js";
import scope from "./capture.js";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("scopePage with harvest linkage", () => {
  it("stamps harvested ids into field blocks, one per group, legacy marker otherwise", () => {
    document.body.innerHTML = `
      <h1>Intern</h1>
      <input type="search" placeholder="Search jobs">
      <label>Full name</label><input type="text" id="nm">
      <fieldset><legend>Authorized?</legend>
        <input type="radio" name="auth" value="Yes"><input type="radio" name="auth" value="No">
      </fieldset>
    `;
    const nm = document.getElementById("nm");
    const radios = Array.from(document.querySelectorAll('input[name="auth"]'));
    const controlIds = new WeakMap();
    controlIds.set(nm, "q1");
    radios.forEach((r) => controlIds.set(r, "q2"));
    const harvest = {
      controlIds,
      fields: [
        { id: "q1", label: "Full name", kind: "text", required: false },
        { id: "q2", label: "Authorized?", kind: "radio", options: ["Yes", "No"] },
      ],
    };
    const scoped = scope.scopePage({ harvest });
    const fieldBlocks = scoped.blocks.filter((b) => b.kind === "field");
    expect(fieldBlocks.map((b) => b.text)).toEqual([
      "[search: Search jobs]", // un-harvested → legacy marker
      '[field q1: text "Full name"]',
      '[field q2: single choice "Authorized?" — options: Yes | No]', // ONE block for the group
    ]);
    expect(scoped.fields).toEqual(harvest.fields);
    // legacy strings still derived
    expect(scoped.fullText).toContain("# Intern");
  });

  it("works with no harvest (legacy markers everywhere)", () => {
    document.body.innerHTML = `<textarea placeholder="Cover letter"></textarea>`;
    const scoped = scope.scopePage();
    expect(scoped.blocks.some((b) => b.text === "[long text: Cover letter]")).toBe(true);
    expect(scoped.fields).toEqual([]);
  });
});

describe("settle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resolves after quietMs when the DOM is quiet", async () => {
    const p = scope.settle({ quietMs: 300, maxMs: 2500 });
    let settled = false;
    p.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(299);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(settled).toBe(true);
  });

  it("caps at maxMs under continuous mutations", async () => {
    const p = scope.settle({ quietMs: 300, maxMs: 1000 });
    let settled = false;
    p.then(() => (settled = true));
    const churn = setInterval(() => {
      document.body.append(document.createElement("i"));
    }, 100);
    await vi.advanceTimersByTimeAsync(999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(settled).toBe(true);
    clearInterval(churn);
  });
});
