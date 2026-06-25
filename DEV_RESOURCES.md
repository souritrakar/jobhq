# Job-Search Extension — Dev Resources & Toolkit

Reference index for building this Chrome extension SaaS. Not loaded automatically —
consult when relevant. The repomix `SKILL.md` that originally shipped in this folder
was unrelated boilerplate and was removed.

## Installed skills (invoke via the Skill tool, prefix `cext-`)

Source: `francanete/fran-marketplace` (chrome-extension-expert) + `tapanshah/antigravity-aswsome-skills`.
Installed under `~/.claude/skills/`.

| Skill | Use when |
|-------|----------|
| `cext-developer-overview` | Quick mental model: MV3, service worker, content scripts, contexts |
| `cext-manifest-v3` | Writing/editing `manifest.json` — fields, CSP, permissions, icons |
| `cext-extension-apis` | Implementing with `chrome.*` APIs (runtime, storage, tabs, scripting, identity, sidePanel, offscreen…) |
| `cext-component-communication` | Messaging between background ↔ content ↔ popup ↔ side panel; ports, state sync |
| `cext-side-panel-development` | Building side-panel UI (`chrome.sidePanel`) |
| `cext-ui-patterns` | Popup/options/side-panel layout, dark mode, a11y, forms |
| `cext-security-best-practices` | CSP, least-privilege permissions, XSS-safe DOM, secure messaging |
| `cext-store-requirements` | **Before submission** — Developer Program Policies, single-purpose, permission justifications, privacy policy, rejection reasons |
| `cext-debugging-guide` | Service worker inspection, content-script debugging, storage/network analysis |
| `cext-migration-guide` | MV2→MV3 patterns (reference; we start native MV3) |

Other relevant pre-installed tooling:
- **chrome-devtools-mcp** + skills (`chrome-devtools`, `a11y-debugging`, `debug-optimize-lcp`) — drive a real Chrome to test the extension, audit accessibility, profile perf.
- **context7** MCP — fetch up-to-date library docs (React, build tools, SDKs) during dev.
- **frontend-design** / **ui-ux-pro-max** skills — polished UI generation.

## Authoritative live docs (prefer over memory; fetch with context7/WebFetch)

- Chrome Extensions (MV3): https://developer.chrome.com/docs/extensions
- Modern web guidance: https://developer.chrome.com/docs/modern-web-guidance/get-started
- Chrome Web Store policies: https://developer.chrome.com/docs/webstore/program-policies
- Permissions & justifications: https://developer.chrome.com/docs/webstore/cws-dashboard-privacy

## Field-tested lessons (from 2026 dev.to write-ups)

Building MV3 in 2026 — ryu0705; "Claude extension in 45 min" — clawgenesis.

**Service worker**
- Terminates when idle — never rely on global vars or `setInterval`; persist to `chrome.storage.local`. Keep it minimal (message relay only).
- Return `true` from `chrome.runtime.onMessage` listeners to use async `sendResponse`.
- Init defaults in `chrome.runtime.onInstalled`.

**Content scripts on SPAs (LinkedIn/job sites are React SPAs)**
- Use `MutationObserver`, not polling — survives re-renders, handles mount/unmount.
- Avoid class-name selectors (regenerated constantly); target stable attributes like `data-testid` with multiple fallbacks.
- For `contenteditable` inputs read `innerText`, not `value`.
- Use `{ passive: true }` event listeners to avoid scroll jank.

**Permissions / store**
- Separate `permissions` from `host_permissions` in MV3.
- Declare the minimum — fewer permissions = higher trust + install rate. Prefer `activeTab`/`storage`; request host access as optional/runtime where possible.
- No inline scripts (CSP) — all JS in separate files.
- Store review takes days→weeks; plan launch timing. Can load unpacked during review.
- `chrome.storage.sync` for cross-device user prefs.

## Testing
- Load unpacked via `chrome://extensions` (Developer mode).
- Vitest for units; Puppeteer / chrome-devtools-mcp for e2e against the live extension.
