// Unit test for harvestQuestions() — the questions-oriented DOM harvest that feeds the tiered
// (non-LLM) application extractor. Unlike the autofill harvest it INCLUDES file inputs and carries the
// native input type, so the backend can type each field precisely. Loads the real application.js engine.
//
// jsdom has no layout, so harvest's isVisible() (getClientRects) would treat every element as
// unrendered — stub it to a non-empty rect, exactly like autofill-integration.test.js.
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import "../lib/field-adapters.js";
import "./application.js";

const UI = globalThis.JobTracker.ui;

function labeled(text, control, id) {
  control.id = id;
  const wrap = document.createElement("div");
  const lab = document.createElement("label");
  lab.setAttribute("for", id);
  lab.textContent = text;
  wrap.append(lab, control);
  return wrap;
}

function input(type, attrs = {}) {
  const el = document.createElement("input");
  el.type = type;
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

let origRects;
beforeEach(() => {
  document.body.innerHTML = "";
  origRects = Element.prototype.getClientRects;
  Element.prototype.getClientRects = () => [{ width: 10, height: 10, top: 0, left: 0 }];
});
afterEach(() => {
  Element.prototype.getClientRects = origRects;
});

describe("harvestQuestions", () => {
  it("captures controls with native input type, options, required, and FILE inputs", () => {
    const form = document.createElement("form");

    form.append(labeled("Full name", input("text", { required: "" }), "name"));
    form.append(labeled("Email", input("email"), "email"));
    form.append(labeled("LinkedIn", input("url", { placeholder: "https://linkedin.com/in/…" }), "li"));

    const ta = document.createElement("textarea");
    form.append(labeled("Cover letter", ta, "cl"));

    const sel = document.createElement("select");
    ["", "United States", "Canada"].forEach((v) => {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = v || "Select…";
      sel.append(o);
    });
    form.append(labeled("Country", sel, "country"));

    // Radio group (two share a name → one question with options).
    const fs = document.createElement("fieldset");
    const lg = document.createElement("legend");
    lg.textContent = "Authorized to work?";
    fs.append(lg);
    ["Yes", "No"].forEach((v, i) => {
      fs.append(labeled(v, input("radio", { name: "auth", value: v }), "auth" + i));
    });
    form.append(fs);

    form.append(labeled("Resume", input("file"), "resume")); // a file upload IS a question

    // Standalone consent checkbox — label is the statement.
    const consent = input("checkbox", { required: "" });
    consent.id = "consent";
    const clab = document.createElement("label");
    clab.setAttribute("for", "consent");
    clab.textContent = "I agree to the terms";
    const cwrap = document.createElement("div");
    cwrap.append(consent, clab);
    form.append(cwrap);

    document.body.append(form);

    const { fields } = UI.autofill.harvestQuestions();
    const byLabel = Object.fromEntries(fields.map((f) => [f.label, f]));

    expect(byLabel["Full name"]).toMatchObject({ kind: "text", inputType: "text", required: true });
    expect(byLabel["Email"]).toMatchObject({ kind: "text", inputType: "email" });
    expect(byLabel["LinkedIn"]).toMatchObject({ kind: "text", inputType: "url" });
    expect(byLabel["LinkedIn"].placeholder).toContain("linkedin.com");
    expect(byLabel["Cover letter"]).toMatchObject({ kind: "textarea" });
    expect(byLabel["Country"]).toMatchObject({ kind: "select" });
    expect(byLabel["Country"].options).toEqual(["United States", "Canada"]); // placeholder dropped
    expect(byLabel["Authorized to work?"]).toMatchObject({ kind: "radio", options: ["Yes", "No"] });
    expect(byLabel["Resume"]).toMatchObject({ kind: "file" }); // included (autofill harvest excludes it)
    expect(byLabel["I agree to the terms"]).toMatchObject({ kind: "checkbox", required: true });
  });

  it("skips password and submit inputs (never questions)", () => {
    const form = document.createElement("form");
    form.append(labeled("Email", input("email"), "e"));
    form.append(labeled("Password", input("password"), "p"));
    form.append(input("submit", { value: "Apply" }));
    document.body.append(form);

    const labels = UI.autofill.harvestQuestions().fields.map((f) => f.label);
    expect(labels).toContain("Email");
    expect(labels).not.toContain("Password");
    expect(labels).not.toContain("Apply");
  });
});
