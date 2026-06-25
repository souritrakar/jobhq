# Browser Agent Workflow (for background running)

Initial state: Given Job Posting URL
Final (ideal aim) state: Apply to Job (preferably with the user's actual account, or a proxy account with AgentMail (with original_inbox+userId@agentmail.com format for unlimited emails.))

Given job posting URL:

Step 1: Navigate to public job posting
Step 2: Gather relevant job details and initial prep work
Step 3: Start applying.

Scenario 1: Does not require signing in - use AI to fill in the fields and answers (tailored to user profile). Email and contact number used is user's


Scenario 2: Requires signing in: 

# AgentMail Approach: Create new account using original_inbox+userId@agentmail.com, and once done, route the email to the user's original email.

Pros: Unlimited emails for lots of users
Cons: Platform might detect spam/invalid email

# User credentials approach: Signing in/up with user's credentials:

## Scenario 1: User has not created account - start creating, for email verification prompt the user, get MFA code, continue process,

## Scenario 2: User has created account - signing in: 
Cannot ask user to share password before hand. Thus user either has to login manually in the agent's browser. The agent then saves the current persistent cookies/auth tokens and encrypts it. Reuses it everytime from the saved vault.

Use browserbase to handle Auth, persisted context browser sessions

Once authenticated, go trhough all the steps of the application, prepare answers for questions and save them. do not auto apply.

If I don't have to fill form fields, all I require is just fetching of the data. Which drastically reduces my session usage time, whcih means I can accomodate many more jobs in 1 reused session per user.

Max concurrent sessions is 100
Session creation rate every 60 s is 50/min.
Key Insight: Reusing Saves Your Creation Rate
If a user's session is already alive (keepAlive), reconnecting doesn't consume your 150/min creation rate.

"Max Concurrent Browsers: The maximum number of browser sessions that you can run at the same time"

1 session = 1 browser. The concurrency limit applies to both as a single unified limit.

Auth/cookies persist only within the session's lifetime — once a session terminates (timeout or release), auth is gone
keepAlive keeps the session alive across disconnects, but still respects the timeout
After 6 hours, you must create a new session and re-authenticate
You are billed for the entire duration a keepAlive session is alive, even while disconnected - 0.12 dollars per hour



## Monitoring/tracking of a particular job posting if it has any changes/closing soon/deadlines/already closed.
Have not thought about this scenario yet.

Problems, concerns or doubts with the current approach:
How to handle concurrency of browsers? Is it 1 browser sesssion per user?


## Notes/rambling:

Do I even need browser agents?

Cotnext: This is a chrome extension. Anything from this context and view means that the user is already logged in (if not, it is on them to do so)

Browser agent/anything to do with in the background only implies that the user  just pastes the link/all the questions or view cannot be seen at once.

If everything can be seen at once (Ashby for example.),1  pager then just kick off a background job through the extension, with AI. Since we already have all the questions.

If everything cannot be seen at once, the ideal user experience is that they kick off the session in the background so that the AI can gather what questions are required. For this we need browser agents.

The simpler approach could be that if the user is logged in and everything cannot be seen at once, just use the user's device browser automation to quickly go through all the steps/tabs in the application. This might require dummy data filling for required fields to proceed to next page.

Thus the 2 options for the user: A - Run AI on page, B - Run AI in the background.

B is what we need browser agents for.



Architecture + Product Flow

User can save a job, if clicked Prep with AI, then it adds it to our USER_SAVED_JOBS_AI_PREP_QUEUE. It does not immediately spin up a browser session. This queue is more like a collection.

Once we have an enough number of saved jobs/maybe every N hours, or depending on available, for the USER_SAVED_JOBS_AI_PREP_QUEUE, we launch 1 browser session.

The goal is to keep it frictionless in terms of authentication/requiring to login.

Option A is agentmail
Option B is user manually logging in (but this will be difficult because they might have to do it for multiple platforms for the same QUEUE)

Investigate: Is it possible for the user to "integrate" or setup the platform login once, and reuse the same auth tokens multiple times? As in, through the extension we capture the login cookies.

We go throguh N jobs in the USER_SAVED_JOBS_AI_PREP_QUEUE in 1 session, N>=1, N<=length(USER_SAVED_JOBS_AI_PREP_QUEUE). Here N is between 1 and Length, because we also have to accomodate for other K-1 users, max is 100 concurrent sessions. Total K users. For each job, do the entire flow of going through the entire application, quickly capture questions, and then move on immediately to the next job. DO NOT RUN THE AI DURING A SESSION, THAT WILL BE DONE IN THE BACKGROUND TO REDUCE TIME SPENT FOR A SESSION.

SIMPLEST: If we reach more than 100 concurrent sessions, then if more sessions are required for other users, we simply queue it for when the existing 100 concurrent sessions start freeing up.

IDEAL: optimize archietcure so that we can reduce the queue time due to exceeding concurrency limits.

What is the simplest version of our idea?
Save any job posting details on the web to the app using the extension. 

Simplest version of details includes the core details, not the application questions necessarily - unless they are also visible in the job application.


Why? To go over and apply later. So essentially a sophisticated bookmark/excel sheet. But this might be better because I can atleast save it quickly for later without just saving links to excel or havign to extract job details myself and do all that extra effort to log it. So users might pay for the ability to do this + the other fluff like AI auto-prep answers, resume tailor etc. Baseline features of simplify.jobs

If we use AI-on-user-demand to extract job+application details, user might pay for that. simplifies architecture a lot.

Thus Save to Tracker is triggered by user. The eligibility of displaying will be deterministic, but the actual detection can be with an LLM to be robust and structured.

FOr popular sites maybe we can get away with deterministic and save a lot of costs.

What is the simplest way we can use AI without worrying about scale or complicated features:

Use AI to extract job details
Use AI to also extract questions, formulate answers according to resume. This includes automatic button pressing by the AI as well since some portals dont display the entire applciation at once

Future/additional features: Browser agent so that you don't even have to do the work of going to that page and waiting for the AI automation to go through to capture all the questions.

Should we even build a parser for linkedin -- even though we can get the job details, we cannot get application details.

Would it not make sense to just click apply button, and save the job from that website instead; the linkedin one seems useless.

Most/every application online is either autofill or auto-source jobs and mass-apply, which I don't think most people are excited about. auto-sourcing sounds good, will have to implement that as a feature, but auto-apply is mostly redundant due to the AI-generated slop answers.

Thus if we nail the experience of tracking/logging, along with reminders then we can get users to pay.