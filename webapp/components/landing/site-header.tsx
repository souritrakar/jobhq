"use client";

import { useEffect, useState } from "react";
import { Logo } from "./logo";
import { ChromeStoreButton } from "./chrome-button";
import { cn } from "@/lib/utils";

const NAV = [
  { label: "How it works", href: "#demo" },
  { label: "Features", href: "#features" },
  { label: "Audience", href: "#who-its-for" },
  { label: "FAQ", href: "#faq" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const updateScrolled = () => setScrolled(window.scrollY > 8);

    updateScrolled();
    window.addEventListener("scroll", updateScrolled, { passive: true });

    return () => window.removeEventListener("scroll", updateScrolled);
  }, []);

  return (
    <header
      className={cn(
        "site-header fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled
          ? "border-b border-border/60 bg-background/90 shadow-sm shadow-pine/5 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent shadow-none backdrop-blur-0",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <a href="#top" className="shrink-0" aria-label="jobhq home">
          <Logo light={!scrolled} />
        </a>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={cn(
                "text-sm font-medium transition-colors",
                scrolled
                  ? "text-muted-foreground hover:text-foreground"
                  : "text-white/75 hover:text-white",
              )}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <a
            href="/dashboard"
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
              scrolled
                ? "text-foreground/80 hover:bg-secondary hover:text-foreground"
                : "text-white/90 hover:bg-white/10 hover:text-white",
            )}
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
          className={cn(
            "grid size-10 place-items-center rounded-xl transition-colors md:hidden",
            scrolled ? "text-foreground hover:bg-secondary" : "text-white hover:bg-white/10",
          )}
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
            {open ? (
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            ) : (
              <path
                d="M4 7h16M4 12h16M4 17h16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile panel */}
      <div
        className={cn(
          "overflow-hidden border-t border-border/60 bg-background md:hidden",
          open ? "max-h-80" : "max-h-0 border-t-0",
          "transition-all duration-300 ease-out",
        )}
      >
        <nav className="flex flex-col gap-1 px-5 py-4">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 text-base font-medium text-foreground/80 transition-colors hover:bg-secondary"
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
