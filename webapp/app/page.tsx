import { Nav } from "@/components/landing/v6/nav";
import { Hero } from "@/components/landing/v6/hero";
import { Sources } from "@/components/landing/v6/sources";
import { Problem } from "@/components/landing/v6/problem";
import { FeatureExtension } from "@/components/landing/v6/feature-extension";
import { FeatureDuo } from "@/components/landing/v6/feature-duo";
import { FeatureApp } from "@/components/landing/v6/feature-app";
import { Faq } from "@/components/landing/v6/faq";
import { Closer } from "@/components/landing/v6/closer";
import { getOptionalSessionUser } from "@/lib/auth/current-user";

/* Landing v6 — "notion+todoist for jobs": pastel product stages holding
   believable mini-product mockups (the Circleback/Todoist register).
   v5 remains in components/landing/v5/ for revert. */

// The primary CTA depends on the session cookie (authed vs signed-out copy/href),
// so this page can't be statically cached.
export const dynamic = "force-dynamic";

export default async function Home() {
  const authed = Boolean(await getOptionalSessionUser());

  return (
    <>
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <Nav authed={authed} />
      <main id="content" className="flex-1">
        <Hero authed={authed} />
        <Sources />
        <Problem />
        <FeatureExtension />
        <FeatureDuo />
        <FeatureApp />
        <Faq />
      </main>
      <Closer authed={authed} />
    </>
  );
}
