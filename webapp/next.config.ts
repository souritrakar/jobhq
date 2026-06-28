import type { NextConfig } from "next";

// Shared design-system CSS is vendored into webapp/design-system/ (see app/globals.css),
// so all imports stay within the webapp/ filesystem root — no Turbopack root override needed,
// and CLI/serverless builds (upload root = webapp/) resolve them cleanly.
const nextConfig: NextConfig = {
  // unpdf (pdf.js) and mammoth are heavy, server-only document parsers. Letting Turbopack/webpack
  // bundle unpdf makes its dynamic pdf.js import hang at runtime (the cover-letter "stuck on
  // writing" bug — a resume PDF never finished parsing). Marking them external means Next requires
  // them natively at runtime, the same way they resolve correctly under plain Node.
  serverExternalPackages: ["unpdf", "mammoth"],
};

export default nextConfig;
