"use client";

import { useEffect, useState } from "react";
import { Logo } from "../logo";
import { ChromeStoreButton } from "../chrome-button";
import { cn } from "@/lib/utils";

const NAV = [
  { label: "How it works", href: "#how" },
  { label: "Extension", href: "#extension" },
  { label: "The app", href: "#app" },
  { label: "FAQ", href: "#faq" },
];

/**
 * v5 floating pill nav — a rounded paper bar hovering over the canvas
 * (Acctual register). Always light: the whole page is daylight paper now.
 */
export function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 12);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4">
      <div
        className={cn(
          "mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 rounded-full border pl-4 pr-2 transition-all duration-300 sm:pl-5",
          scrolled
            ? "border-border/80 bg-background/85 shadow-[0_18px_40px_-24px_rgba(20,40,25,0.35)] backdrop-blur-xl"
            : "border-border/60 bg-background/70 shadow-[0_10px_30px_-24px_rgba(20,40,25,0.25)] backdrop-blur-md",
        )}
      >
        <a href="#top" className="shrink-0" aria-label="JobTracker home">
          <Logo />
        </a>

        <nav className="hidden items-center gap-7 md:flex" aria-label="Primary">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-1.5 md:flex">
          <a
            href="/dashboard"
            className="rounded-full px-4 py-2 text-sm font-semibold text-foreground/80 transition-colors hover:bg-secondary hover:text-foreground"
          >
            Open app
          </a>
          <ChromeStoreButton size="sm" />
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={open}
          className="grid size-10 place-items-center rounded-full text-foreground transition-colors hover:bg-secondary md:hidden"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
            {open ? (
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile sheet — a paper card dropping out of the pill */}
      <div
        className={cn(
          "mx-auto mt-2 max-w-5xl overflow-hidden rounded-3xl border bg-background shadow-[0_24px_50px_-24px_rgba(20,40,25,0.4)] transition-all duration-300 ease-out md:hidden",
          open ? "max-h-96 border-border opacity-100" : "max-h-0 border-transparent opacity-0",
        )}
      >
        <nav className="flex flex-col gap-1 px-4 py-4" aria-label="Mobile">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="rounded-xl px-3 py-2.5 text-base font-medium text-foreground/80 transition-colors hover:bg-secondary"
            >
              {item.label}
            </a>
          ))}
          <div className="mt-2 flex flex-col gap-2">
            <a
              href="/dashboard"
              className="rounded-full border border-border px-4 py-2.5 text-center text-sm font-semibold text-foreground"
            >
              Open app
            </a>
            <ChromeStoreButton className="w-full justify-center" />
          </div>
        </nav>
      </div>
    </header>
  );
}
