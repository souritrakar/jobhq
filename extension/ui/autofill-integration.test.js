// Integration test: loads the REAL field-adapters engine AND the REAL application.js autofill
// engine, then drives the full harvest → backend-plan → apply path against a form that mirrors a
// live multi-widget application (the kind in the screenshot: number, url, radio Yes/No). This is
// what the modal does on each Autofill click. It verifies the refactored wiring end-to-end:
// descriptor shapes match the adapters, the cross-scan registry keys correctly, re-running is
// idempotent, user edits are preserved, and Undo reverts.
//
// jsdom has no layout, so harvest's isVisible() (which calls getClientRects) would treat every
// element as unrendered. We stub getClientRects to a non-empty rect so discovery behaves as in a
// real browser; nothing else about the engine is mocked.
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import "../lib/field-adapters.js";
import "./application.js";

const UI = globalThis.JobTracker.ui;

// Build a plan the way the backend would: map each harvested field to an answer by label substring.
function planFrom(harvest, answers) {
  const matched = [];
  for (const f of harvest.fields) {
    for (const needle in answers) {
      if (f.label.toLowerCase().includes(needle.toLowerCase())) {
        matched.push(Object.assign({ fieldId: f.id }, answers[needle]));
        break;
      }
    }
  }
  return { matched, unmatched: [] };
}

function labeled(text, control, id) {
  control.id = id;
  const wrap = document.createElement("div");
  const lab = document.createElement("label");
  lab.setAttribute("for", id);
  lab.textContent = text;
  wrap.append(lab, control);
  return wrap;
}

// The fill engine's registry + undo map are module-level and persist for a page session (correct in
// production). Across tests that means stable label-based keys would collide, so give every form a
// unique suffix — each test then exercises a fresh set of fields.
let formSeq = 0;
function buildForm() {
  const n = ++formSeq;
  const form = document.createElement("form");

  const github = document.createElement("input");
  github.type = "url";
  const rate = document.createElement("input");
  rate.type = "number";

  form.append(labeled(`Can you share the link to your GitHub contributions? #${n}`, github, "github" + n));
  form.append(labeled(`What is your expected hourly rate in USD? #${n}`, rate, "rate" + n));

  const fs = document.createElement("fieldset");
  const lg = document.createElement("legend");
  lg.textContent = `Will you be able to review and sign the contract within 24 hours? #${n}`;
  fs.append(lg);
  const radios = ["Yes", "No"].map((v) => {
    const r = document.createElement("input");
    r.type = "radio";
    r.name = "review" + n;
    r.value = v;
    const l = document.createElement("label");
    l.append(r, document.createTextNode(v));
    fs.append(l);
    return r;
  });
  form.append(fs);

  document.body.append(form);
  return { github, rate, yes: radios[0], no: radios[1] };
}

const ANSWERS = {
  github: { value: "https://github.com/souritrakar" },
  "hourly rate": { value: "45" },
  "review and sign": { optionValues: ["Yes"] },
};

let origRects;
beforeEach(() => {
  document.body.innerHTML = "";
  origRects = Element.prototype.getClientRects;
  Element.prototype.getClientRects = () => [{ width: 10, height: 10, top: 0, left: 0 }];
});
afterEach(() => {
  Element.prototype.getClientRects = origRects;
});

describe("autofill engine ↔ fill adapters (integration)", () => {
  it("fills a realistic multi-widget form from a plan", async () => {
    const f = buildForm();
    const h = UI.autofill.harvest();
    // Discovery found all three questions.
    expect(h.fields.length).toBe(3);

    const res = await UI.autofill.apply(planFrom(h, ANSWERS));
    expect(f.github.value).toBe("https://github.com/souritrakar");
    expect(f.rate.value).toBe("45");
    expect(f.yes.checked).toBe(true);
    expect(res.real).toBe(3);
    expect(res.failedCount).toBe(0);
  });

  it("is idempotent — a second harvest+apply re-confirms without churn or failure", async () => {
    const f = buildForm();
    await UI.autofill.apply(planFrom(UI.autofill.harvest(), ANSWERS));

    // Re-click: fresh harvest (new field ids), same answers. Everything already holds the target.
    const res2 = await UI.autofill.apply(planFrom(UI.autofill.harvest(), ANSWERS));
    expect(res2.real).toBe(3); // still reported as filled (already correct)
    expect(res2.failedCount).toBe(0);
    expect(f.github.value).toBe("https://github.com/souritrakar");
    expect(f.yes.checked).toBe(true);
  });

  it("never overwrites a field the user edited after the first fill", async () => {
    const f = buildForm();
    await UI.autofill.apply(planFrom(UI.autofill.harvest(), ANSWERS));

    // User changes the GitHub field by hand.
    UI.fill.setNativeValue(f.github, "https://github.com/my-other-handle");

    const res = await UI.autofill.apply(planFrom(UI.autofill.harvest(), ANSWERS));
    expect(f.github.value).toBe("https://github.com/my-other-handle"); // preserved, not clobbered
    expect(res.skipped).toBeGreaterThanOrEqual(1);
  });

  it("Undo reverts the values written in the last apply", async () => {
    const f = buildForm();
    await UI.autofill.apply(planFrom(UI.autofill.harvest(), ANSWERS));
    expect(f.rate.value).toBe("45");

    UI.autofill.undo();
    expect(f.github.value).toBe("");
    expect(f.rate.value).toBe("");
    expect(f.yes.checked).toBe(false);
  });

  it("Undo still reverts after a repeat Autofill (fields came back 'already')", async () => {
    const f = buildForm();
    await UI.autofill.apply(planFrom(UI.autofill.harvest(), ANSWERS));
    // Second Autofill without an Undo in between — every field is already correct, so this pass
    // produces no fresh write. Undo must still revert the original fill (the bug we fixed).
    await UI.autofill.apply(planFrom(UI.autofill.harvest(), ANSWERS));

    UI.autofill.undo();
    expect(f.github.value).toBe("");
    expect(f.rate.value).toBe("");
    expect(f.yes.checked).toBe(false);
  });

  it("Undo leaves a user-edited field alone but reverts the rest", async () => {
    const f = buildForm();
    await UI.autofill.apply(planFrom(UI.autofill.harvest(), ANSWERS));

    UI.fill.setNativeValue(f.github, "https://github.com/my-own-edit"); // user takes over this field
    await UI.autofill.apply(planFrom(UI.autofill.harvest(), ANSWERS)); // github now skipped-user

    UI.autofill.undo();
    expect(f.github.value).toBe("https://github.com/my-own-edit"); // user's edit survives Undo
    expect(f.rate.value).toBe(""); // the rest revert
    expect(f.yes.checked).toBe(false);
  });
});
