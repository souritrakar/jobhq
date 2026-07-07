import { Nav } from "@/components/landing/v5/nav";
import { Hero } from "@/components/landing/v5/hero";
import { Shelf } from "@/components/landing/v5/shelf";
import { Problem } from "@/components/landing/v5/problem";
import { How } from "@/components/landing/v5/how";
import { BentoExtension } from "@/components/landing/v5/bento-extension";
import { BentoApp } from "@/components/landing/v5/bento-app";
import { Who } from "@/components/landing/v5/who";
import { Faq } from "@/components/landing/v5/faq";
import { Closer } from "@/components/landing/v5/closer";

/* Landing v5 — "a calm desk for a chaotic job search" (playful paper).
   v4 sections remain in components/landing/ for revert. */

export default function Home() {
  return (
    <>
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <Nav />
      <main id="content" className="flex-1">
        <Hero />
        <Shelf />
        <Problem />
        <How />
        <BentoExtension />
        <BentoApp />
        <Who />
        <Faq />
      </main>
      <Closer />
    </>
  );
}
