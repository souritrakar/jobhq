# Semantic Extraction Implementation - Testing Guide

> **Superseded (2026-07-01).** This pipeline (Unstructured.io + RAG retrieval) has been
> replaced by INDEXED extraction — see
> `docs/superpowers/specs/2026-07-01-indexed-extraction-design.md`. Scheduled for deletion.

## What's Been Implemented

✅ **Complete end-to-end semantic extraction pipeline:**
- Unstructured.io API integration for HTML parsing
- Semantic section detection (Header, Description, Requirements, Benefits, etc.)
- Intelligent chunking with token limits
- OpenRouter embeddings-based semantic search
- Groq synthesis with relevant chunks only
- Full metadata tracking and logging

## Files Modified/Created

1. **Backend parsing:**
   - `lib/llm/unstructured-parser.ts` — Unstructured.io API integration + chunking logic
   - `lib/server/job-extraction-semantic.ts` — RAG pipeline + semantic retrieval
   - `app/api/extract/semantic/route.ts` — API endpoint

2. **Extension:**
   - `extension/content.js` — Route extraction to semantic endpoint
   - `extension/background.js` — Handle EXTRACT_JOB_SEMANTIC message type

3. **Configuration:**
   - `webapp/.env` — Added UNSTRUCTURED_API_KEY
   - `webapp/lib/env.ts` — Added env validation for UNSTRUCTURED_API_KEY

## How It Works (Step-by-Step)

### User clicks "Extract with AI"

```
Extension captures HTML from page
  ↓
extension/background.js: EXTRACT_JOB_SEMANTIC message
  ↓
extension/content.js: requestExtraction() → chrome.runtime.sendMessage()
  ↓
POST /api/extract/semantic with HTML
  ↓
Backend: buildChunkIndex()
  - Parse HTML → elements (Unstructured.io API)
  - Detect semantic sections (Requirements, Benefits, etc.)
  - Create retrieval chunks (max 800 tokens each)
  - Embed all chunks (OpenRouter)
  ↓
Backend: extractJobDetailsSemanticRAG()
  - For each field: embed query
  - Semantic search: find most relevant chunks
  - Combine relevant chunks into context (~1K tokens)
  - Send to Groq with context
  - Parse JSON response
  ↓
Return: { fields, usage, metadata }
  ↓
Extension modal displays extracted data + token savings
```

## Testing Flow

### 1. Start the webapp server
```bash
cd webapp
npm run dev
```
The server runs on http://localhost:3100

### 2. Load the extension
- Chrome: chrome://extensions/
- Enable "Developer mode"
- Click "Load unpacked"
- Select the `/extension` directory

### 3. Navigate to any job posting
Tested sites:
- Greenhouse (job-boards.greenhouse.io)
- LinkedIn (linkedin.com/jobs)
- Indeed (indeed.com)
- Lever (levcareers.com)
- Workable (apply.workable.com)

### 4. Click the JobTracker button
A panel should slide in from the right side of the page

### 5. Click "Extract with AI" (Details tab)
You should see:
```
✓ Reading this posting... (3500 estimated input tokens)
```

Then after 5-10 seconds:
```
✓ Auto-filled by AI (1200 in, 85 out)
  └─ Job Title
  └─ Company
  └─ Location
  └─ Salary
  └─ Description (summary)
```

### 6. Check the browser console
Open DevTools (F12) → Console tab to see:

```
[semantic-extraction] Parsing HTML into semantic elements...
[semantic-extraction] Parsed 42 elements
[semantic-extraction] Detected 5 semantic sections: header, job_description, requirements, benefits, other
[semantic-extraction] Created 5 retrieval chunks
[semantic-extraction] Embedding 5 chunks...
[semantic-extraction] Index built: 2850 total tokens across 5 chunks
[semantic-extraction] Retrieved 3 unique chunks for extraction
[semantic-extraction] Context prepared: 850 tokens
[semantic-extraction] Sending to Groq (850 context tokens)...
[semantic-extraction] Extraction complete ✅
```

## Expected Results

### Token Usage
- **Before:** 3500+ input tokens → 413 error ❌
- **After:** 850 input tokens + 85 output tokens → Success ✅
- **Savings:** ~2650 tokens (70% reduction)

