// Unit tests for the answer half of question-mapper: the codec that mirrors the webapp's
// lib/application/answer-codec.ts (multi-value family → JSON string array, everything else a
// plain string) and answersForServer(), which bridges local content-keyed drafts to the
// server's stored question ids for PUT /api/jobs/:id/application/answers.
import { describe, it, expect } from "vitest";

import mapper from "./question-mapper.js";

const MULTI = { label: "Which days?", type: "checkbox", options: ["Mon", "Tue"] };
const SINGLE = { label: "Country", type: "select", options: ["US", "CA"] };
const TEXT = { label: "Why us?", type: "long_text" };
const CONSENT = { label: "I certify this is accurate", type: "checkbox" }; // no options

describe("answer codec", () => {
  it("isMultiValue: only checkbox/multi_select WITH options", () => {
    expect(mapper.isMultiValue(MULTI)).toBe(true);
    expect(mapper.isMultiValue({ ...MULTI, type: "multi_select" })).toBe(true);
    expect(mapper.isMultiValue(CONSENT)).toBe(false);
    expect(mapper.isMultiValue(SINGLE)).toBe(false);
  });

  it("encodes multi-values as a JSON array, empty as \"\"", () => {
    expect(mapper.encodeAnswer(MULTI, ["Mon", "Tue"])).toBe('["Mon","Tue"]');
    expect(mapper.encodeAnswer(MULTI, [])).toBe("");
    expect(mapper.encodeAnswer(MULTI, "Mon")).toBe('["Mon"]'); // tolerant of a stray string
  });

  it("encodes single values as plain strings", () => {
    expect(mapper.encodeAnswer(TEXT, "  because reasons  ")).toBe("because reasons");
    expect(mapper.encodeAnswer(SINGLE, "US")).toBe("US");
    expect(mapper.encodeAnswer(CONSENT, "true")).toBe("true");
  });

  it("round-trips through decode", () => {
    expect(mapper.decodeAnswer(MULTI, mapper.encodeAnswer(MULTI, ["Tue"]))).toEqual(["Tue"]);
    expect(mapper.decodeAnswer(MULTI, "")).toEqual([]);
    expect(mapper.decodeAnswer(MULTI, "legacy plain")).toEqual(["legacy plain"]); // tolerant
    expect(mapper.decodeAnswer(TEXT, "hi")).toBe("hi");
  });
});

describe("answersForServer", () => {
  it("maps content-keyed drafts to server question ids and encodes values", () => {
    const server = [
      { id: "why-us", label: "Why us?", type: "long_text" },
      { id: "which-days", label: "Which days?", type: "checkbox", options: ["Mon", "Tue"] },
      { id: "country", label: "Country", type: "select", options: ["US", "CA"] },
    ];
    const drafts = {
      [mapper.keyOf(TEXT)]: "because reasons",
      [mapper.keyOf(MULTI)]: ["Mon"],
      // Country intentionally absent — no row for it.
    };
    const rows = mapper.answersForServer(server, drafts);
    expect(rows).toEqual([
      { questionId: "why-us", value: "because reasons" },
      { questionId: "which-days", value: '["Mon"]' },
    ]);
  });

  it("keeps an explicit clear (\"\") so the server row is emptied", () => {
    const server = [{ id: "why-us", label: "Why us?", type: "long_text" }];
    const rows = mapper.answersForServer(server, { [mapper.keyOf(TEXT)]: "" });
    expect(rows).toEqual([{ questionId: "why-us", value: "" }]);
  });

  it("is safe on malformed input", () => {
    expect(mapper.answersForServer(null, {})).toEqual([]);
    expect(mapper.answersForServer([{ label: "no id", type: "short_text" }], { x: "y" })).toEqual([]);
  });
});
