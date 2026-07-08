import type { Metadata } from "next";
import "./globals.css";

// The product typeface (self-hosted Satoshi) is declared as a global @font-face in
// globals.css, which also sets --font-google-sans. It is intentionally NOT loaded via
// next/font/local: that generates a *.module.css which @tailwindcss/postcss fills with
// Preflight, breaking Turbopack's CSS-Modules purity check. See the note in globals.css.

export const metadata: Metadata = {
  title: "jobhq | Save and track job applications in one place",
  description:
    "Save any job posting in one click from LinkedIn, Indeed, Greenhouse, or any careers page. jobhq captures deadlines, tracks your applications, and reminds you before postings close. Free Chrome extension.",
  keywords: [
    "job application tracker",
    "save jobs chrome extension",
    "job search organizer",
    "track job applications",
    "application deadline reminders",
  ],
  openGraph: {
    title: "jobhq: save jobs in one click, track them in one place",
    description:
      "Save any job from anywhere on the web in one click. Track deadlines and applications, and get reminded before postings close.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      // Browser extensions (password managers, recorders, one-sec, etc.) inject attributes onto
      // <html>/<body> before React hydrates, which otherwise throws a hydration-mismatch overlay
      // on every full page load (e.g. the hard navigation after sign-out). Standard Next.js fix.
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
