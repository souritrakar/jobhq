import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  composeSalary,
  mapEmploymentEnum,
  mapJobPostingToFields,
  mapMetaTags,
  mapWorkplaceEnum,
  mergeExtracted,
  parseJsonLdJobPostings,
  stripHtml,
} from "./structured-data"

describe("parseJsonLdJobPostings", () => {
  it("extracts a bare JobPosting object", () => {
    const out = parseJsonLdJobPostings([JSON.stringify({ "@type": "JobPosting", title: "Engineer" })])
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe("Engineer")
  })

  it("finds JobPosting nodes inside @graph and arrays, ignoring other types", () => {
    const graph = JSON.stringify({
      "@graph": [
        { "@type": "Organization", name: "Acme" },
        { "@type": "JobPosting", title: "A" },
      ],
    })
    const arr = JSON.stringify([{ "@type": "BreadcrumbList" }, { "@type": "JobPosting", title: "B" }])
    const out = parseJsonLdJobPostings([graph, arr])
    expect(out.map((n) => n.title).sort()).toEqual(["A", "B"])
  })

  it("handles an array-valued @type", () => {
    const out = parseJsonLdJobPostings([JSON.stringify({ "@type": ["JobPosting", "Thing"], title: "X" })])
    expect(out).toHaveLength(1)
  })

  it("skips malformed JSON without throwing, keeping the valid blobs", () => {
    const out = parseJsonLdJobPostings(["{ not json", JSON.stringify({ "@type": "JobPosting", title: "OK" })])
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe("OK")
  })

  it("returns [] when there is no JobPosting", () => {
    expect(parseJsonLdJobPostings([JSON.stringify({ "@type": "WebPage" })])).toEqual([])
  })
})

describe("mapJobPostingToFields", () => {
  it("maps the full Greenhouse-style fixture to our fields", () => {
    const raw = readFileSync(join(__dirname, "__fixtures__", "greenhouse-jobposting.jsonld"), "utf8")
    const [node] = parseJsonLdJobPostings([raw])
    const fields = mapJobPostingToFields(node)
    expect(fields.title).toBe("Senior Backend Engineer")
    expect(fields.company).toBe("Acme Corp")
    expect(fields.location).toBe("Berlin, BE, DE")
    expect(fields.employmentType).toBe("Full-time")
    expect(fields.workplaceType).toBe("Remote") // TELECOMMUTE
    expect(fields.salary).toBe("€90,000 - €120,000/yr")
    // Description HTML is stripped to text, list items kept on their own lines.
    expect(fields.description).toContain("Senior Backend Engineer")
    expect(fields.description).not.toContain("<")
  })

  it("reads a string hiringOrganization and a string jobLocation", () => {
    const fields = mapJobPostingToFields({
      "@type": "JobPosting",
      title: "Dev",
      hiringOrganization: "Globex",
      jobLocation: "Remote, US",
    })
    expect(fields.company).toBe("Globex")
    expect(fields.location).toBe("Remote, US")
  })

  it("takes the first mappable value from an employmentType array", () => {
    const fields = mapJobPostingToFields({ "@type": "JobPosting", employmentType: ["CONTRACTOR", "OTHER"] })
    expect(fields.employmentType).toBe("Contract")
  })
})

describe("composeSalary", () => {
  it("formats a min/max MonetaryAmount with currency and period", () => {
    expect(
      composeSalary({ currency: "USD", value: { minValue: 120000, maxValue: 150000, unitText: "YEAR" } }),
    ).toBe("$120,000 - $150,000/yr")
  })
  it("formats a single value", () => {
    expect(composeSalary({ currency: "GBP", value: { value: 80000, unitText: "YEAR" } })).toBe("£80,000/yr")
  })
  it("passes a plain string through", () => {
    expect(composeSalary("Competitive")).toBe("Competitive")
  })
  it("returns '' for an empty/unusable amount", () => {
    expect(composeSalary({ currency: "USD", value: {} })).toBe("")
    expect(composeSalary(null)).toBe("")
  })
})

describe("mapEmploymentEnum / mapWorkplaceEnum", () => {
  it("maps schema codes and display strings to our vocab", () => {
    expect(mapEmploymentEnum("FULL_TIME")).toBe("Full-time")
    expect(mapEmploymentEnum("Part-time")).toBe("Part-time")
    expect(mapEmploymentEnum("CONTRACTOR")).toBe("Contract")
    expect(mapEmploymentEnum("INTERN")).toBe("Internship")
    expect(mapEmploymentEnum("PER_DIEM")).toBe("") // not in our vocab → drop
  })
  it("maps workplace signals", () => {
    expect(mapWorkplaceEnum("TELECOMMUTE")).toBe("Remote")
    expect(mapWorkplaceEnum("Hybrid")).toBe("Hybrid")
    expect(mapWorkplaceEnum("On-site")).toBe("On-site")
    expect(mapWorkplaceEnum("flexible")).toBe("")
  })
})

describe("mapMetaTags", () => {
  it("falls back to og/twitter/description for title + description, but NOT company", () => {
    const fields = mapMetaTags({
      "og:title": "Staff Engineer",
      "og:site_name": "Greenhouse", // the ATS name, not the employer — must NOT become company
      "og:description": "<b>Build</b> great things",
    })
    expect(fields).toEqual({ title: "Staff Engineer", description: "Build great things" })
    expect(fields.company).toBeUndefined()
  })
})

describe("stripHtml", () => {
  it("removes tags and decodes common entities", () => {
    expect(stripHtml("<p>Hello &amp; welcome</p>")).toBe("Hello & welcome")
  })
})

describe("mergeExtracted", () => {
  it("lets earlier (higher-fidelity) layers win per field", () => {
    const merged = mergeExtracted({ title: "A", company: "" }, { title: "B", company: "Acme" })
    expect(merged).toEqual({ title: "A", company: "Acme" })
  })
})