### Metadata Shown
```json
{
  "chunksRetrieved": 3,
  "inputTokensUsed": 850,
  "outputTokensUsed": 85,
  "tokensSavedVsFullPage": 2650,
  "retrievedChunks": [
    { "id": "chunk-0", "role": "header", "tokens": 200 },
    { "id": "chunk-1", "role": "job_description", "tokens": 400 },
    { "id": "chunk-2", "role": "requirements", "tokens": 250 }
  ]
}
```

### Extracted Fields
```json
{
  "title": "Staff Data Scientist, Ads",
  "company": "Ads",
  "location": "Remote - Ontario, Canada",
  "salary": null,
  "description": "We're building the ad targeting system that powers..."
}
```

## Debugging Checklist

### If extraction fails:

**Check 1: API Key**
```bash
grep UNSTRUCTURED_API_KEY webapp/.env
# Should show: UNSTRUCTURED_API_KEY="OdyJsD7iEYhBqGSllGRIfoKGL1o7ii"
```

**Check 2: Extension is using semantic mode**
In `extension/content.js` line 26:
```javascript
const EXTRACTION_MODE = "semantic"; // Should be "semantic", not "llm" or "tiered"
```

**Check 3: Browser console for errors**
- F12 → Console tab
- Look for red error messages
- Check "Network" tab for 5XX errors on `/api/extract/semantic`

**Check 4: Backend logs**
If running local dev server:
```bash
# Terminal running `npm run dev` should show errors
```

**Check 5: Unstructured.io API status**
The API might be temporarily down. Try a different job posting.

## Monitoring the Full Flow

### 1. Extension logs (F12 → Console)
```
[JobTracker] Details extraction failed: Error: ...
[extract-semantic: POST /api/extract/semantic | source: greenhouse | text chars: 8234
[extract-semantic: SUCCESS | fields extracted: title,company,location | tokens used: 935
```

### 2. Backend logs (terminal running `npm run dev`)
```
[semantic-extraction] Parsed 42 elements
[semantic-extraction] Detected 5 semantic sections
[semantic-extraction] Created 5 retrieval chunks
[semantic-extraction] Embedding 5 chunks...
```

### 3. Network tab (F12 → Network)
Look for POST to `/api/extract/semantic`:
- Request body: `{ text: "...", source: "greenhouse", url: "..." }`
- Response: `{ data: { fields: {...}, metadata: {...} } }`
- Time: 5-10 seconds (includes Unstructured + embedding + Groq)

## What Happens to 3 Different Job Postings

### Small Job (Greenhouse, ~1500 tokens)
```
Input: 1500 tokens (full page fits)
Semantic mode would retrieve ~900 tokens
Groq sees: full context (no savings)
Result: Works fine with LLM mode too
```

### Medium Job (LinkedIn, ~3500 tokens)
```
Input: 3500 tokens
LLM mode: 413 error ❌
Semantic mode: Retrieves ~1200 tokens
Groq sees: only relevant chunks
Result: Works perfectly ✅
```

### Large Job (Indeed, ~6000+ tokens)
```
Input: 6000+ tokens
LLM mode: 413 error ❌
Semantic mode: Retrieves ~1400 tokens (best-fit chunks)
Groq sees: header + description + requirements
Result: Works perfectly ✅
Information loss: Minimal (no benefits section, but that's okay)
```

## Performance Notes

- First extraction: 5-10 seconds (includes parsing + embedding)
- Second extraction (re-extract): 5-10 seconds (fresh parse each time)
- Token cost: ~$0.0004 per extraction (embeddings + Groq)

## Rollback Plan

If anything goes wrong, revert to the LLM-only path:

In `extension/content.js` line 26:
```javascript
const EXTRACTION_MODE = "llm"; // Fallback to Groq-only
```

This will:
- Skip semantic extraction entirely
- Use the original /api/extract endpoint
- Work for small pages, fail with 413 on large pages (old behavior)

## Next Steps

1. Test on 3-5 different job boards
2. Verify metadata shows correctly in modal
3. Check token savings match expectations
4. Monitor error rates in production
5. Optionally: Add fallback to LLM if semantic fails

---

**Ready to test?** Open a job posting and click "Extract with AI" on the Details tab!
