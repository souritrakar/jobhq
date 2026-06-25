import type { Metadata } from "next"

/**
 * Mock job posting — a faithful clone of an Ashby "Overview" page (the GPTZero
 * "Sr. Product Designer" posting) used to probe how third-party extensions
 * (e.g. Simplify.jobs) detect and overlay job pages.
 *
 * Why it's shaped this way:
 *  - It carries a real schema.org JSON-LD <JobPosting> block, the primary signal
 *    ATS-aware extensions read.
 *  - The visible DOM mirrors Ashby's structure: company header, <h1> title,
 *    Overview/Application tabs, a left detail sidebar (Location / Employment Type /
 *    Location Type / Department / Compensation), and a description body.
 *  - It deliberately does NOT render Simplify's "Resume Match" widget — that is the
 *    thing Simplify injects. Leaving it out lets us observe their extension at work.
 *
 * This is a static dev fixture; no data layer, no auth.
 */

export const metadata: Metadata = {
  title: "Sr. Product Designer @ GPTZero (mock)",
  robots: { index: false, follow: false },
}

const JOB = {
  company: "Test",
  companyUrl: "https://gptzero.me",
  title: "Junior Backend Product Designer",
  location: "LA Hybrid",
  employmentType: "Full time",
  locationType: "Hybrid",
  department: "Engineering",
  compensation: "$120K – $185K • Offers Equity",
}

// schema.org JobPosting — the structured signal ATS-aware extensions parse first.
const JOB_POSTING_LD = {
  "@context": "https://schema.org/",
  "@type": "JobPosting",
  title: JOB.title,
  description:
    "<p>GPTZero is on a mission to restore trust and transparency in the age of AI. " +
    "As the leading AI detection platform, we empower educators, students, marketers, and " +
    "writers to navigate the evolving landscape of AI.</p>" +
    "<p>We're seeking a talented Senior Product Designer who's passionate about building " +
    "intuitive, beautiful products that millions of people rely on. You'll own design end " +
    "to end — from research and wireframes to polished, shipped interfaces.</p>" +
    "<h3>What you'll do</h3><ul>" +
    "<li>Lead design for core product surfaces across web and mobile.</li>" +
    "<li>Partner closely with engineering and product to ship quickly.</li>" +
    "<li>Build and evolve our design system.</li></ul>" +
    "<h3>What we're looking for</h3><ul>" +
    "<li>5+ years of product design experience.</li>" +
    "<li>A strong portfolio of shipped, consumer-grade work.</li>" +
    "<li>Fluency in Figma and modern prototyping tools.</li></ul>",
  datePosted: "2026-05-15",
  validThrough: "2026-08-15",
  employmentType: "FULL_TIME",
  hiringOrganization: {
    "@type": "Organization",
    name: JOB.company,
    sameAs: JOB.companyUrl,
  },
  jobLocation: {
    "@type": "Place",
    address: {
      "@type": "PostalAddress",
      addressLocality: "New York",
      addressRegion: "NY",
      addressCountry: "US",
    },
  },
  baseSalary: {
    "@type": "MonetaryAmount",
    currency: "USD",
    value: {
      "@type": "QuantitativeValue",
      minValue: 20000,
      maxValue: 75000,
      unitText: "YEAR",
    },
  },
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ borderBottom: "1px solid #ececec", padding: "16px 0" }}>
      <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 15, color: "#1f2328" }}>{value}</div>
    </div>
  )
}

export default function MockJobPage() {
  return (
    <main
      style={{
        background: "#fff",
        color: "#1f2328",
        minHeight: "100vh",
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Structured data — the signal ATS-aware extensions read first. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JOB_POSTING_LD) }}
      />

      {/* Company header */}
      <header
        style={{
          borderBottom: "1px solid #ececec",
          padding: "20px 24px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <a
          href={JOB.companyUrl}
          style={{ fontWeight: 700, color: "#6d28d9", textDecoration: "none", fontSize: 18 }}
        >
          {JOB.company}
        </a>
      </header>

      <div
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          padding: "40px 24px",
          display: "grid",
          gridTemplateColumns: "300px 1fr",
          gap: 48,
        }}
      >
        {/* Left: title + detail sidebar */}
        <aside>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 32px" }}>{JOB.title}</h1>
          <DetailRow label="Location" value={JOB.location} />
          <DetailRow label="Employment Type" value={JOB.employmentType} />
          <DetailRow label="Location Type" value={JOB.locationType} />
          <DetailRow label="Department" value={JOB.department} />
          <DetailRow label="Compensation" value={JOB.compensation} />
        </aside>

        {/* Right: tabs + description */}
        <section>
          <nav
            role="tablist"
            style={{ display: "flex", gap: 28, borderBottom: "1px solid #ececec", marginBottom: 28 }}
          >
            <a
              role="tab"
              aria-selected="true"
              href="#overview"
              style={{
                padding: "8px 2px",
                color: "#2563eb",
                borderBottom: "2px solid #2563eb",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Overview
            </a>
            <a
              role="tab"
              aria-selected="false"
              href="#application"
              style={{ padding: "8px 2px", color: "#6b7280", textDecoration: "none" }}
            >
              Application
            </a>
          </nav>

          <article style={{ fontSize: 15, lineHeight: 1.7, color: "#2b3138" }}>
            <p>
              GPTZero is on a mission to restore trust and transparency in the age of AI. As
              the leading AI detection platform, we empower educators, students, marketers, and
              writers to navigate the evolving landscape of AI. With millions of users and
              institutions relying on us, we're building the defining company at the
              intersection of AI and information integrity.
            </p>
            <p>
              Our team comes from high-performing engineering cultures, including Perplexity,
              AWS, Affirm, and leading AI research labs, including OpenAI and the Vector
              Institute.
            </p>
            <p>
              We're seeking a talented Senior Product Designer who's passionate about building
              intuitive, beautiful products that millions of people rely on. You'll own design
              end to end — from research and wireframes to polished, shipped interfaces.
            </p>
            <h3 style={{ fontSize: 17, fontWeight: 700, margin: "28px 0 10px" }}>
              What you'll do
            </h3>
            <ul style={{ paddingLeft: 20, margin: 0 }}>
              <li>Lead design for core product surfaces across web and mobile.</li>
              <li>Partner closely with engineering and product to ship quickly.</li>
              <li>Build and evolve our design system.</li>
            </ul>
            <h3 style={{ fontSize: 17, fontWeight: 700, margin: "28px 0 10px" }}>
              What we're looking for
            </h3>
            <ul style={{ paddingLeft: 20, margin: 0 }}>
              <li>5+ years of product design experience.</li>
              <li>A strong portfolio of shipped, consumer-grade work.</li>
              <li>Fluency in Figma and modern prototyping tools.</li>
            </ul>
          </article>
        </section>
      </div>
    </main>
  )
}
