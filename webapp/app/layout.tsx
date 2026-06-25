import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// EXPERIMENT: Excon (Fontshare) as the single product typeface — headings, body, UI,
// and mockups all share it for one consistent voice. Self-hosted variable woff2 spanning
// the 100–800 weight range. The variable name stays --font-google-sans so the
// design-system theme.css mappings need no change; swap the src below to experiment with
// another face (outfit.woff2 / pally.woff2 are also vendored in ./fonts).
const googleSans = localFont({
  variable: "--font-google-sans",
  display: "swap",
  src: [{ path: "./fonts/satoshi.woff2", weight: "300 900", style: "normal" }],
});

export const metadata: Metadata = {
  title: "JobTracker — Save & track jobs from anywhere | Chrome extension",
  description:
    "Save any job posting in one click — LinkedIn, Indeed, Greenhouse, or any careers page. JobTracker captures deadlines, tracks your applications, and reminds you before postings close. Free Chrome extension.",
  keywords: [
    "job application tracker",
    "save jobs chrome extension",
    "job search organizer",
    "track job applications",
    "application deadline reminders",
  ],
  openGraph: {
    title: "JobTracker — Never lose a job posting again",
    description:
      "Save any job from anywhere on the web in one click. Track deadlines, applications, and get reminded before postings close.",
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
      className={`${googleSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
