// Pure pick→question mapping — the deterministic replacement for the LLM's classification.
import { describe, it, expect } from "vitest";

import mapper from "./question-mapper.js";

const { toQuestion, keyOf, mergePicked, isConsentNoise } = mapper;

describe("toQuestion type matrix", () => {
  const t = (field) => toQuestion(field)?.type;
  it("maps every DOM kind", () => {
    expect(t({ label: "Country", kind: "select", options: ["US"] })).toBe("select");
    expect(t({ label: "Skills", kind: "select", options: ["Go"], multiple: true })).toBe("multi_select");
    expect(t({ label: "Authorized?", kind: "radio", options: ["Yes", "No"] })).toBe("radio");
    expect(t({ label: "Locations", kind: "checkbox", options: ["Remote", "Hybrid"] })).toBe("checkbox");
    expect(t({ label: "Why us?", kind: "textarea" })).toBe("long_text");
    expect(t({ label: "Pitch", kind: "contenteditable" })).toBe("long_text");
    expect(t({ label: "Resume", kind: "file" })).toBe("file");
    expect(t({ label: "Role", kind: "combobox" })).toBe("select");
    expect(t({ label: "Name", kind: "text" })).toBe("short_text");
  });
  it("native input types win on text kind", () => {
    expect(t({ label: "Email", kind: "text", inputType: "email" })).toBe("email");
    expect(t({ label: "Phone", kind: "text", inputType: "tel" })).toBe("tel");
    expect(t({ label: "Site", kind: "text", inputType: "url" })).toBe("url");
    expect(t({ label: "Years", kind: "text", inputType: "number" })).toBe("number");
    expect(t({ label: "Start", kind: "text", inputType: "date" })).toBe("date");
  });
});

describe("toQuestion shape", () => {
  it("carries label/required/placeholder/options verbatim (normalized whitespace)", () => {
    const q = toQuestion({
      label: "  Country of  residence ",
      kind: "select",
      options: ["United States", " Canada "],
      required: true,
      placeholder: "Select…",
    });
    expect(q).toEqual({
      label: "Country of residence",
      type: "select",
      required: true,
      placeholder: "Select…",
      options: ["United States", "Canada"],
    });
  });
  it("omits options for free-entry types", () => {
    const q = toQuestion({ label: "Name", kind: "text", options: ["junk"] });
    expect(q.options).toBeUndefined();
  });
  it("returns null for unlabeled fields and consent checkboxes", () => {
    expect(toQuestion({ label: "  ", kind: "text" })).toBeNull();
    expect(toQuestion({ label: "I agree to the privacy policy", kind: "checkbox" })).toBeNull();
    // consent wording on a RADIO survives (checkbox-only filter)
    expect(toQuestion({ label: "Do you consent to a background check?", kind: "radio", options: ["Yes", "No"] })).not.toBeNull();
  });
});

describe("keyOf", () => {
  it("is case/whitespace-insensitive over label+type+options", () => {
    const a = toQuestion({ label: "Full  Name", kind: "text" });
    const b = toQuestion({ label: "full name ", kind: "text" });
    expect(keyOf(a)).toBe(keyOf(b));
    const c = toQuestion({ label: "Full Name", kind: "textarea" });
    expect(keyOf(a)).not.toBe(keyOf(c));
  });
});

describe("mergePicked", () => {
  const q = (label, extra = {}) => ({ label, type: "short_text", ...extra });
  it("keeps off-page questions first (original order), then page-ordered picks", () => {
    const existing = [q("Old A"), q("Name"), q("Old B")];
    const page = [q("Email"), q("Name")]; // page order: Email before Name
    expect(mergePicked(existing, page).map((x) => x.label)).toEqual([
      "Old A", "Old B", "Email", "Name",
    ]);
  });
  it("preserves the flagged star across a re-pick", () => {
    const existing = [q("Name", { flagged: true })];
    const page = [q("Name")];
    expect(mergePicked(existing, page)[0].flagged).toBe(true);
  });
  it("handles empty inputs", () => {
    expect(mergePicked([], [])).toEqual([]);
    expect(mergePicked([q("A")], []).map((x) => x.label)).toEqual(["A"]);
  });
});

describe("isConsentNoise", () => {
  it("matches privacy/terms/gdpr/newsletter/marketing", () => {
    expect(isConsentNoise("I accept the Terms of Service")).toBe(true);
    expect(isConsentNoise("Subscribe to our newsletter")).toBe(true);
    expect(isConsentNoise("Preferred locations")).toBe(false);
  });
});
