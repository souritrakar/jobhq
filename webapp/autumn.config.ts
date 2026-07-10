import { feature, item, plan } from "atmn"

// The detection primitive: a boolean flag granted only by the Pro plan. Server code gates on
// `check({ featureId: "pro" })`. Free and Pro grant the SAME real product access today — this flag
// only records "is this a paying customer", so the machinery (checkout, gating, rerouting, UI) is
// in place before we demarcate which capabilities become Pro-only.
export const pro = feature({
  id: "pro",
  name: "Pro",
  type: "boolean",
})

// Metered consumable — the unit AI actions (generations, drafts, etc.) draw down against. Free
// includes a monthly allowance (see the `free` plan below); Pro grants unlimited.
export const generations = feature({
  id: "generations",
  name: "AI Generations",
  type: "metered",
  consumable: true,
})

// Boolean flag gating AI-assisted answer drafting for job applications. Pro-only.
export const aiAnswerDrafting = feature({
  id: "ai_answer_drafting",
  name: "AI Answer Drafting",
  type: "boolean",
})

// Free — auto-assigned to every new customer (no price). Same `group` as Pro so the two replace
// each other on upgrade/downgrade, and Free re-activates automatically if Pro is cancelled.
export const free = plan({
  id: "free",
  name: "Free",
  group: "main",
  autoEnable: true,
  items: [item({ featureId: generations.id, included: 8, reset: { interval: "month" } })],
})

// Pro — $20/mo, grants the `pro` flag, unlimited generations, and AI answer drafting.
export const proPlan = plan({
  id: "pro",
  name: "Pro",
  group: "main",
  price: { amount: 20, interval: "month" },
  items: [
    item({ featureId: pro.id }),
    item({ featureId: aiAnswerDrafting.id }),
    item({ featureId: generations.id, unlimited: true }),
  ],
})
