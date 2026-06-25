# JobTracker — Product Goals

> **Living product document.** Captures *what* we're building and *why*, not *how*.
> Technical implementation details are intentionally left out — they will change.
> Last updated: 2026-06-22

---

## 🎯 Core Product Idea (the one thing to remember)

**A browser extension that lets job seekers capture, track, and get reminded about job
postings from anywhere on the web — not just LinkedIn — backed by a cloud app that
monitors postings and helps you actually apply.**

You're browsing. You find a job worth applying to. One click saves it. From that moment
the product takes over the annoying parts: it logs the role, remembers the deadline,
tracks where you are in the process, watches the posting for changes, and (optionally)
prepares your application materials in the background — so a job you found never quietly
slips away.

The extension is the **capture surface**. The web app is the **command center**.

**The core hook / wedge:** *"Never lose a job posting again."* Universal capture + tracking
+ reminders/monitoring is the identity of the product and the first value users come for.
AI-assisted applying is a powerful bonus layered on top — not the lead.

---

## Who it's for

**Primary audience: younger, tech-savvy job seekers** — students, new grads,
developers, and early-career millennials/Gen Z who are comfortable with browser
extensions and SaaS tools and are applying at high volume.

- **High-volume active applicants** hitting many companies and platforms at once.
- People who apply to jobs **outside LinkedIn** — company career pages, Greenhouse,
  Lever, Indeed, startup job boards, postings shared on X/Slack/Discord — and have no
  single place to keep track of them.
- **Students, new grads, and developers** juggling dozens of applications, deadlines,
  and follow-ups — often during crunch periods (intern season, new-grad recruiting).
- Anyone frustrated that LinkedIn's "Saved Jobs" only works inside LinkedIn and offers
  no real reminders, status tracking, or monitoring.

Messaging and UX should optimize for this younger, tech-comfortable segment first.

---

## The problems we're solving

1. **Job tracking is fragmented.** Postings live across dozens of sites; there's no
   universal "save this job" that works everywhere.
2. **Saved jobs get forgotten.** No reminders, no deadline awareness → opportunities
   expire unnoticed.
3. **No visibility into your own pipeline.** Hard to see what you've applied to, what's
   pending, what needs follow-up, and what stage each application is at.
4. **Postings change or disappear** and you don't find out until it's too late.
5. **Applying is repetitive and tedious.** Re-tailoring a resume / filling forms for
   every role is exhausting and time-consuming.

---

## Core features

### Capture (the browser extension)
- **One-click save** of any job posting from any website.
- **Save by URL** — paste a link, or let the extension grab the current page URL
  automatically.
- **Automatic detail extraction** — pull title, company, deadline, and key details
  from the page so logging is effortless.
- **Application question capture** — pull the posting's application-form questions (any
  type: text, dropdown, multiple choice, numeric, link, file…) into the panel, so the
  questions you'd have to answer are captured alongside the job. User-triggered (the form
  is often behind an "Apply" click), and the groundwork for AI-assisted applying.
- **Flag questions for review** — star individual application questions (a hover-revealed
  flag) to mark the ones worth coming back to; the flags persist with the job and set up
  future review surfacing / reminders.
- Works on **LinkedIn and the open web** alike (career pages, Greenhouse, Lever,
  Indeed, etc.).

### Track & organize
- **Automatic logging** of every saved job into a personal pipeline.
- **Application status / progress tracking** (e.g. saved → applied → interviewing →
  outcome).
- **Deadline capture** so nothing is left to memory.

### Remind & monitor (the cloud advantage)
- **Reminders** for deadlines and follow-ups — the thing LinkedIn Saved Jobs can't do.
- **Automatic monitoring** of postings (e.g. still open? changed? closing soon?),
  running in the cloud without you keeping a tab open.

---

## Why it's better than what exists today

