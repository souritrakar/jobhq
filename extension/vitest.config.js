import { defineConfig } from "vitest/config";

// jsdom (not happy-dom) on purpose: the fill engine relies on the native `value` property
// descriptor living on HTMLInputElement.prototype — the exact mechanism React's controlled-input
// value tracker hooks. jsdom mirrors real browser prototype semantics here, so the native-setter
// trick can be tested faithfully.
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["lib/**/*.test.js", "ui/**/*.test.js"],
  },
});
