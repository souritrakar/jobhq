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

// Free — auto-assigned to every new customer (no price). Same `group` as Pro so the two replace
// each other on upgrade/downgrade, and Free re-activates automatically if Pro is cancelled.
export const free = plan({
  id: "free",
  name: "Free",
  group: "main",
  autoEnable: true,
  items: [],
})

// Pro — $20/mo, grants the `pro` flag.
export const proPlan = plan({
  id: "pro",
  name: "Pro",
  group: "main",
  price: { amount: 20, interval: "month" },
  items: [item({ featureId: pro.id })],
})