1. **Universal** — works for *any* job application on the web, not just LinkedIn.
2. **Effortless logging & tracking**, including application status/progress.
3. **Easy detail + deadline extraction** from any posting.
4. **Real reminders and automatic monitoring** — not possible in LinkedIn Saved Jobs or
   most trackers.

---

## Planned / future features

### Background application assistant — *experimental, later bet*
> Not a near-term core goal. Ship universal capture + tracking + reminders first;
> this is a future direction to validate once the core loop works.

- On save, the AI can **work in the background to prepare your application** — tailoring
  resume content, drafting cover letters, and pre-filling form fields against the job
  description.
- Similar in spirit to resume optimizers / auto-appliers (e.g. Simplify), but
  **runs unattended in the cloud** — you don't have to be present.

### The web app (SaaS command center)
- **Dashboard** showing your whole pipeline: current status, the job tracker/logger,
  upcoming deadlines.
- **Resume generator** and **cover letter generator** as core value-adds.
- **Opportunity / job-finding agent** — proactively scans social media and public
  signals (recent posts, hiring signals) to surface roles you haven't found yet.

---

## Product shape & funnel (high level)

- **Extension = acquisition + daily-use surface.** It's where users capture jobs and
  get value immediately, with little friction.
- **Web app = retention + monetization surface.** The dashboard, reminders, monitoring,
  and AI assistance are the reasons to come back and to pay.
- The extension funnels users into the web app, where the higher-value (and
  cloud-powered) features live.

**Monetization: not yet decided.** The product is built to scale to many users and to
monetize eventually, but the specific model (freemium subscription, paid AI usage,
etc.) and the free/paid line are open. To be revisited as the core loop is validated.

---

## Guiding principles

- **Frictionless capture** — saving a job must be effortless and work anywhere.
- **Nothing falls through the cracks** — reminders and monitoring are the emotional core.
- **Do the tedious work for the user** — let background AI handle the repetitive parts.
- **Scalable & cost-effective by design** — built to grow to many users and monetize.

---

## Decisions locked in (2026-06-17)

- **Core hook:** Universal tracking + reminders ("never lose a job posting again").
  AI applying is a bonus, not the lead.
- **Primary audience:** Younger, tech-savvy job seekers — students, new grads,
  developers, early-career millennials/Gen Z.
- **AI auto-apply assistant:** Future / experimental — ship the core loop first.
- **Monetization:** Open / undecided (build to scale + monetize; model TBD).

## Open questions (still to resolve)

- Which job sources matter most at launch (LinkedIn-first, or open-web breadth)?
- What does "monitoring" concretely promise the user (still open? closing soon?
  reposted? salary/detail changes?) — and how often?
- Is there a collaboration/social angle (sharing pipelines, referrals) or strictly
  single-player?
- Roughly when do we want the AI application assistant to enter the roadmap?


# Extra things I'm adding to update it as of today:
### Bonus feature: When saving, I also have the option for the AI to do work in the background to prepare the form fields/ifnormation/resume according to that job description.

This is not that far from existing resume optimization or auto-appliers like simplify.jobs, but i guess it doesnt require you to be there always and can run in the background.

Running in the background/cloud should be utilized effectively such that it is optimal for the product and also is cost effective/scalable.

**Add auto-apply feature - use an AI browser agent to automatically visit the website and apply on the user’s behalf.**

An important edge case/scenario is websites that require signing in/auth. For this, we can let the user manually take over. But this has to be done very smoothly, to reduce the effort as much as possible for the user.

We can make it such that the user can easily do it from the extension (they will be prompted).

Bonus (paid) feature: Use something like AgentMail (Email API for AI agents) so that the agent applies using a new agent inbox, and forwards the confirmation email to the user’s email

1. Pros:
    1. Doesn’t require the user to authenticate anything manually
    2. Easier to automate
    3. Will charge for this (paid feature).
2. Cons
    1. AgentMail’s pricing page only offers upto 150 inboxes for startup plans, need to opt for custom Enterprise plan for unlimited inboxes. Will require a sales call.\



  