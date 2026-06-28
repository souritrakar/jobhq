import { describe, expect, it } from "vitest"

import { extractDetailsTiered } from "./details-tiered"
import { buildPrototypeVectors } from "./prototype-embeddings"
import type { StructuredSignals } from "./structured-data"

/**
 * Deterministic stub embedder for details: a one-hot vector per concept, so a segment key and a field
 * prototype that share a concept score 1 and everything else 0 — no network, fully predictable. Used
 * for BOTH the prototype vectors and the runtime vectors so they live in the same space.
 */
const AXES = ["salary", "location", "employment", "workplace", "fulltime", "remoteval", "other"]
function vec(axis: string): number[] {
  return AXES.map((a) => (a === axis ? 1 : 0))
}
function concept(text: string): string {
  const s = text.toLowerCase()
  if (/salary|compensation|\bpay\b|remuneration|wage/.test(s)) return "salary"
  if (/location|based in|office|\bcity\b|region|place of work/.test(s)) return "location"
  if (/employment type|job type|contract type|position type|schedule|work type|engagement/.test(s))
    return "employment"
  if (/workplace|work arrangement|work setting|remote policy|location type|remote or/.test(s))
    return "workplace"
  if (/full-?time|permanent/.test(s)) return "fulltime"
  if (/\bremote\b|hybrid|on-?site/.test(s)) return "remoteval"
  return "other"
}

const signals = (over: Partial<StructuredSignals>): StructuredSignals => ({
  jsonLd: [],
  meta: {},
  segments: [],
  ...over,
})

describe("extractDetailsTiered — tier 1 (structured data)", () => {
  it("fills everything from JSON-LD and makes ZERO embed calls", async () => {
    let calls = 0
    const embed = async (texts: string[]) => {
      calls++
      return texts.map((t) => vec(concept(t)))
    }
    const node = {
      "@type": "JobPosting",
      title: "Eng",
      hiringOrganization: { name: "Acme" },
      jobLocation: { address: { addressLocality: "NYC" } },
      baseSalary: { currency: "USD", value: { minValue: 100000, maxValue: 120000, unitText: "YEAR" } },
      employmentType: "FULL_TIME",
      jobLocationType: "TELECOMMUTE",
      description: "Hi",
    }
    const out = await extractDetailsTiered(signals({ jsonLd: [JSON.stringify(node)] }), {
      embed,
      getPrototypes: () => buildPrototypeVectors(embed),
    })
    expect(out.fields).toMatchObject({
      title: "Eng",
      company: "Acme",
      location: "NYC",
      salary: "$100,000 - $120,000/yr",
      employmentType: "Full-time",
      workplaceType: "Remote",
    })
    expect(out.description).toBe("Hi")
    expect(out.tiers).toEqual(["jsonld"])
    expect(calls).toBe(0) // a fully-structured page costs nothing
  })

  it("uses meta tags as a fallback for the title (but never company — og:site_name is the ATS)", async () => {
    const embed = async (texts: string[]) => texts.map((t) => vec(concept(t)))
    const out = await extractDetailsTiered(
      signals({ meta: { "og:title": "Staff Engineer", "og:site_name": "Greenhouse" } }),
      { embed, getPrototypes: () => buildPrototypeVectors(embed) },
    )
    expect(out.fields.title).toBe("Staff Engineer")
    expect(out.fields.company).toBeUndefined()
    expect(out.tiers).toEqual(["meta"])
  })
})

describe("extractDetailsTiered — tier 2 (embeddings over segments)", () => {
  it("maps page segments to the missing attribute fields and snaps the enum", async () => {
    const embed = async (texts: string[]) => texts.map((t) => vec(concept(t)))
    const out = await extractDetailsTiered(
      signals({
        h1: "Senior Engineer",
        segments: [
          { key: "Salary", value: "$120k - $150k" },
          { key: "Location", value: "Berlin, Germany" },
          { key: "Job type", value: "Permanent" }, // not in the enum dict → snapped via embedding
        ],
      }),
      { embed, getPrototypes: () => buildPrototypeVectors(embed) },
    )
    expect(out.fields.title).toBe("Senior Engineer") // from h1
    expect(out.fields.salary).toBe("$120k - $150k")
    expect(out.fields.location).toBe("Berlin, Germany")
    expect(out.fields.employmentType).toBe("Full-time") // "Permanent" snapped to the vocab
    expect(out.fields.workplaceType).toBeUndefined() // no segment for it → stays absent (honest)
    expect(out.fields.company).toBeUndefined() // never fabricated → modal's blank-company warning fires
    expect(out.tiers).toContain("embeddings")
  })

  it("returns nothing for a barren page (so the blank-field warnings fire as today)", async () => {
    const embed = async (texts: string[]) => texts.map((t) => vec(concept(t)))
    const out = await extractDetailsTiered(signals({}), {
      embed,
      getPrototypes: () => buildPrototypeVectors(embed),
    })
    expect(out.fields).toEqual({})
    expect(out.description).toBeUndefined()
  })
})
