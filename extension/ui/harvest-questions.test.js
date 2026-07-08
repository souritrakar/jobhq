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

  it("ignores aria-hidden required-proxy inputs (react-select) — one question per widget, typed select", () => {
    // react-select renders a real role=combobox input AND a hidden required-proxy text input
    // (aria-hidden, opacity:0) that mirrors the value for native HTML validation. Both used to be
    // harvested → a duplicate badge and a bogus short_text twin. The proxy must be ignored.
    const form = document.createElement("form");
    const wrap = document.createElement("div");
    const lab = document.createElement("label");
    lab.setAttribute("for", "degree");
    lab.textContent = "Degree";
    const combo = input("text", { role: "combobox", "aria-haspopup": "true" });
    combo.id = "degree";
    const proxy = input("text", { "aria-hidden": "true", tabindex: "-1" }); // the validation shadow
    wrap.append(lab, combo, proxy);
    form.append(wrap);
    document.body.append(form);

    const fields = UI.autofill.harvestQuestions().fields.filter((f) => f.label === "Degree");
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({ kind: "combobox" }); // → select downstream, not short_text
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

// A question the way Lever/Wellfound render custom questions: the label text lives in a plain
// <div> (NOT a heading/<label>), a sibling of the field wrapper, under a SECTION heading.
function divLabeledQuestion(labelText, control) {
  const li = document.createElement("li");
  li.className = "application-question";
  const inner = document.createElement("div");
  const labelDiv = document.createElement("div");
  labelDiv.className = "application-label";
  const textDiv = document.createElement("div");
  textDiv.className = "text";
  textDiv.textContent = labelText;
  const req = document.createElement("span");
  req.className = "required";
  req.textContent = "✱";
  textDiv.append(req);
  labelDiv.append(textDiv);
  const fieldDiv = document.createElement("div");
  fieldDiv.className = "application-field";
  fieldDiv.append(control);
  inner.append(labelDiv, fieldDiv);
  li.append(inner);
  return li;
}

describe("harvestQuestions — real ATS label + order (Lever/Wellfound shapes)", () => {
  it("uses the question's own <div> label, not the far section heading (Lever custom questions)", () => {
    const form = document.createElement("form");
    const section = document.createElement("div");
    const heading = document.createElement("h2");
    heading.textContent = "BI Developer"; // the SECTION title — must NOT become the label
    const ul = document.createElement("ul");
    ul.append(divLabeledQuestion("How do you become familiar with a dataset?", document.createElement("textarea")));
    const portfolio = input("text");
    ul.append(divLabeledQuestion("Please share portfolio link or work samples", portfolio));
    section.append(heading, ul);
    form.append(section);
    document.body.append(form);

    const labels = UI.autofill.harvestQuestions().fields.map((f) => f.label);
    expect(labels).toContain("How do you become familiar with a dataset?");
    expect(labels).toContain("Please share portfolio link or work samples");
    expect(labels).not.toContain("BI Developer"); // section heading never used as a field label
  });

  it("gives two groups sharing one fieldset their OWN labels, not the section legend", () => {
    const form = document.createElement("form");
    const fs = document.createElement("fieldset");
    const lg = document.createElement("legend");
    lg.textContent = "US work authorization"; // a SECTION legend over both questions
    fs.append(lg);
    const mkGroup = (labelText, name) => {
      const wrap = document.createElement("div");
      const labelDiv = document.createElement("div");
      labelDiv.className = "application-label";
      labelDiv.textContent = labelText;
      const opts = document.createElement("div");
      ["Yes", "No"].forEach((v) => {
        const lab = document.createElement("label");
        const r = input("radio", { name, value: v });
        lab.append(r, document.createTextNode(v));
        opts.append(lab);
      });
      wrap.append(labelDiv, opts);
      return wrap;
    };
    fs.append(mkGroup("Are you legally authorized to work in the United States?", "usAuthorized"));
    fs.append(mkGroup("Do you require sponsorship?", "requireSponsorship"));
    form.append(fs);
    document.body.append(form);

    const labels = UI.autofill.harvestQuestions().fields.map((f) => f.label);
    expect(labels).toContain("Are you legally authorized to work in the United States?");
    expect(labels).toContain("Do you require sponsorship?");
    // both groups would otherwise collapse onto the shared legend
    expect(labels.filter((l) => l === "US work authorization")).toHaveLength(0);
  });

  it("drops button + status add-ons packed into one <label> (resume/location over-capture)", () => {
    const form = document.createElement("form");
    // Lever's resume field: one <label> holding caption + an anchor button + async status divs.
    const lab = document.createElement("label");
    const cap = document.createElement("div");
    cap.className = "application-label";
    cap.textContent = "Resume/CV";
    const btn = document.createElement("a");
    btn.href = "#";
    btn.textContent = "ATTACH RESUME/CV";
    const file = input("file", { name: "resume" });
    const status = document.createElement("div");
    status.textContent = "Analyzing resume... Success!";
    lab.append(cap, btn, file, status);
    form.append(lab);
    document.body.append(form);

    const resume = UI.autofill.harvestQuestions().fields.find((f) => f.kind === "file");
    expect(resume.label).toBe("Resume/CV"); // not "Resume/CV ATTACH RESUME/CV Analyzing... Success!"
  });

  it("returns questions in DOM order, not grouped-controls-first", () => {
    const form = document.createElement("form");
    form.append(labeled("Full name", input("text"), "n"));
    form.append(labeled("Email", input("email"), "e"));
    // A radio group placed AFTER the text inputs in the DOM.
    const fs = document.createElement("fieldset");
    const lg = document.createElement("legend");
    lg.textContent = "Authorized to work?";
    fs.append(lg);
    ["Yes", "No"].forEach((v, i) => fs.append(labeled(v, input("radio", { name: "auth", value: v }), "a" + i)));
    form.append(fs);
    document.body.append(form);

    const labels = UI.autofill.harvestQuestions().fields.map((f) => f.label);
    expect(labels).toEqual(["Full name", "Email", "Authorized to work?"]);
  });
});
