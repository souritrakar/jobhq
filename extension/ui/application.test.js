// Unit tests for the live-mirror renderer (ui/application.js#renderLive). The mirror shows
// SELECTION fields (select/combobox/radio/multi_select/checkbox) as a read-only "selected value"
// display — the page owns the widget + its options — while free-text fields stay editable.
// See docs/superpowers/specs/2026-07-05-application-sync-fixes-design.md (part A).
import { describe, it, expect, beforeEach } from "vitest";

import "../lib/field-adapters.js";
import "./application.js";

const AF = () => globalThis.JobTracker.ui.applicationForm;

function renderOne(question, answer, handlers = {}) {
  const { node, updateAnswer } = AF().renderLive(
    [{ key: "k1", question, answer, onPage: true }],
    handlers,
  );
  document.body.replaceChildren(node);
  const field = node.querySelector(".appfield");
  return { field, updateAnswer };
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("renderLive — selection fields are display-only", () => {
  it("renders a <select>-type question as a value display, not a dropdown", () => {
    const q = { label: "Phone country code", type: "select", options: ["Canada (+1)", "US (+1)"] };
    const { field } = renderOne(q, "Canada (+1)");
    expect(field.querySelector("select")).toBeNull();
    expect(field.querySelector(".appvalue")).not.toBeNull();
    expect(field.querySelector(".appvalue-chip").textContent).toBe("Canada (+1)");
  });

  it("renders a combobox (type select, no options in the DOM) as a value display — no stray text input", () => {
    const q = { label: "City", type: "select" }; // combobox → no harvestable options
    const { field } = renderOne(q, "Waterloo");
    expect(field.querySelector("input")).toBeNull();
    expect(field.querySelector(".appvalue-chip").textContent).toBe("Waterloo");
  });

  it("shows one chip per value for a multi-select, and a muted hint when empty", () => {
    const q = { label: "Skills", type: "multi_select", options: ["Go", "Rust", "TS"] };
    const { field, updateAnswer } = renderOne(q, ["Go", "TS"]);
    expect(field.querySelectorAll(".appvalue-chip")).toHaveLength(2);

    updateAnswer("k1", []);
    expect(field.querySelectorAll(".appvalue-chip")).toHaveLength(0);
    expect(field.querySelector(".appvalue").classList.contains("empty")).toBe(true);
  });

  it("live-updates the displayed value via updateAnswer without re-rendering", () => {
    const q = { label: "Seniority", type: "radio", options: ["Junior", "Senior"] };
    const { field, updateAnswer } = renderOne(q, "Junior");
    expect(field.querySelector(".appvalue-chip").textContent).toBe("Junior");
    updateAnswer("k1", "Senior");
    expect(field.querySelector(".appvalue-chip").textContent).toBe("Senior");
  });
});

describe("renderLive — free-text fields stay editable", () => {
  it("renders short_text as an editable input that reports edits", () => {
    const edits = [];
    const q = { label: "First name", type: "short_text" };
    const { field } = renderOne(q, "Ada", { onEdit: (k, v) => edits.push([k, v]) });
    const input = field.querySelector("input");
    expect(input).not.toBeNull();
    expect(input.value).toBe("Ada");
    input.value = "Grace";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(edits[edits.length - 1]).toEqual(["k1", "Grace"]);
  });

  it("renders long_text as an editable textarea", () => {
    const q = { label: "Why us?", type: "long_text" };
    const { field } = renderOne(q, "because");
    expect(field.querySelector("textarea")).not.toBeNull();
    expect(field.querySelector("textarea").value).toBe("because");
  });
});
