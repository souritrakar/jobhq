import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // The webapp imports shared CSS from ../design-system (a sibling of webapp/,
  // also consumed by the Chrome extension). Turbopack treats its root as the
  // filesystem boundary, so without this those imports "leave the filesystem
  // root" and crash the dev server. Point the root at the jobtracker workspace.
  turbopack: {
    root: path.join(__dirname, ".."),
  },
};

export default nextConfig;
