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
      <Nav />
      <main className="flex-1">
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
