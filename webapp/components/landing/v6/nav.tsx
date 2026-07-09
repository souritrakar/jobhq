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

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * v6 floating pill nav. The scrolled "haze" state is driven purely by the CSS
 * scroll-driven animation in globals.css (.site-header), no JS scroll listener.
 */
export function Nav({ authed = false }: { authed?: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 rounded-full border border-border/70 bg-background/85 pl-4 pr-2 shadow-[0_14px_36px_-26px_rgba(20,40,25,0.35)] backdrop-blur-xl sm:pl-5">
        <a href="#top" className={cn("shrink-0 rounded-full", FOCUS)} aria-label="jobhq home">
          <Logo />
        </a>

        <nav className="hidden items-center gap-7 md:flex" aria-label="Primary">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                FOCUS,
              )}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-1.5 md:flex">
          <a
            href={authed ? "/dashboard" : "/auth/sign-in"}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold text-foreground/80 transition-colors hover:bg-secondary hover:text-foreground",
              FOCUS,
            )}
          >
            {authed ? "Open app" : "Log in"}
          </a>
          <ChromeStoreButton size="sm" />
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={open}
          aria-controls="mobile-menu"
          className={cn(
            "grid size-10 place-items-center rounded-full text-foreground transition-colors hover:bg-secondary md:hidden",
            FOCUS,
          )}
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

      <div
        id="mobile-menu"
        inert={!open}
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
              className={cn(
                "rounded-xl px-3 py-2.5 text-base font-medium text-foreground/80 transition-colors hover:bg-secondary",
                FOCUS,
              )}
            >
              {item.label}
            </a>
          ))}
          <div className="mt-2 flex flex-col gap-2">
            <a
              href={authed ? "/dashboard" : "/auth/sign-in"}
              onClick={() => setOpen(false)}
              className={cn(
                "rounded-full border border-border px-4 py-2.5 text-center text-sm font-semibold text-foreground transition-colors hover:bg-secondary",
                FOCUS,
              )}
            >
              {authed ? "Open app" : "Log in"}
            </a>
            <ChromeStoreButton className="w-full justify-center" onClick={() => setOpen(false)} />
          </div>
        </nav>
      </div>
    </header>
  );
}
