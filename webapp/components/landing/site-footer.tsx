import { Logo } from "./logo";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "#how-it-works" },
      { label: "Features", href: "#features" },
      { label: "FAQ", href: "#faq" },
      { label: "Add to Chrome", href: "#install" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Blog", href: "#" },
      { label: "Contact", href: "#" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "#" },
      { label: "Terms", href: "#" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card/50">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              The browser-native job tracker. Save any posting, never miss a
              deadline, and keep your whole search in one place.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="font-display text-sm font-bold text-foreground">{col.title}</h3>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} JobTracker. Built for job seekers who
            apply everywhere.
          </p>
          <div className="flex items-center gap-3">
            {["X", "GitHub", "LinkedIn"].map((s) => (
              <a
                key={s}
                href="#"
                aria-label={s}
                className="grid size-9 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
              >
                <span className="text-xs font-bold">{s[0]}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
