import { describe, expect, it } from "vitest"

import {
  extractQuestionsTiered,
  mapHarvestToQuestions,
  type HarvestedQuestionField,
} from "./questions-tiered"
import { buildPrototypeVectors } from "./prototype-embeddings"

describe("mapHarvestToQuestions — DOM kind/type → our 12-type vocab", () => {
  it("maps each control kind and refines text by native input type / label cues", () => {
    const fields: HarvestedQuestionField[] = [
      { id: "1", label: "Full name", kind: "text" },
      { id: "2", label: "Email", kind: "text", inputType: "email" },
      { id: "3", label: "LinkedIn profile", kind: "text" }, // inferred → url
      { id: "4", label: "Cover letter", kind: "textarea" },
      { id: "5", label: "Country", kind: "select", options: ["US", "UK"] },
      { id: "6", label: "Authorized to work?", kind: "radio", options: ["Yes", "No"] },
      { id: "7", label: "Skills", kind: "checkbox", options: ["React", "Vue"] }, // 2+ → multi_select
      { id: "8", label: "I agree to the terms", kind: "checkbox" }, // lone → consent checkbox
      { id: "9", label: "Resume", kind: "file" },
      { id: "10", label: "Years of experience", kind: "text" }, // inferred → number
    ]
    const qs = mapHarvestToQuestions(fields)
    const byLabel = Object.fromEntries(qs.map((q) => [q.label, q.type]))
    expect(byLabel).toEqual({
      "Full name": "short_text",
      Email: "email",
      "LinkedIn profile": "url",
      "Cover letter": "long_text",
      Country: "select",
      "Authorized to work?": "radio",
      Skills: "multi_select",
      "I agree to the terms": "checkbox",
      Resume: "file",
      "Years of experience": "number",
    })
    expect(qs.find((q) => q.label === "Country")?.options).toEqual(["US", "UK"])
  })
})

/** One-hot stub: each label maps to a concept axis; noise concepts and question concepts are disjoint. */
const AXES = [
  "name", "email", "essay", "file", "consent", "links", "experience", "auth", "eeo", "salaryq",
  "search", "login", "newsletter", "cookie", "share", "other",
]
function vec(axis: string): number[] {
  return AXES.map((a) => (a === axis ? 1 : 0))
}
function classify(text: string): string {
  const s = text.toLowerCase()
  // noise first (so "Email me similar jobs" is newsletter, not email)
  if (/\bsearch\b|filter|sort results/.test(s)) return "search"
  if (/sign in|log in|\blogin\b|password|username|create an account|register|forgot/.test(s)) return "login"
  if (/newsletter|job alert|subscribe|email me similar|sign up for/.test(s)) return "newsletter"
  if (/cookie/.test(s)) return "cookie"
  if (/share this|follow us|back to search|save this job/.test(s)) return "share"
  // questions
  if (/resume|\bcv\b|upload|attach/.test(s)) return "file"
  if (/cover letter|why do you|tell us about|additional information|describe/.test(s)) return "essay"
  if (/e-?mail/.test(s)) return "email"
  if (/agree|consent|certify|terms/.test(s)) return "consent"
  if (/linkedin|github|portfolio|website|\burl\b/.test(s)) return "links"
  if (/experience|current title|current company|years/.test(s)) return "experience"
  if (/authorized|sponsorship|visa|work authorization/.test(s)) return "auth"
  if (/gender|race|ethnicity|veteran|disability|pronouns/.test(s)) return "eeo"
  if (/salary|compensation|notice period|desired/.test(s)) return "salaryq"
  if (/name/.test(s)) return "name"
  return "other"
}
const stub = async (texts: string[]) => texts.map((t) => vec(classify(t)))

describe("extractQuestionsTiered — embeddings inclusion gate", () => {
  it("keeps real questions and drops page noise", async () => {
    const fields: HarvestedQuestionField[] = [
      { id: "1", label: "Full name", kind: "text" },
      { id: "2", label: "Email", kind: "text", inputType: "email" },
      { id: "3", label: "Why do you want to work here?", kind: "textarea" },
      { id: "4", label: "Upload your resume", kind: "file" },
      { id: "5", label: "I agree to the terms and conditions", kind: "checkbox" }, // app consent → keep
      { id: "6", label: "Search this site", kind: "text" }, // noise → drop
      { id: "7", label: "Subscribe to our newsletter", kind: "checkbox" }, // noise → drop
      { id: "8", label: "Sign in to your account", kind: "text" }, // noise → drop
    ]
    const out = await extractQuestionsTiered(fields, {
      embed: stub,
      getPrototypes: () => buildPrototypeVectors(stub),
    })
    const kept = out.questions.map((q) => q.label).sort()
    expect(kept).toEqual(
      [
        "Email",
        "Full name",
        "I agree to the terms and conditions",
        "Upload your resume",
        "Why do you want to work here?",
      ].sort(),
    )
    expect(out.candidateCount).toBe(8)
    expect(out.keptCount).toBe(5)
  })

  it("returns an empty form with NO embed call when there are no fields", async () => {
    let calls = 0
    const counting = async (texts: string[]) => {
      calls++
      return texts.map((t) => vec(classify(t)))
    }
    const out = await extractQuestionsTiered([], {
      embed: counting,
      getPrototypes: () => buildPrototypeVectors(counting),
    })
    expect(out.questions).toEqual([])
    expect(out.candidateCount).toBe(0)
    expect(calls).toBe(0) // the "no application form" path is free
  })
})
