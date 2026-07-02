// Pick → question mapper — the deterministic replacement for the LLM's classification step.
//
// A harvested field descriptor (ui/application.js#harvestQuestions) converts to the EXACT
// ApplicationQuestion shape the backend already validates and stores ({ label, type,
// required?, placeholder?, options? } — lib/validations/job.ts). Same type matrix as the
// indexed backend (webapp/lib/llm/indexed-questions.ts#domDefaultType), plus select[multiple]
// → multi_select. keyOf() is the question's stable identity — what the picker registry and
// the selected-state restore key on (content identity, so it survives DOM re-renders AND
// round-trips through storage, unlike a DOM-attribute key).
(function (root, factory) {
  "use strict";
  const api = factory();
  const NS = (root.JobTracker = root.JobTracker || {});
  NS.questionMapper = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  const norm = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();

  const NATIVE_TYPE = { email: "email", tel: "tel", url: "url", number: "number", date: "date" };
  const TYPES_WITH_OPTIONS = new Set(["select", "radio", "multi_select", "checkbox"]);

  // Keep identical to webapp/lib/llm/indexed-questions.ts CONSENT_NOISE.
  const CONSENT_NOISE =
    /\b(privacy\s+(policy|notice|statement)|terms\s+(of|and|&)|t&c|consent|gdpr|data\s+(processing|protection)|newsletter|marketing\s+(emails?|communications?)|promotional)\b/i;

  function isConsentNoise(label) {
    return CONSENT_NOISE.test(String(label || ""));
  }

  function typeOf(field) {
    switch (field.kind) {
      case "select":
        return field.multiple ? "multi_select" : "select";
      case "radio":
        return "radio";
      case "checkbox":
        return "checkbox";
      case "textarea":
      case "contenteditable":
        return "long_text";
      case "file":
        return "file";
      case "combobox":
        return "select";
      default:
        return NATIVE_TYPE[norm(field.inputType).toLowerCase()] || "short_text";
    }
  }

  // Harvested field → stored question. null = not a trackable question (unlabeled, or a
  // consent/legal checkbox — the "ignore privacy checkboxes" rule, checkbox-kind only).
  function toQuestion(field) {
    const label = norm(field.label);
    if (!label) return null;
    const type = typeOf(field);
    if (type === "checkbox" && isConsentNoise(label)) return null;
    const q = { label, type };
    if (field.required === true) q.required = true;
    const placeholder = norm(field.placeholder);
    if (placeholder) q.placeholder = placeholder;
    if (TYPES_WITH_OPTIONS.has(type)) {
      const options = (Array.isArray(field.options) ? field.options : [])
        .map(norm)
        .filter(Boolean);
      if (options.length) q.options = options;
    }
    return q;
  }

  /** Stable content identity: normalized label + type + options. */
  function keyOf(question) {
    const L = (s) => norm(s).toLowerCase();
    return [
      L(question.label),
      question.type,
      (question.options || []).map(L).join("|"),
    ].join("::");
  }

  // Merge the page's currently-selected questions (page order) into the existing tracked
  // set: questions NOT represented on this page keep their original relative order (they
  // were picked on another sub-page/session), then the on-page picks follow in page order.
  // The user-set `flagged` star survives a re-pick by key.
  function mergePicked(existing, pageSelected) {
    const prior = Array.isArray(existing) ? existing : [];
    const page = Array.isArray(pageSelected) ? pageSelected : [];
    const pageKeys = new Set(page.map(keyOf));
    const flaggedByKey = new Set(prior.filter((q) => q && q.flagged).map(keyOf));
    const offPage = prior.filter((q) => q && !pageKeys.has(keyOf(q)));
    const picks = page.map((q) => (flaggedByKey.has(keyOf(q)) ? { ...q, flagged: true } : q));
    return [...offPage, ...picks];
  }

  return { toQuestion, keyOf, mergePicked, isConsentNoise };
});
