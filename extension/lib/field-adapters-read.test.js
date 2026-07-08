// Unit tests for adapter.read() — the value-reading half of the fill engine that powers the
// live page→panel mirror. Each adapter reads its control's CURRENT state in answer shape:
// strings for single-value controls, option-label arrays for multi-value groups.
import { describe, it, expect, beforeEach } from "vitest";

import fill from "./field-adapters.js";

beforeEach(() => {
  document.body.innerHTML = "";
});

function select(labels, { multiple = false, selected = [] } = {}) {
  const el = document.createElement("select");
  if (multiple) el.multiple = true;
  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = "Select…";
  el.append(ph);
  for (const l of labels) {
    const o = document.createElement("option");
    o.value = l;
    o.textContent = l;
    if (selected.includes(l)) o.selected = true;
    el.append(o);
  }
  document.body.append(el);
  return el;
}

describe("adapter.read()", () => {
  it("text / textarea read the raw value", () => {
    const el = document.createElement("input");
    el.type = "text";
    el.value = "  hello  ";
    expect(fill.createAdapter({ kind: "text", el }).read()).toBe("  hello  ");

    const ta = document.createElement("textarea");
    ta.value = "line1\nline2";
    expect(fill.createAdapter({ kind: "textarea", el: ta }).read()).toBe("line1\nline2");
  });

  it("contenteditable reads trimmed text", () => {
    const el = document.createElement("div");
    el.textContent = "  my essay  ";
    expect(fill.createAdapter({ kind: "contenteditable", el }).read()).toBe("my essay");
  });

  it("single select reads the selected option LABEL, placeholder as empty", () => {
    const el = select(["United States", "Canada"]);
    const a = fill.createAdapter({ kind: "select", el });
    expect(a.read()).toBe("");
    el.value = "Canada";
    expect(a.read()).toBe("Canada");
  });

  it("multi select reads an array of selected labels", () => {
    const el = select(["Remote", "Hybrid", "Onsite"], {
      multiple: true,
      selected: ["Remote", "Onsite"],
    });
    expect(fill.createAdapter({ kind: "select", el }).read()).toEqual(["Remote", "Onsite"]);
  });

  it("radio group reads the checked option's label", () => {
    const mk = (v) => {
      const i = document.createElement("input");
      i.type = "radio";
      i.name = "auth";
      i.value = v;
      document.body.append(i);
      return { el: i, value: v, label: v };
    };
    const opts = [mk("Yes"), mk("No")];
    const a = fill.createAdapter({ kind: "radio", options: opts });
    expect(a.read()).toBe("");
    opts[1].el.checked = true;
    expect(a.read()).toBe("No");
  });

  it("checkbox group reads checked labels as an array", () => {
    const mk = (v) => {
      const i = document.createElement("input");
      i.type = "checkbox";
      i.name = "days";
      i.value = v;
      document.body.append(i);
      return { el: i, value: v, label: v };
    };
    const opts = [mk("Mon"), mk("Tue"), mk("Wed")];
    const a = fill.createAdapter({ kind: "checkbox", options: opts });
    expect(a.read()).toEqual([]);
    opts[0].el.checked = true;
    opts[2].el.checked = true;
    expect(a.read()).toEqual(["Mon", "Wed"]);
  });

  it("consent checkbox reads \"true\" / \"\"", () => {
    const el = document.createElement("input");
    el.type = "checkbox";
    const a = fill.createAdapter({ kind: "checkbox", el });
    expect(a.read()).toBe("");
    el.checked = true;
    expect(a.read()).toBe("true");
  });

  it("button cluster reads the selected option via ARIA/selected-ish state", () => {
    const mk = (v, pressed) => {
      const b = document.createElement("button");
      b.textContent = v;
      if (pressed) b.setAttribute("aria-pressed", "true");
      document.body.append(b);
      return { el: b, label: v };
    };
    const opts = [mk("Yes", false), mk("No", true)];
    expect(fill.createAdapter({ kind: "buttons", options: opts }).read()).toBe("No");
  });

  it("combobox reads the input's value", () => {
    const el = document.createElement("input");
    el.setAttribute("role", "combobox");
    el.value = "Berlin";
    expect(fill.createAdapter({ kind: "combobox", el }).read()).toBe("Berlin");
  });
});
