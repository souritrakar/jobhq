import { vi } from "vitest"

// `import "server-only"` throws unless the bundler resolves the package's `react-server` export
// condition (which Next.js's webpack/turbopack config sets up, but plain Vitest does not). Stub it
// to a no-op so files that start with `import "server-only"` (the repo convention, e.g.
// lib/server/billing.ts) can be unit-tested without pulling in Next's bundler.
vi.mock("server-only", () => ({}))
