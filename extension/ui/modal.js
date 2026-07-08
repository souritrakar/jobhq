// Save panel — a right-anchored, non-modal drawer rendered in a Shadow DOM. It slides in from
// the edge, leaves the page fully interactive, and is dismissed only via its own controls
// (X closes; chevron collapses to a reopen handle; Esc closes). Three tabs:
//   • Details     — the parsed job, shown as an editable identity + property list and a clean
//                   rendered description (progressive disclosure). Auto-extracts on open.
//   • Application — the form's questions, a user-triggered, progress-tracked review.
//   • Resume      — the user's documents (placeholder) with upload, plus stalled "generate
//                   tailored resume / cover letter" actions (UI/seam only; no backend yet).
// Exposes JobTracker.ui.modal.open(job, { onConfirm, dashboardUrl, extraction, ... }).
// Isolated-world global. The dynamic application fields live in ui/application.js.
(function (root) {
  const NS = (root.JobTracker = root.JobTracker || {});
  const UI = (NS.ui = NS.ui || {});

  const HOST_ID = "jobtracker-modal-host";
  const SVGNS = "http://www.w3.org/2000/svg";
  const PREF_KEY = "jt:aiPrep";
  const CLAMP_PX = 168; // collapsed height of a long description before "Show more"

  // lucide-style line icons (24×24 stroke geometry), drawn at currentColor.
  const ICON = {
    bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
    text: '<line x1="21" x2="3" y1="6" y2="6"/><line x1="15" x2="3" y1="12" y2="12"/><line x1="17" x2="3" y1="18" y2="18"/>',
    collapse: '<path d="m6 17 5-5-5-5"/><path d="m13 17 5-5-5-5"/>',
    expand: '<path d="m15 18-6-6 6-6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    sparkles:
      '<path d="M9.94 14.06A2 2 0 0 0 8.5 12.6l-5.1-1.32a.5.5 0 0 1 0-.96L8.5 9a2 2 0 0 0 1.44-1.44l1.32-5.1a.5.5 0 0 1 .96 0l1.32 5.1A2 2 0 0 0 15 9l5.1 1.32a.5.5 0 0 1 0 .96L15 12.6a2 2 0 0 0-1.44 1.46l-1.32 5.1a.5.5 0 0 1-.96 0z"/><path d="M19 3v4"/><path d="M21 5h-4"/>',
    clipboard:
      '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6"/><path d="M9 16h6"/>',
    refresh:
      '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    mapPin:
      '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    salary:
      '<line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    link:
      '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    flag: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
    alert:
      '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    file:
      '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
    upload:
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
    download:
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    wand:
      '<path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/>',
    penLine:
      '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    listTodo:
      '<rect x="3" y="5" width="6" height="6" rx="1"/><path d="m3 17 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  };

  // Pipeline status the user can set as they save. Mirrors the web app's JobStatus enum + order
  // (webapp/prisma/schema.prisma, StatusMenu). The value is sent with the save and, once the job
  // is tracked, a change PATCHes it — so it stays in step with the job page.
  const STATUS_LIST = [
    ["SAVED", "Saved"],
    ["APPLIED", "Applied"],
    ["INTERVIEWING", "Interviewing"],
    ["OFFER", "Offer"],
    ["REJECTED", "Rejected"],
    ["ARCHIVED", "Archived"],
  ];
  const STATUS_SET = new Set(STATUS_LIST.map(([v]) => v));
  const STATUS_LABEL = Object.fromEntries(STATUS_LIST);
  const statusClass = (v) => "st-" + String(STATUS_SET.has(v) ? v : "SAVED").toLowerCase();

  let host = null;
  let shadow = null;
  let lastFocus = null;
  let overlayEl = null;
  let panelEl = null;
  let reduceMotion = false;
  // Set by open(): flushes the current Details snapshot to storage synchronously. Called on
  // close so the latest edits survive even when close is triggered by a navigation.
  let activeFlush = null;
  let activeOnClose = null; // per-open close hook (deactivates the on-page field picker)

  // ---- design tokens (one source of truth; `all:initial` doesn't reset custom properties) ----
  // Neutral white + fern SaaS surface. Hue 250 = a cool, calm grey for text/lines/surfaces.
  function tokens() {
    return `
      :host{all:initial;
        --font:"Satoshi","Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",sans-serif;
        --bg:oklch(1 0 0);
        --bg-sunken:oklch(0.984 0.002 250);
        --bg-hover:oklch(0.972 0.003 250);
        --line:oklch(0.93 0.004 250);
        --line-strong:oklch(0.885 0.006 250);
        --ink:oklch(0.27 0.015 250);
        --ink-2:oklch(0.45 0.012 250);
        --ink-3:oklch(0.585 0.01 250);
        --accent:oklch(0.46 0.085 158);
        --accent-press:oklch(0.42 0.08 158);
        --accent-ink:oklch(0.33 0.055 160);
        --accent-bg:oklch(0.965 0.018 158);
        --accent-fg:oklch(0.985 0.005 160);
        --danger:oklch(0.55 0.16 25);
        --danger-bg:oklch(0.965 0.018 25);
        /* Star / "flagged for review" — warm clay, distinct from the evergreen accent and
           the red danger so "important" reads as its own semantic. */
        --star:oklch(0.66 0.115 50);
        --star-ink:oklch(0.52 0.1 48);
        /* Pipeline-status colours — a soft fill + a strong ink/dot per stage. Kept in lockstep
           with the web app's status tokens (design-system/tokens.css light values) so a status
           reads the same in the panel as on the board and the job page. */
        --status-saved:oklch(0.95 0.018 158); --status-saved-ink:oklch(0.45 0.07 158);
        --status-applied:oklch(0.95 0.02 60); --status-applied-ink:oklch(0.47 0.065 60);
        --status-interviewing:oklch(0.94 0.03 55); --status-interviewing-ink:oklch(0.48 0.085 55);
        --status-offer:oklch(0.93 0.03 156); --status-offer-ink:oklch(0.43 0.09 156);
        --status-rejected:oklch(0.95 0.022 35); --status-rejected-ink:oklch(0.5 0.1 33);
        --status-archived:oklch(0.95 0.004 90); --status-archived-ink:oklch(0.52 0.01 110);
        --r1:6px; --r2:8px; --r3:12px; --r4:16px;
        --shadow-panel:-10px 0 30px oklch(0.2 0.02 250 / .08);
        --ring:0 0 0 2px oklch(0.46 0.085 158 / .2);
      }`;
  }

  function css() {
    return (
      tokens() +
      `
      *{box-sizing:border-box;}

      /* Non-modal shell: never dims, never catches clicks — only .panel takes pointer events. */
      .overlay{position:fixed;inset:0;z-index:2147483647;display:flex;justify-content:flex-end;
        background:transparent;pointer-events:none;font-family:var(--font);color:var(--ink);}
      .panel{position:relative;pointer-events:auto;display:flex;flex-direction:column;height:100vh;
        width:min(384px,94vw);background:var(--bg);border-left:1px solid var(--line);
        box-shadow:var(--shadow-panel);transform:translateX(100%);
        transition:transform .28s cubic-bezier(.32,.72,0,1);}
      .panel.open{transform:none;}
      .overlay.collapsed .panel{transform:translateX(100%);}

      /* Reopen handle — pokes out at the edge while collapsed. */
      .handle{position:absolute;left:-34px;top:50%;transform:translateY(-50%);display:none;
        align-items:center;justify-content:center;width:34px;height:64px;border:none;
        border-radius:12px 0 0 12px;cursor:pointer;background:var(--accent);color:var(--accent-fg);
        box-shadow:-5px 0 14px oklch(0.28 0.02 250 / .12);}
      .handle:hover{background:var(--accent-press);}
      .handle svg{width:18px;height:18px;}
      .overlay.collapsed .handle{display:flex;}

      /* ---- shared primitives ---- */
      /* Section label — a quiet micro-cap kicker that anchors each content block
         (Description, Your notes). A distinct role from body text and from the in-content
         subheads, so the three no longer collide at one size. */
      .eyebrow{font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;
        color:var(--ink-3);}
      /* Section eyebrow with a small leading glyph (Your notes, To-do). */
      .eyebrow-hd{display:flex;align-items:center;gap:6px;}
      .eyebrow-ic{display:flex;flex:0 0 auto;color:var(--ink-3);}
      .eyebrow-ic svg{width:14px;height:14px;}
      .btn{font-family:var(--font);font-weight:600;font-size:14px;display:inline-flex;
        align-items:center;justify-content:center;gap:8px;cursor:pointer;border:1px solid transparent;
        border-radius:var(--r2);padding:10px 16px;text-decoration:none;line-height:1;
        transition:background .14s ease,border-color .14s ease,transform .1s ease,box-shadow .14s ease;}
      .btn svg{width:16px;height:16px;}
      .btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}
      .btn--primary{background:var(--accent);color:var(--accent-fg);
        box-shadow:0 1px 1px oklch(0.2 0.02 250 / .08);}
      .btn--primary:hover{background:var(--accent-press);}
      .btn--primary:active{transform:translateY(.5px);}
      .btn--primary[disabled]{opacity:.6;cursor:default;box-shadow:none;}
      .btn--ghost{background:var(--bg-sunken);color:var(--ink-2);border-color:var(--line-strong);}
      .btn--ghost:hover{background:var(--bg-hover);color:var(--ink);}
      .btn--lg{padding:11px 20px;border-radius:var(--r3);}
      .iconbtn{display:flex;align-items:center;justify-content:center;flex:0 0 auto;width:30px;
        height:30px;border:none;background:none;cursor:pointer;border-radius:8px;color:var(--ink-3);
        transition:background .12s ease,color .12s ease;}
      .iconbtn:hover{background:var(--bg-hover);color:var(--ink);}
      .iconbtn svg{width:18px;height:18px;}
      .iconbtn:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}

      /* ---- header (brand chrome) ---- */
      .head{display:flex;align-items:center;gap:11px;flex:0 0 auto;
        padding:13px 10px 13px 16px;border-bottom:1px solid var(--line);}
      .badge{display:flex;align-items:center;justify-content:center;flex:0 0 auto;width:32px;
        height:32px;border-radius:8px;overflow:hidden;background:var(--accent-bg);color:var(--accent-ink);}
      .badge svg{width:18px;height:18px;}
      .badge img.logo{width:100%;height:100%;object-fit:contain;background:var(--bg);}
      .titles{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1;}
      .titles h2{margin:0;font-size:15px;font-weight:600;letter-spacing:-0.01em;color:var(--ink);}
      .titles .sub{font-size:12px;color:var(--ink-3);white-space:nowrap;overflow:hidden;
        text-overflow:ellipsis;}

      /* ---- tabs (segmented pill control) ---- */
      /* A rounded track holding three equal-width tabs. The active tab lifts onto a white pill with
         a fern icon + label; the rest stay muted. Replaces the old underline tabs. */
      .tabs{flex:0 0 auto;display:flex;gap:4px;margin:12px 16px 6px;padding:4px;
        background:var(--bg-sunken);border:1px solid var(--line);border-radius:var(--r3);}
      .tab{flex:1 1 0;display:inline-flex;align-items:center;justify-content:center;gap:6px;
        font-family:var(--font);font-size:13px;font-weight:600;color:var(--ink-3);background:none;
        border:1px solid transparent;cursor:pointer;padding:7px 8px;border-radius:var(--r2);
        transition:color .14s ease,background .14s ease,border-color .14s ease,box-shadow .14s ease;}
      .tab:hover{color:var(--ink);}
      /* Active tab: filled fern pill with white icon + label (the inverse of the muted rest). */
      .tab[aria-selected="true"]{color:var(--accent-fg);background:var(--accent);
        border-color:transparent;box-shadow:0 1px 2px oklch(0.2 0.02 250 / .12);}
      .tab[aria-selected="true"]:hover{color:var(--accent-fg);}
      .tab svg{width:15px;height:15px;}
      .tab:focus-visible{outline:2px solid var(--accent);outline-offset:1px;}

      /* ---- scrollable body + panes ---- */
      .body{flex:1 1 auto;overflow:auto;display:flex;flex-direction:column;}
      .pane{flex:1 1 auto;display:flex;flex-direction:column;gap:14px;padding:16px 16px 20px;}
      .pane[hidden]{display:none;}

      /* reading indicator (extraction status, Details) */
      .finding{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:500;
        color:var(--accent-ink);}
      .finding svg{width:14px;height:14px;flex:0 0 auto;}
      .finding.muted{color:var(--ink-3);}

      /* ---- Details: "Extract with AI" card (idle → loading → done → error) ---- */
      /* A full-width card: a green icon tile, a two-line title/subtitle, and a trailing chevron.
         In its action states (idle / error) the whole card is clickable; loading + done are inert
         (done carries its own quiet Re-extract button in place of the chevron). */
      .dx-card{display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:12px 13px;
        border:1px solid var(--line);border-radius:var(--r3);background:var(--bg);font-family:var(--font);
        transition:border-color .14s ease,background .14s ease,box-shadow .14s ease;}
      .dx-card--action{cursor:pointer;}
      .dx-card--action:hover{border-color:var(--line-strong);background:var(--bg-hover);}
      .dx-card--action:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}
      .dx-card.err{border-color:var(--danger);}
      .dx-tile{display:flex;align-items:center;justify-content:center;flex:0 0 auto;width:38px;height:38px;
        border-radius:10px;background:var(--accent-bg);color:var(--accent-ink);}
      .dx-tile svg{width:19px;height:19px;}
      .dx-card.err .dx-tile{background:var(--danger-bg);color:var(--danger);}
      .dx-text{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px;}
      .dx-title{font-size:13.5px;font-weight:600;color:var(--ink);letter-spacing:-0.01em;}
      .dx-sub{font-size:12px;line-height:1.4;color:var(--ink-3);overflow-wrap:anywhere;}
      .dx-chev{flex:0 0 auto;display:flex;color:var(--ink-3);}
      .dx-chev svg{width:18px;height:18px;}
      /* Re-extract affordance (done state) — quiet, sits where the chevron was. */
      .dx-re{display:inline-flex;align-items:center;gap:5px;flex:0 0 auto;background:none;border:none;
        cursor:pointer;font-family:var(--font);font-size:12px;font-weight:600;color:var(--accent-ink);
        padding:4px 8px;border-radius:6px;transition:background .12s ease,color .12s ease;}
      .dx-re:hover{background:var(--accent-bg);}
      .dx-re svg{width:13px;height:13px;}
      .dx-re:focus-visible{outline:2px solid var(--accent);outline-offset:1px;}
      /* "Form detected — pick questions" nudge, shown under the subtitle after a done extraction. */
      .dx-hintbtn{align-self:flex-start;margin:4px 0 0 -6px;}
      @media (prefers-reduced-motion: no-preference){
        .dx-card--loading .dx-tile svg{animation:spin 1.4s linear infinite;}
      }

      /* ---- Details: identity + properties (Notion-style editable) ---- */
      /* Editable text field. cursor:text + a hover that reveals the field — soft fill plus a
         hairline inset border — so hovering ANY value visibly turns it into an input ("click to
         edit"), without cluttering the resting view with a border on every line. Focus deepens it
         to the accent ring. This is the whole affordance: quiet at rest, unmistakable on hover. */
      .di{width:100%;font-family:var(--font);color:var(--ink);background:transparent;border:none;
        border-radius:var(--r1);padding:5px 7px;cursor:text;
        transition:background .12s ease,box-shadow .12s ease;}
      .di::placeholder{color:var(--ink-3);}
      .di:hover{background:var(--bg-sunken);box-shadow:inset 0 0 0 1px var(--line-strong);}
      .di:focus{outline:none;background:var(--bg-sunken);box-shadow:var(--ring);}
      .di.pending::placeholder{color:var(--accent-ink);font-style:italic;}

      /* The identity inputs carry the same 7px inset as every field, but the property LABELS below
         sit flush at the pane edge — so pull the block back 7px to land the title/company text on
         the same left rule as Location/Salary/Link. The hover box simply breathes into the gutter. */
      .identity{display:flex;flex-direction:column;gap:1px;margin-left:-7px;}
      .jt-title{font-size:18px;font-weight:700;letter-spacing:-0.022em;line-height:1.25;}
      .jt-company{font-size:13.5px;font-weight:500;color:var(--ink-2);}

      /* ---- empty-important-field warnings (amber, reuses the star hue) ---- */
      /* Wraps an identity input so its blank-field marker can sit at the trailing edge. */
      .di-wrap{position:relative;display:flex;align-items:center;}
      .di-wrap .di{flex:1 1 auto;min-width:0;}
      .di-wrap .field-warn{position:absolute;right:7px;}
      .field-warn{display:inline-flex;align-items:center;color:var(--star-ink);}
      .field-warn svg{width:16px;height:16px;}
      /* Header row for a section eyebrow that can carry a trailing warning (Description). */
      .eyebrow-row{display:flex;align-items:center;gap:6px;}

      .props{display:flex;flex-direction:column;}
      .prop{display:flex;align-items:center;gap:10px;padding:7px 0;border-top:1px solid var(--line);}
      .prop:first-child{border-top:none;}
      .prop-label{flex:0 0 72px;font-size:12px;font-weight:500;letter-spacing:normal;
        text-transform:none;color:var(--ink-3);}
      .prop-val{flex:1 1 auto;min-width:0;font-size:14px;}
      /* Leading icon rendered inside the input (e.g. the url field's link glyph). */
      .prop-valwrap{position:relative;flex:1 1 auto;min-width:0;display:flex;align-items:center;}
      .prop-ic{position:absolute;left:8px;top:50%;transform:translateY(-50%);display:flex;
        color:var(--ink-3);pointer-events:none;}
      .prop-ic svg{width:15px;height:15px;}
      .prop-val--icon{padding-left:30px;}

      .meta{display:flex;flex-wrap:wrap;gap:6px;}
      .chip{font-size:11px;font-weight:600;padding:3px 9px;border-radius:6px;
        background:var(--accent-bg);color:var(--accent-ink);}

      /* ---- pipeline status picker ---- */
      /* A coloured status pill: its colour IS the status (dot + label ride currentColor), so the
         closed control reads exactly like the job page's status pill. Used both as the trigger
         (a button, with a caret) and as each menu row's swatch. */
      .statuspill{position:relative;display:inline-flex;align-items:center;gap:7px;
        padding:5px 11px;border:none;border-radius:999px;cursor:pointer;font-family:var(--font);
        transition:filter .12s ease,box-shadow .12s ease;}
      button.statuspill{padding-right:26px;}
      .statuspill:hover{filter:brightness(.97);}
      .statuspill:focus-visible{outline:none;box-shadow:var(--ring);}
      .statuspill .dot{width:7px;height:7px;border-radius:50%;background:currentColor;flex:0 0 auto;}
      .statuspill-lab{font-size:13px;font-weight:600;color:currentColor;line-height:1.4;white-space:nowrap;}
      .statuspill .chev{position:absolute;right:9px;top:50%;transform:translateY(-50%);display:flex;
        color:currentColor;opacity:.75;pointer-events:none;}
      .statuspill .chev svg{width:13px;height:13px;}
      .statuspill.st-saved{background:var(--status-saved);color:var(--status-saved-ink);}
      .statuspill.st-applied{background:var(--status-applied);color:var(--status-applied-ink);}
      .statuspill.st-interviewing{background:var(--status-interviewing);color:var(--status-interviewing-ink);}
      .statuspill.st-offer{background:var(--status-offer);color:var(--status-offer-ink);}
      .statuspill.st-rejected{background:var(--status-rejected);color:var(--status-rejected-ink);}
      .statuspill.st-archived{background:var(--status-archived);color:var(--status-archived-ink);}

      /* Status menu — a custom listbox (native <option>s can't carry the status colours). Opens
         upward from the footer, right-aligned to the trigger; each row is a full colour pill + a
         check on the current stage, mirroring the job page's StatusMenu. */
      .statuswrap{position:relative;display:inline-flex;}
      .statusmenu{position:absolute;right:0;bottom:calc(100% + 6px);z-index:10;display:none;
        flex-direction:column;gap:2px;min-width:190px;padding:6px;background:var(--bg);
        border:1px solid var(--line);border-radius:var(--r3);
        box-shadow:0 10px 28px oklch(0.2 0.02 250 / .18);}
      .statuswrap.open .statusmenu{display:flex;}
      .statusmenu-item{display:flex;align-items:center;gap:8px;width:100%;padding:6px;border:none;
        background:none;cursor:pointer;border-radius:var(--r2);transition:background .12s ease;}
      .statusmenu-item:hover,.statusmenu-item:focus-visible{background:var(--bg-hover);outline:none;}
      /* The pill inside a row is a swatch, not interactive — clicks belong to the row button. */
      .statusmenu-item .statuspill{flex:1 1 auto;cursor:pointer;pointer-events:none;}
      .statusmenu-item .statuspill:hover{filter:none;}
      .statusmenu-check{display:none;flex:0 0 auto;color:var(--accent);}
      .statusmenu-check svg{width:16px;height:16px;}
      .statusmenu-item.selected .statusmenu-check{display:flex;}

      /* ---- description: clean rendered rich text + progressive disclosure ---- */
      /* Ruled section (mirrors the property list) so Description reads as its own block. */
      .desc-wrap{display:flex;flex-direction:column;gap:11px;padding-top:16px;
        border-top:1px solid var(--line);}
      .desc-clamp{position:relative;}
      .desc-clamp.clamped{overflow:hidden;}
      .desc-clamp.clamped::after{content:"";position:absolute;left:0;right:0;bottom:0;height:48px;
        background:linear-gradient(to bottom,transparent,var(--bg));pointer-events:none;}
      .desc{font-size:13.5px;line-height:1.68;color:var(--ink-2);overflow-wrap:anywhere;}
      .desc.empty{color:var(--ink-3);font-style:italic;}
      .desc p{margin:0 0 10px;} .desc p:last-child{margin-bottom:0;}
      /* In-content subheads: clearly outrank body (ink + 700 + tight leading) and group with
         the text that follows them (generous top margin, tight bottom). */
      .desc .rt-h{font-weight:700;color:var(--ink);font-size:13px;letter-spacing:-0.01em;
        line-height:1.35;margin:18px 0 5px;}
      .desc .rt-h:first-child{margin-top:0;}
      .desc ul,.desc ol{margin:0 0 10px;padding-left:18px;}
      .desc li{margin:0 0 4px;line-height:1.55;}
      .desc li::marker{color:var(--ink-3);}
      .desc-more{align-self:flex-start;background:none;border:none;cursor:pointer;font-family:var(--font);
        font-size:12px;font-weight:600;color:var(--accent-ink);padding:2px 0;}
      .desc-more:hover{color:var(--accent-press);}
      .desc-more:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px;}

      /* ---- personal notes (a real, bordered text area — user's own jottings) ---- */
      /* Ruled section, matching Description, so the two read as sibling content blocks. */
      .notes-wrap{display:flex;flex-direction:column;gap:11px;padding-top:16px;
        border-top:1px solid var(--line);}
      .notes{width:100%;min-height:84px;resize:vertical;font-family:var(--font);font-size:13px;
        line-height:1.55;color:var(--ink);background:var(--bg-sunken);border:1px solid var(--line);
        border-radius:var(--r2);padding:10px 12px;
        transition:border-color .14s ease,box-shadow .14s ease,background .14s ease;}
      .notes::placeholder{color:var(--ink-3);}
      .notes:hover{border-color:var(--line-strong);}
      .notes:focus{outline:none;background:var(--bg);border-color:var(--accent);box-shadow:var(--ring);}

      /* ---- Application: empty / loading / error states ---- */
      .appstate{flex:1 1 auto;display:flex;flex-direction:column;align-items:center;
        justify-content:center;text-align:center;gap:12px;padding:32px 26px;min-height:240px;}
      .appstate .ic{display:flex;align-items:center;justify-content:center;width:52px;height:52px;
        border-radius:14px;background:var(--accent-bg);color:var(--accent-ink);}
      .appstate .ic svg{width:24px;height:24px;}
      .appstate.err .ic{background:var(--danger-bg);color:var(--danger);}
      .appstate h3{margin:0;font-size:15px;font-weight:600;letter-spacing:-0.01em;color:var(--ink);}
      .appstate p{margin:0;font-size:12.5px;line-height:1.5;max-width:270px;color:var(--ink-3);}
      .appextract{margin-top:4px;}

      /* ---- Application: compact toolbar (title + count · re-extract) ---- */
      .apphead{border-bottom:1px solid var(--line);}
      .apphead-row{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:44px;}
      .apphead-label{display:flex;align-items:baseline;gap:8px;min-width:0;}
      .apphead-title{font-size:13px;font-weight:600;color:var(--ink);}
      .apphead-count{font-size:12px;font-weight:500;color:var(--ink-3);white-space:nowrap;}
      .apphead-flagged{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:600;
        color:var(--star-ink);}
      .apphead-flagged svg{width:13px;height:13px;fill:currentColor;stroke:currentColor;}
      /* Re-extract is the secondary action — icon-only (tooltip labels it) so the primary Autofill
         button has room and the toolbar stays uncrowded in a narrow panel. */
      .reextract{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;
        padding:0;background:none;border:none;cursor:pointer;color:var(--ink-3);border-radius:6px;
        transition:background .12s ease,color .12s ease;}
      .reextract:hover{background:var(--bg-hover);color:var(--ink);}
      .reextract svg{width:15px;height:15px;}
      .reextract:focus-visible{outline:2px solid var(--accent);outline-offset:1px;}

      /* Autofill: the primary action of the saved-answer view — a compact filled accent button
         beside Re-extract. Result + Undo render in a card under the toolbar. */
      .apphead-actions{display:flex;align-items:center;gap:6px;flex:0 0 auto;}
      /* "Clear all" — a quiet text button in the Application header; warms to danger on hover so
         its intent is clear, but it stays unobtrusive (the action is reversible). */
      .appclear{font-family:var(--font);font-size:12px;font-weight:600;color:var(--ink-3);
        background:none;border:none;cursor:pointer;padding:5px 8px;border-radius:var(--r1);
        transition:background .12s ease,color .12s ease;}
      .appclear:hover{background:var(--danger-bg);color:var(--danger);}
      .appclear:focus-visible{outline:2px solid var(--accent);outline-offset:1px;}
      .appstate .appundo{margin-top:4px;padding:6px 14px;font-size:13px;}
      .appfill{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;
        background:var(--accent);border:none;cursor:pointer;font-family:var(--font);font-size:12px;
        font-weight:600;color:var(--accent-fg);border-radius:6px;
        transition:background .12s ease,opacity .12s ease;}
      .appfill:hover{background:var(--accent-press);}
      .appfill svg{width:14px;height:14px;}
      .appfill:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}
      .appfill.loading,.appfill[disabled]{opacity:.7;cursor:default;}

      /* Autofill result card: a quiet summary under the toolbar (counts + not-found list + Undo). */
      .afresult{margin:12px 0 2px;padding:12px 13px;border:1px solid var(--line);border-radius:10px;
        background:var(--bg-sunken);display:flex;flex-direction:column;gap:7px;}
      .afresult.err{border-color:var(--danger);}
      .afresult-row{display:flex;align-items:flex-start;gap:8px;}
      .afresult-row svg{width:16px;height:16px;flex:0 0 auto;margin-top:1px;color:var(--accent-ink);}
      .afresult.err .afresult-row svg{color:var(--danger);}
      .afresult-msg{margin:0;flex:1 1 auto;font-size:13px;font-weight:600;color:var(--ink);line-height:1.4;}
      .afresult-sub{margin:0;font-size:12px;line-height:1.45;color:var(--ink-3);}
      .afresult-list{margin:0;padding-left:18px;font-size:12px;line-height:1.5;color:var(--ink-2);
        display:flex;flex-direction:column;gap:1px;}
      .afresult-actions{display:flex;gap:8px;margin-top:3px;}
      .afbtn{height:30px;padding:0 12px;border-radius:6px;font-family:var(--font);font-size:12px;
        font-weight:600;cursor:pointer;border:1px solid var(--line-strong);background:var(--bg);
        color:var(--ink);transition:background .12s ease,border-color .12s ease;}
      .afbtn:hover{background:var(--bg-hover);}
      .afbtn--ghost{border-color:transparent;background:none;color:var(--ink-3);}
      .afbtn--ghost:hover{background:var(--bg-hover);color:var(--ink);}
      .afbtn:focus-visible{outline:2px solid var(--accent);outline-offset:1px;}

      /* ---- Resume tab: document list (single surface, hairline rows) + generate actions ---- */
      .resgroup{display:flex;flex-direction:column;gap:9px;}
      .resgroup + .resgroup{padding-top:16px;border-top:1px solid var(--line);}
      /* One surface, rows separated by hairlines — mirrors the web app's resume picker. */
      .doclist{display:flex;flex-direction:column;border:1px solid var(--line);border-radius:var(--r2);
        overflow:hidden;background:var(--bg);}
      /* A document row: click selects it; press-and-drag lifts it onto a page upload field — so
         it carries a grab cursor (→ grabbing on press) to advertise that it's draggable. */
      .docrow{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:10px 12px;
        background:none;border:none;border-top:1px solid var(--line);cursor:grab;font-family:var(--font);
        transition:background .12s ease;touch-action:none;}
      .docrow:first-child{border-top:none;}
      .docrow:active{cursor:grabbing;}
      .docrow:hover{background:var(--bg-hover);}
      .docrow[aria-pressed="true"]{background:var(--accent-bg);}
      .docrow:focus-visible{outline:2px solid var(--accent);outline-offset:-2px;}
      .doc-ic{display:flex;align-items:center;justify-content:center;flex:0 0 auto;width:34px;height:34px;
        border-radius:9px;background:var(--bg-sunken);color:var(--ink-3);}
      .doc-ic svg{width:17px;height:17px;}
      .docrow[aria-pressed="true"] .doc-ic{background:var(--accent);color:var(--accent-fg);}
      .doc-body{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:1px;}
      .doc-name{font-size:13px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;
        text-overflow:ellipsis;}
      .doc-meta{font-size:11.5px;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      /* Download — quiet at rest, appears on row hover/focus; sits where the old checkmark did. */
      .doc-dl{display:flex;align-items:center;justify-content:center;flex:0 0 auto;width:28px;height:28px;
        border-radius:7px;border:none;background:none;color:var(--ink-3);cursor:pointer;opacity:0;
        transition:opacity .12s ease,background .12s ease,color .12s ease;}
      .docrow:hover .doc-dl,.docrow:focus-within .doc-dl,.doc-dl:focus-visible{opacity:1;}
      .doc-dl:hover{background:var(--bg-sunken);color:var(--ink);}
      .doc-dl svg{width:15px;height:15px;}
      .doc-dl:focus-visible{outline:2px solid var(--accent);outline-offset:1px;}
      /* Drag hint + loading/empty note. */
      .doc-hint{margin:0 0 8px;display:flex;align-items:flex-start;gap:6px;font-size:11.5px;
        line-height:1.45;color:var(--ink-3);}
      .doc-hint svg{width:13px;height:13px;flex:0 0 auto;margin-top:1px;}
      .docempty{padding:14px 12px;font-size:12.5px;color:var(--ink-3);text-align:center;}
      /* Upload is a quiet ghost row at the foot of the same list. */
      .docrow--upload{color:var(--ink-3);font-size:12.5px;font-weight:600;cursor:pointer;}
      .docrow--upload:hover{color:var(--ink);}
      .docrow--upload .doc-ic{background:none;border:1px dashed var(--line-strong);color:var(--ink-3);}
      .docrow--upload[disabled]{cursor:default;opacity:.7;}

      /* Generate actions — present but stalled; a "Soon" pill sets the expectation. */
      .gen-actions{display:flex;flex-direction:column;gap:8px;}
      .gen-btn{display:flex;align-items:center;gap:11px;width:100%;text-align:left;padding:11px 13px;
        border-radius:var(--r2);border:1px solid var(--line);background:var(--bg);cursor:pointer;
        font-family:var(--font);transition:border-color .14s ease,background .14s ease;}
      .gen-btn:hover{border-color:var(--line-strong);background:var(--bg-hover);}
      .gen-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}
      .gen-ic{display:flex;align-items:center;justify-content:center;flex:0 0 auto;width:32px;height:32px;
        border-radius:9px;background:var(--accent-bg);color:var(--accent-ink);}
      .gen-ic svg{width:17px;height:17px;}
      .gen-txt{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:1px;}
      .gen-title{font-size:13px;font-weight:600;color:var(--ink);}
      .gen-sub{font-size:11.5px;color:var(--ink-3);}
      .soon{flex:0 0 auto;font-size:9.5px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;
        padding:2px 7px;border-radius:999px;background:var(--bg-sunken);color:var(--ink-3);}

      /* ---- action bar (one fixed region: pipeline status → save message → buttons) ---- */
      .actionbar{flex:0 0 auto;border-top:1px solid var(--line);background:var(--bg);}
      /* Pipeline-status band: persistent across tabs, its own row above the primary action.
         "Status" label left, the coloured pill right — a settings-row rhythm the eye parses fast. */
      .actionstatus{display:flex;align-items:center;justify-content:space-between;gap:10px;
        padding:11px 16px;border-bottom:1px solid var(--line);}
      .actionstatus-lab{font-size:12.5px;font-weight:600;color:var(--ink-2);}
      .status{font-size:12.5px;padding:0 16px;}
      .status:not(:empty){padding:10px 16px 0;}
      .status.ok{color:var(--accent-ink);font-weight:600;} .status.ok a{color:inherit;}
      .status.err{color:var(--danger);font-weight:600;}
      /* Pre-save warning (blank important fields). Amber, with the alert glyph inline. */
      .status.warn{color:var(--star-ink);font-weight:600;display:flex;align-items:flex-start;gap:6px;}
      .status.warn svg{width:15px;height:15px;flex:0 0 auto;margin-top:1px;}

      .aibar{display:flex;align-items:center;gap:10px;cursor:pointer;padding:9px 16px;}
      .ai-ic{display:flex;align-items:center;justify-content:center;flex:0 0 auto;width:28px;height:28px;
        border-radius:8px;background:var(--accent-bg);color:var(--accent-ink);
        transition:background .14s ease,color .14s ease;}
      .ai-ic svg{width:16px;height:16px;}
      .aibar:has(.switch input:checked) .ai-ic{background:var(--accent);color:var(--accent-fg);}
      .aibar-text{flex:1;min-width:0;display:flex;align-items:center;gap:7px;font-size:12.5px;
        font-weight:600;color:var(--ink);}
      .credits{font-size:10px;font-weight:600;padding:1px 6px;border-radius:5px;
        background:var(--bg-sunken);color:var(--ink-3);}
      .switch{position:relative;flex:0 0 auto;width:38px;height:22px;}
      .switch input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer;z-index:1;}
      .track{position:absolute;inset:0;border-radius:999px;background:var(--line-strong);
        transition:background .16s ease;}
      .thumb{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:var(--bg);
        box-shadow:0 1px 3px oklch(0.28 0.02 250 / .3);transition:transform .16s cubic-bezier(.4,0,.2,1);}
      .switch input:checked ~ .track{background:var(--accent);}
      .switch input:checked ~ .thumb{transform:translateX(16px);}
      .switch input:focus-visible ~ .track{outline:2px solid var(--accent);outline-offset:2px;}

      .actions{display:flex;gap:10px;padding:16px;}
      .actions .btn--ghost{flex:0 0 auto;}
      .actions .btn--primary{flex:1 1 auto;}

      /* ---- success state ---- */
      .success{flex:1 1 auto;display:flex;flex-direction:column;align-items:center;
        justify-content:center;text-align:center;gap:8px;padding:36px 28px;}
      .success .check{display:flex;align-items:center;justify-content:center;width:68px;height:68px;
        border-radius:999px;margin-bottom:10px;background:var(--accent-bg);color:var(--accent);
        box-shadow:0 0 0 8px oklch(0.46 0.085 158 / .06);}
      .success .check svg{width:34px;height:34px;stroke-width:2.5;}
      .success h3{margin:0;font-size:18px;font-weight:700;letter-spacing:-0.02em;color:var(--ink);}
      .success p{margin:0;font-size:13px;line-height:1.5;max-width:260px;color:var(--ink-2);}
      .success .cta{margin-top:22px;}
      .success .done{margin-top:6px;background:none;border:none;cursor:pointer;font-family:var(--font);
        font-size:13px;font-weight:600;color:var(--ink-3);padding:6px 10px;border-radius:8px;}
      .success .done:hover{color:var(--ink);}

      @keyframes spin{to{transform:rotate(360deg);}}
      @media (prefers-reduced-motion: no-preference){
        .finding.loading svg,.appextract.loading svg{animation:spin 1.4s linear infinite;}
        .success .check{animation:pop-check .34s cubic-bezier(.2,.8,.3,1.5);}
        .success h3,.success p,.success .cta,.success .done{animation:rise .3s ease both;}
        .success p{animation-delay:.04s;} .success .cta{animation-delay:.08s;}
        .success .done{animation-delay:.12s;}
        @keyframes pop-check{from{transform:scale(.4);opacity:0;} to{transform:scale(1);opacity:1;}}
        @keyframes rise{from{transform:translateY(6px);opacity:0;} to{transform:none;opacity:1;}}
      }
      @media (prefers-reduced-motion: reduce){
        .panel{transition:none;}
      }

    ` +
      appFormCss()
    );
  }

  // Styles for the dynamically rendered application fields live in ui/application.js so the
  // renderer stays self-contained. Fall back to empty if that module didn't load.
  function appFormCss() {
    const af = UI.applicationForm;
    return af && typeof af.css === "function" ? af.css() : "";
  }

  function el(tag, attrs, kids) {
    const n = document.createElement(tag);
    if (attrs)
      for (const k in attrs) {
        if (k === "text") n.textContent = attrs[k];
        else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
      }
    for (const c of kids || []) n.append(c);
    return n;
  }

  // Inline SVG built in the SVG namespace so it renders inside the shadow root.
  function icon(paths) {
    const svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = paths;
    return svg;
  }

  function iconBtn(paths, label) {
    const b = el("button", { class: "iconbtn", type: "button", "aria-label": label });
    b.append(icon(paths));
    return b;
  }

  // A small amber "this field is empty" marker shown beside an important field that's blank
  // (title / company / description). Hidden by default; toggled by updateFieldWarnings().
  // A section eyebrow with a small leading glyph, e.g. ✎ Your notes / ☑ To-do.
  function eyebrowHead(iconPaths, text) {
    return el("div", { class: "eyebrow-hd" }, [
      el("span", { class: "eyebrow-ic" }, [icon(iconPaths)]),
      el("span", { class: "eyebrow", text }),
    ]);
  }

  function warnIcon(label) {
    const span = el("span", {
      class: "field-warn",
      role: "img",
      title: label,
      "aria-label": label,
      style: "display:none",
    });
    span.append(icon(ICON.alert));
    return span;
  }

  // Render a description string as clean formatted nodes. Accepts the backend's cleaned HTML
  // OR plain text, and NEVER injects model HTML — it parses and rebuilds only safe block
  // structure (paragraphs, headings, lists) from textContent, so raw tags never reach the user
  // and a crafted string can't inject markup.
  function renderRichText(container, raw) {
    container.replaceChildren();
    const text = String(raw || "").trim();
    if (!text) return;
    if (!/<[a-z][\s\S]*>/i.test(text)) {
      text.split(/\n{2,}/).forEach((para) => {
        const p = el("p");
        para.split(/\n/).forEach((line, i) => {
          if (i) p.append(el("br"));
          p.append(document.createTextNode(line));
        });
        if (p.textContent.trim()) container.append(p);
      });
      return;
    }
    let doc;
    try {
      doc = new DOMParser().parseFromString(text, "text/html");
    } catch (_) {
      container.append(el("p", { text }));
      return;
    }
    const out = [];
    walkRich(doc.body, out);
    if (!out.length) {
      const fallback = (doc.body.textContent || "").trim();
      if (fallback) container.append(el("p", { text: fallback }));
      return;
    }
    out.forEach((n) => container.append(n));
  }

  function walkRich(node, out) {
    node.childNodes.forEach((child) => {
      if (child.nodeType === 3) {
        const t = child.textContent.replace(/\s+/g, " ").trim();
        if (t) out.push(el("p", { text: t }));
        return;
      }
      if (child.nodeType !== 1) return;
      const tag = child.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) {
        const t = child.textContent.replace(/\s+/g, " ").trim();
        if (t) out.push(el("p", { class: "rt-h", text: t }));
      } else if (tag === "ul" || tag === "ol") {
        const list = el(tag);
        child.querySelectorAll(":scope > li").forEach((li) => {
          const t = li.textContent.replace(/\s+/g, " ").trim();
          if (t) list.append(el("li", { text: t }));
        });
        if (list.children.length) out.push(list);
      } else if (["p", "div", "section", "article", "main", "header", "footer"].includes(tag)) {
        if (child.querySelector("p,ul,ol,h1,h2,h3,h4,h5,h6,div,section,article")) {
          walkRich(child, out); // block container — recurse for structure
        } else {
          const t = child.textContent.replace(/\s+/g, " ").trim();
          if (t) out.push(el("p", { text: t }));
        }
      } else if (tag !== "br") {
        const t = child.textContent.replace(/\s+/g, " ").trim();
        if (t) out.push(el("p", { text: t }));
      }
    });
  }

  function removeHost() {
    if (host) host.remove();
    host = shadow = overlayEl = panelEl = activeFlush = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function close() {
    if (!host) return;
    // Persist the latest Details snapshot before anything tears down (close may be fired by a
    // navigation, after which storage writes from a delayed timer wouldn't land).
    if (typeof activeFlush === "function") {
      try {
        activeFlush();
      } catch (_) {}
    }
    // Tear down companions (the on-page field picker) on EVERY close path, including nav.
    if (typeof activeOnClose === "function") {
      try {
        activeOnClose();
      } catch (_) {}
      activeOnClose = null;
    }
    if (panelEl && !reduceMotion) {
      panelEl.classList.remove("open");
      const node = host;
      setTimeout(() => {
        if (node === host) removeHost();
      }, 300);
    } else {
      removeHost();
    }
  }

  function setCollapsed(v) {
    if (overlayEl) overlayEl.classList.toggle("collapsed", v);
  }

  // A label + editable value row for the Details property list. An optional leading icon
  // (opts.icon — an ICON glyph) renders INSIDE the input as a quiet affordance, so e.g. a
  // url field always carries a link glyph in the field itself.
  function propRow(labelText, value, opts) {
    opts = opts || {};
    const input = el("input", { class: "di prop-val", type: opts.type || "text", value: value || "" });
    if (opts.placeholder) input.setAttribute("placeholder", opts.placeholder);
    let valueNode = input;
    if (opts.icon) {
      input.classList.add("prop-val--icon");
      const ic = el("span", { class: "prop-ic" }, [icon(opts.icon)]);
      valueNode = el("div", { class: "prop-valwrap" }, [ic, input]);
    }
    const row = el("div", { class: "prop" }, [
      el("span", { class: "prop-label", text: labelText }),
      valueNode,
    ]);
    return { row, input };
  }

  // open(job, { onConfirm, dashboardUrl, extraction, onExtractApplication, loadApplication,
  //             onApplicationExtracted, onAutofillMatch })
  // onAutofillMatch(fields) → Promise<{ matched, unmatched }>: present only for a saved job; when
  // set, the saved-answer view shows an "Autofill" button that fills the live page from saved answers.
  // The Satoshi @font-face lives in the document <head> (content.js injectFont). Some host pages
  // (e.g. Greenhouse) replace the entire <html> on client takeover, wiping it — which drops the
  // drawer to a heavier fallback font (everything looks "bold"). Re-inject it on open so the panel
  // always renders in Satoshi, identical to every other surface.
  function ensureFont() {
    if (document.getElementById("jobtracker-font")) return;
    try {
      const s = document.createElement("style");
      s.id = "jobtracker-font";
      s.textContent =
        '@font-face{font-family:"Satoshi";font-style:normal;font-weight:300 900;font-display:swap;' +
        'src:url("' + chrome.runtime.getURL("fonts/satoshi.woff2") + '") format("woff2");}';
      (document.head || document.documentElement).appendChild(s);
    } catch (_) {}
  }

  function open(job, opts) {
    opts = opts || {};
    if (host) removeHost();
    ensureFont();
    // Companion teardown hook (the on-page field picker) — fired on EVERY close path.
    activeOnClose = typeof opts.onClose === "function" ? opts.onClose : null;
    lastFocus = document.activeElement;
    reduceMotion =
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

    host = el("div", { id: HOST_ID });
    host.style.all = "initial";
    shadow = host.attachShadow({ mode: "open" });
    const style = el("style");
    style.textContent = css();

    const current = { ...job };

    // ---- header (brand chrome; shows the source host, not the editable fields) ----
    const badge = el("div", { class: "badge" });
    const logoUrl = (job.logoUrl || "").trim();
    if (logoUrl) {
      const logo = el("img", { class: "logo", src: logoUrl, alt: "", referrerpolicy: "no-referrer" });
      logo.addEventListener("error", () => {
        logo.remove();
        if (!badge.querySelector("svg")) badge.append(icon(ICON.bookmark));
      });
      badge.append(logo);
    } else {
      badge.append(icon(ICON.bookmark));
    }
    // Title only — the source host used to sit on a subline here, but it's redundant with the
    // Link field in Details, so the header stays clean (badge + title + controls).
    const titles = el("div", { class: "titles" }, [el("h2", { text: "Save to tracker" })]);
    const collapseBtn = iconBtn(ICON.collapse, "Collapse panel");
    const closeBtn = iconBtn(ICON.x, "Close panel");
    const head = el("div", { class: "head" }, [badge, titles, collapseBtn, closeBtn]);

    // ---- Details: identity + properties ----
    const title = { input: el("input", { class: "di jt-title", type: "text", value: current.title || "", placeholder: "Add a job title" }) };
    const company = { input: el("input", { class: "di jt-company", type: "text", value: current.company || "", placeholder: "Company" }) };
    // Blank-field markers (amber). updateFieldWarnings() shows/hides them as the fields fill.
    const titleWarn = warnIcon("No job title yet — add one so this is easy to find later");
    const companyWarn = warnIcon("No company yet — add the hiring company");
    const identity = el("div", { class: "identity" }, [
      el("div", { class: "di-wrap" }, [title.input, titleWarn]),
      el("div", { class: "di-wrap" }, [company.input, companyWarn]),
    ]);

    const location = propRow("Location", current.location, { placeholder: "Add location", icon: ICON.mapPin });
    const salaryF = propRow("Salary", current.salary, { placeholder: "Not listed", icon: ICON.salary });
    const url = propRow("Link", current.url, { type: "url", placeholder: "https://…", icon: ICON.link });
    const props = el("div", { class: "props" }, [location.row, salaryF.row, url.row]);

    // Chips for employment/workplace type (read-only, filled by extraction). Hidden until one exists.
    const meta = el("div", { class: "meta", style: "display:none" });
    const chipFor = {};
    function addChip(key, text) {
      if (!text || chipFor[key]) return;
      const c = el("span", { class: "chip", text });
      chipFor[key] = c;
      meta.append(c);
      meta.style.display = "";
    }
    addChip("employmentType", current.employmentType);
    addChip("workplaceType", current.workplaceType);
    if (current.easyApply) addChip("easyApply", "Easy Apply");
    (current.skills || []).slice(0, 4).forEach((s, i) => addChip("skill" + i, s));

    // ---- pipeline status ----
    // Where the user marks the stage this posting is at (Applied, Interviewing, …). Lives in the
    // fixed action bar (see below), NOT a tab pane, so it's visible and one click away from ANY tab
    // and reads as part of the save commitment. The value rides along with the save (createJob
    // honours it); once tracked, changing it PATCHes the job so it stays in step with the job page.
    // Seeded from the restored/server status, default Saved.
    let statusValue = STATUS_SET.has(opts.status) ? opts.status : "SAVED";
    let statusMenuOpen = false;
    // Trigger — the current status as a coloured pill (dot + label ride currentColor) with a caret.
    const statusTriggerLab = el("span", { class: "statuspill-lab", text: STATUS_LABEL[statusValue] });
    const statusTrigger = el(
      "button",
      {
        class: "statuspill " + statusClass(statusValue),
        type: "button",
        "aria-haspopup": "listbox",
        "aria-expanded": "false",
        "aria-label": "Application status",
      },
      [el("span", { class: "dot" }), statusTriggerLab, el("span", { class: "chev" }, [icon(ICON.chevronDown)])],
    );
    // Menu — one row per stage, each a full colour-coded pill + a check on the current one, exactly
    // like the job page's StatusMenu. Native <option>s can't carry the status colours, so this is a
    // custom listbox. Opens upward (the picker lives in the footer) and is right-aligned to the pill.
    const statusItems = STATUS_LIST.map(([value, label]) => {
      const pill = el("div", { class: "statuspill " + statusClass(value) }, [
        el("span", { class: "dot" }),
        el("span", { class: "statuspill-lab", text: label }),
      ]);
      const item = el(
        "button",
        { class: "statusmenu-item", type: "button", role: "option", "data-v": value },
        [pill, el("span", { class: "statusmenu-check" }, [icon(ICON.check)])],
      );
      item.addEventListener("click", () => selectStatus(value));
      return item;
    });
    const statusMenu = el(
      "div",
      { class: "statusmenu", role: "listbox", "aria-label": "Set application status" },
      statusItems,
    );
    const statusWrap = el("div", { class: "statuswrap" }, [statusTrigger, statusMenu]);

    function paintStatusChecks() {
      statusItems.forEach((it) => it.classList.toggle("selected", it.getAttribute("data-v") === statusValue));
    }
    function onStatusOutside(e) {
      const path = typeof e.composedPath === "function" ? e.composedPath() : [];
      if (!path.includes(statusWrap)) closeStatusMenu();
    }
    function openStatusMenu() {
      if (statusMenuOpen) return;
      statusMenuOpen = true;
      statusWrap.classList.add("open");
      statusTrigger.setAttribute("aria-expanded", "true");
      paintStatusChecks();
      const sel = statusItems.find((it) => it.getAttribute("data-v") === statusValue) || statusItems[0];
      if (sel) sel.focus();
      // Deferred so the opening click itself doesn't immediately close it.
      setTimeout(() => shadow && shadow.addEventListener("click", onStatusOutside, true), 0);
    }
    function closeStatusMenu() {
      if (!statusMenuOpen) return;
      statusMenuOpen = false;
      statusWrap.classList.remove("open");
      statusTrigger.setAttribute("aria-expanded", "false");
      if (shadow) shadow.removeEventListener("click", onStatusOutside, true);
    }
    function selectStatus(v) {
      statusValue = v;
      statusTrigger.className = "statuspill " + statusClass(v);
      statusTriggerLab.textContent = STATUS_LABEL[v] || v;
      closeStatusMenu();
      statusTrigger.focus();
      if (typeof opts.onStatusChange === "function") opts.onStatusChange(v);
    }
    statusTrigger.addEventListener("click", () => (statusMenuOpen ? closeStatusMenu() : openStatusMenu()));
    // Keyboard: Esc closes the menu (and is swallowed so the panel doesn't also close); arrows move
    // between stages. Enter/Space activate the focused item (native <button> behaviour).
    statusWrap.addEventListener("keydown", (e) => {
      if (!statusMenuOpen) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        closeStatusMenu();
        statusTrigger.focus();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const i = statusItems.indexOf(shadow && shadow.activeElement);
        const n = statusItems.length;
        const next = e.key === "ArrowDown" ? (i + 1) % n : (i - 1 + n) % n;
        statusItems[next < 0 ? 0 : next].focus();
      }
    });
    paintStatusChecks();
    const statusFooter = el("div", { class: "actionstatus" }, [
      el("span", { class: "actionstatus-lab", text: "Status" }),
      statusWrap,
    ]);

    // ---- description (clean rendered rich text + show more / less) ----
    const descBox = el("div", { class: "desc" });
    const descClamp = el("div", { class: "desc-clamp" }, [descBox]);
    const descMore = el("button", { class: "desc-more", type: "button", text: "Show more" });
    descMore.style.display = "none";
    const descWarn = warnIcon("No description captured — saved jobs are far more useful with one");
    const descWrap = el("div", { class: "desc-wrap" }, [
      el("div", { class: "eyebrow-row" }, [el("span", { class: "eyebrow", text: "Description" }), descWarn]),
      descClamp,
      descMore,
    ]);

    const hasDesc = job.description && job.description.trim();
    if (hasDesc) {
      renderRichText(descBox, job.description);
    } else {
      descBox.classList.add("empty");
      descBox.textContent = "No description captured for this posting.";
    }

    function descHasContent() {
      return !descBox.classList.contains("empty") && descBox.childElementCount > 0;
    }
    function updateDescClamp() {
      if (!descHasContent()) {
        descClamp.classList.remove("clamped");
        descClamp.style.maxHeight = "";
        descMore.style.display = "none";
        return;
      }
      const expanded = descClamp.classList.contains("expanded");
      descClamp.style.maxHeight = "";
      const overflowing = descBox.scrollHeight > CLAMP_PX + 12;
      descMore.style.display = overflowing ? "" : "none";
      if (!overflowing) {
        descClamp.classList.remove("clamped");
        return;
      }
      if (expanded) {
        descClamp.classList.remove("clamped");
        descMore.textContent = "Show less";
      } else {
        descClamp.classList.add("clamped");
        descClamp.style.maxHeight = CLAMP_PX + "px";
        descMore.textContent = "Show more";
      }
    }
    descMore.addEventListener("click", () => {
      descClamp.classList.toggle("expanded");
      updateDescClamp();
    });

    // ---- Details: user-triggered AI extract bar ----
    // Mirrors the Application tab: extraction never runs on open. The fields stay editable for
    // manual entry; this bar just offers (and reflects) the optional LLM auto-fill.
    // The card is a single element whose contents (tile icon, title, subtitle, trailing control) are
    // rebuilt per state. `detailsBar` is the stable node placed in the pane; setDetailsState repaints it.
    let detailsExtracted = false;
    const dxTile = el("span", { class: "dx-tile" });
    const dxTitle = el("span", { class: "dx-title" });
    const dxSub = el("span", { class: "dx-sub" });
    const dxTrail = el("span", { class: "dx-chev" });
    const dxText = el("span", { class: "dx-text" }, [dxTitle, dxSub]);
    const detailsBar = el("div", {
      class: "dx-card dx-card--action",
      role: "button",
      tabindex: "0",
      "aria-label": "Extract job details with AI",
    }, [dxTile, dxText, dxTrail]);
    // The whole card triggers extraction in its action states (idle / error); the flag gates the
    // handler so a click on the inert loading/done card does nothing.
    let dxActionable = true;
    const onCardActivate = () => {
      if (dxActionable) runDetailsExtraction();
    };
    detailsBar.addEventListener("click", onCardActivate);
    detailsBar.addEventListener("keydown", (e) => {
      if (dxActionable && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        onCardActivate();
      }
    });

    function setDetailsState(state, errorMsg, usage) {
      detailsExtracted = state === "done";
      dxTrail.replaceChildren();
      detailsBar.classList.remove("err", "dx-card--action", "dx-card--loading");
      if (state === "loading") {
        dxActionable = false;
        detailsBar.classList.add("dx-card--loading");
        detailsBar.removeAttribute("role");
        detailsBar.removeAttribute("tabindex");
        dxTile.replaceChildren(icon(ICON.sparkles));
        dxTitle.textContent = "Reading this posting…";
        dxSub.textContent =
          usage && usage.estimated ? `Scanning the page (${usage.estimated} input tokens)` : "Scanning the page for details";
      } else if (state === "done") {
        dxActionable = false;
        detailsBar.removeAttribute("role");
        detailsBar.removeAttribute("tabindex");
        dxTile.replaceChildren(icon(ICON.check));
        dxTitle.textContent = "Auto-filled by AI";
        dxSub.textContent = usage
          ? `Filled from this page · ${usage.inputTokens || 0} in, ${usage.outputTokens || 0} out`
          : "Filled from this page";
        const re = el("button", { class: "dx-re", type: "button", title: "Extract again" });
        re.append(icon(ICON.refresh), el("span", { text: "Re-extract" }));
        re.addEventListener("click", (e) => {
          e.stopPropagation();
          runDetailsExtraction();
        });
        dxTrail.append(re);
      } else if (state === "error") {
        dxActionable = true;
        detailsBar.classList.add("err", "dx-card--action");
        detailsBar.setAttribute("role", "button");
        detailsBar.setAttribute("tabindex", "0");
        dxTile.replaceChildren(icon(ICON.refresh));
        dxTitle.textContent = "Couldn't auto-fill";
        dxSub.textContent = errorMsg || "Enter the details manually, or click to try again.";
        dxTrail.append(icon(ICON.chevronRight));
      } else {
        // idle
        dxActionable = true;
        detailsBar.classList.add("dx-card--action");
        detailsBar.setAttribute("role", "button");
        detailsBar.setAttribute("tabindex", "0");
        dxTile.replaceChildren(icon(ICON.sparkles));
        dxTitle.textContent = "Extract with AI";
        dxSub.textContent = "Auto-fill job details from this page";
        dxTrail.append(icon(ICON.chevronRight));
      }
    }
    setDetailsState("idle");

    // ---- personal notes (user's own jottings about this posting) ----
    const notesInput = el("textarea", {
      class: "notes",
      rows: "3",
      placeholder: "Why this role caught your eye, people you know there, follow-ups to make…",
      "aria-label": "Your notes about this job",
    });
    if (current.notes) notesInput.value = current.notes;
    const notesWrap = el("div", { class: "notes-wrap" }, [
      eyebrowHead(ICON.penLine, "Your notes"),
      notesInput,
    ]);

    // ---- to-do (local-first; NOT gated on save) ----
    // A ruled block matching Description / Your notes. The list + composer are rendered by the
    // sibling ui/todo.js module. To-dos live in the posting's local record and only sync to the
    // backend when the user saves — so the section is usable immediately, even before saving.
    const todoBox = el("div", { class: "todo-box" });
    const todoWrap = el("div", { class: "notes-wrap" }, [eyebrowHead(ICON.listTodo, "To-do"), todoBox]);
    function renderTodos() {
      if (!(root.JTTodo && typeof root.JTTodo.render === "function")) return;
      const load = typeof opts.loadTodos === "function" ? opts.loadTodos() : Promise.resolve(null);
      Promise.resolve(load)
        .then((data) => {
          root.JTTodo.render(todoBox, {
            todos: (data && data.todos) || [],
            deleted: (data && data.deleted) || [],
            host,
            onChange: (todos, deleted) => {
              if (typeof opts.onTodosChange === "function") opts.onTodosChange(todos, deleted);
            },
          });
        })
        .catch(() => {});
    }

    const detailsPane = el(
      "div",
      { class: "pane", id: "jt-pane-details", role: "tabpanel", "aria-labelledby": "jt-tab-details" },
      [detailsBar, identity, props, meta, descWrap, notesWrap, todoWrap],
    );

    // ---- Application pane (blank until user extracts; never auto-runs) ----
    const appPane = el("div", {
      class: "pane apppane",
      id: "jt-pane-app",
      role: "tabpanel",
      "aria-labelledby": "jt-tab-app",
      hidden: "",
    });
    const clearApp = () => appPane.replaceChildren();

    function appState({ kind, title: heading, body: text, iconPaths, btnLabel, btnIcon, loading }) {
      clearApp();
      const ic = el("div", { class: "ic" });
      ic.append(icon(iconPaths));
      const kids = [ic, el("h3", { text: heading }), el("p", { text })];
      if (btnLabel) {
        const btn = el("button", {
          class: "btn btn--primary btn--lg appextract" + (loading ? " loading" : ""),
          type: "button",
        });
        if (loading) btn.disabled = true;
        btn.append(icon(btnIcon), el("span", { text: btnLabel }));
        if (!loading) btn.addEventListener("click", runAppExtraction);
        kids.push(btn);
      }
      appPane.append(el("div", { class: "appstate" + (kind === "err" ? " err" : "") }, kids));
    }

    // Live-mirror mode: the Application tab fills itself as form-sync detects fields on the page.
    function renderAppPickerHint() {
      appState({
        kind: "blank",
        iconPaths: ICON.clipboard,
        title: "Watching for application questions",
        body: "Open the application form on this page — its fields appear here automatically, and whatever you type on the page is captured live.",
      });
    }

    function renderAppBlank() {
      appState({
        kind: "blank",
        iconPaths: ICON.clipboard,
        title: "No application questions yet",
        body: "Open or expand the application form on the page, then pull its questions in here.",
        btnLabel: "Extract application questions",
        btnIcon: ICON.sparkles,
      });
    }
    function renderAppLoading() {
      appState({
        kind: "loading",
        iconPaths: ICON.clipboard,
        title: "Reading the application…",
        body: "Detecting the form fields on this page.",
        btnLabel: "Reading the application form…",
        btnIcon: ICON.sparkles,
        loading: true,
      });
    }
    function renderAppEmpty() {
      appState({
        kind: "blank",
        iconPaths: ICON.clipboard,
        title: "No application questions found",
        body: 'If the form is behind an "Apply" button or a collapsed section, open it on the page and try again.',
        btnLabel: "Try again",
        btnIcon: ICON.refresh,
      });
    }
    function renderAppError(message) {
      appState({
        kind: "err",
        iconPaths: ICON.x,
        title: "Couldn't read the form",
        body: message || "Something went wrong. Please try again.",
        btnLabel: "Try again",
        btnIcon: ICON.refresh,
      });
    }

    // Result view: a quiet header (count + flagged tally + re-extract) above the dynamic fields.
    // `viewOpts` carries the read-only answer view for an already-saved job: { answers, readOnly }.
    // Without it (a fresh extraction) the form is an editable preview, exactly as before.
    function renderAppResult(questions, viewOpts) {
      const answers = (viewOpts && viewOpts.answers) || null;
      const readOnly = !!(viewOpts && viewOpts.readOnly);
      clearApp();
      // REVERT(LLM extraction): re-extract affordance, disconnected in picker mode.
      // const reBtn = el("button", {
      //   class: "reextract", type: "button", title: "Re-extract questions", "aria-label": "Re-extract questions",
      // });
      // reBtn.append(icon(ICON.refresh));
      // reBtn.addEventListener("click", runAppExtraction);
      const count = questions.length + (questions.length === 1 ? " question" : " questions");

      // Live "N flagged" tally — shows what the user starred for review; hidden when none.
      const flaggedCountText = el("span", { class: "apphead-flagged-n" });
      const flaggedBadge = el("span", { class: "apphead-flagged", title: "Questions you flagged for review" }, [
        icon(ICON.flag),
        flaggedCountText,
      ]);
      function updateFlagged() {
        const n = questions.reduce((a, q) => a + (q && q.flagged ? 1 : 0), 0);
        flaggedCountText.textContent = String(n);
        flaggedBadge.style.display = n ? "" : "none";
      }

      const headActions = el("div", { class: "apphead-actions" }, []);
      const header = el("div", { class: "apphead" }, [
        el("div", { class: "apphead-row" }, [
          el("div", { class: "apphead-label" }, [
            el("span", { class: "apphead-title", text: "Application" }),
            el("span", { class: "apphead-count", text: count }),
            flaggedBadge,
          ]),
          headActions,
        ]),
      ]);
      // Persist on every flag toggle so the star survives reopen AND rides along on save
      // (content.js reads the cached questions when building the save payload).
      const persistFlags = () => {
        if (typeof opts.onApplicationExtracted === "function") opts.onApplicationExtracted(questions);
      };
      const grid =
        UI.applicationForm && typeof UI.applicationForm.render === "function"
          ? UI.applicationForm.render(questions, {
              onFlagChange: () => {
                updateFlagged();
                persistFlags();
              },
              answers,
              readOnly,
            })
          : el("p", { class: "apphelp", text: "Renderer unavailable." });
      appPane.append(header);
      appPane.append(grid);
      updateFlagged();
      // Application questions now exist for this page → the AI-prep toggle becomes meaningful.
      if (aiCard) aiCard.style.display = "";

      if (readOnly) mountAutofill(headActions, header);
    }

    // ---- Autofill ----
    // Fill the LIVE page's application form from the SAVED answers. Harvest + fill run in
    // ui/application.js (host-page DOM); matching is server-side via the onAutofillMatch hook,
    // which content.js provides only for an already-saved job — absent hook, no button.
    // Result + Undo render in a card under the given header.
    function mountAutofill(headActions, header) {
      if (typeof opts.onAutofillMatch !== "function" || !UI.autofill) return;
      let afCard = null;
      const removeResult = () => {
        if (afCard) { afCard.remove(); afCard = null; }
      };
      const dismissBtn = () => {
        const b = el("button", { class: "afbtn afbtn--ghost", type: "button", text: "Dismiss" });
        // Dismiss keeps the filled values (the user accepted them); just clear the highlights.
        b.addEventListener("click", () => {
          if (UI.autofill) UI.autofill.clear();
          removeResult();
        });
        return b;
      };
      const showResult = (s) => {
        removeResult();
        const card = el("div", { class: "afresult" });
        if (s.empty || s.error) {
          card.classList.add("err");
          card.append(
            el("div", { class: "afresult-row" }, [
              icon(s.error ? ICON.x : ICON.clipboard),
              el("p", {
                class: "afresult-msg",
                text:
                  s.error ||
                  "No fillable fields found on this page. Open the application form, then try again.",
              }),
            ]),
            el("div", { class: "afresult-actions" }, [dismissBtn()]),
          );
          afCard = card;
          appPane.insertBefore(card, header.nextSibling);
          return;
        }
        const total = s.real + s.def;
        card.append(
          el("div", { class: "afresult-row" }, [
            icon(total ? ICON.check : ICON.clipboard),
            el("p", {
              class: "afresult-msg",
              text: total ? `Filled ${total} ${total === 1 ? "field" : "fields"}` : "Nothing to fill",
            }),
          ]),
        );
        if (s.def)
          card.append(
            el("p", {
              class: "afresult-sub",
              text: `${s.def} filled with a placeholder default — review before submitting.`,
            }),
          );
        if (s.failedCount)
          card.append(
            el("p", { class: "afresult-sub", text: `${s.failedCount} couldn't be filled automatically.` }),
          );
        if (s.unmatched && s.unmatched.length) {
          card.append(
            el("p", {
              class: "afresult-sub",
              text: `Couldn't find a field on this page for ${s.unmatched.length}:`,
            }),
          );
          const ul = el("ul", { class: "afresult-list" });
          s.unmatched.slice(0, 8).forEach((u) => ul.append(el("li", { text: u.label || u.questionId })));
          if (s.unmatched.length > 8)
            ul.append(el("li", { text: `…and ${s.unmatched.length - 8} more` }));
          card.append(ul);
        }
        const actions = el("div", { class: "afresult-actions" });
        if (total) {
          const undo = el("button", { class: "afbtn", type: "button", text: "Undo" });
          undo.addEventListener("click", () => {
            if (UI.autofill) UI.autofill.undo();
            card.replaceChildren(
              el("div", { class: "afresult-row" }, [
                icon(ICON.check),
                el("p", { class: "afresult-msg", text: "Reverted." }),
              ]),
              el("div", { class: "afresult-actions" }, [dismissBtn()]),
            );
          });
          actions.append(undo);
        }
        actions.append(dismissBtn());
        card.append(actions);
        afCard = card;
        appPane.insertBefore(card, header.nextSibling);
      };
      const afBtn = el("button", {
        class: "appfill",
        type: "button",
        title: "Autofill this application from your saved answers",
      });
      afBtn.append(icon(ICON.sparkles), el("span", { text: "Autofill" }));
      const runAutofill = async () => {
        if (afBtn.disabled) return;
        afBtn.disabled = true;
        afBtn.classList.add("loading");
        const span = afBtn.querySelector("span");
        if (span) span.textContent = "Autofilling…";
        removeResult();
        try {
          const harvest = UI.autofill.harvest();
          if (!harvest.fields.length) {
            showResult({ empty: true });
            return;
          }
          const plan = await opts.onAutofillMatch(harvest.fields);
          showResult(await UI.autofill.apply(plan));
        } catch (e) {
          showResult({ error: (e && e.message) || "Autofill failed." });
        } finally {
          afBtn.disabled = false;
          afBtn.classList.remove("loading");
          if (span) span.textContent = "Autofill";
        }
      };
      afBtn.addEventListener("click", runAutofill);
      headActions.append(afBtn);
    }

    // ---- live mirror tray (form-sync) ----
    // The Application tab mirrors the page's form automatically: content.js feeds the model
    // ([{ key, question, answer, onPage }]) through the onApplicationReady API below whenever
    // the structure changes, and single value changes stream through updateAnswer so the grid
    // never re-renders under the user's caret. Edits made HERE flow back via opts.onAnswerEdit.
    let appLive = null; // { updateAnswer } for the currently rendered live grid
    // "Clear all" is a presentation + save-level suppression: form-sync keeps detecting underneath,
    // but while cleared the tray is replaced by an undo-able empty state and NOTHING is saved (see
    // content.js persistSyncNow). Undo just flips the flag and re-renders the still-live model.
    let appCleared = !!opts.applicationCleared;
    let lastAppItems = [];
    function renderAppLive(items) {
      appInteracted = true;
      lastAppItems = items || [];
      if (appCleared) {
        renderAppCleared();
        return;
      }
      if (!items || !items.length) {
        appLive = null;
        renderAppPickerHint();
        return;
      }
      clearApp();
      const questions = items.map((it) => it.question);
      const count = items.length + (items.length === 1 ? " question" : " questions");
      const flaggedCountText = el("span", { class: "apphead-flagged-n" });
      const flaggedBadge = el("span", { class: "apphead-flagged", title: "Questions you flagged for review" }, [
        icon(ICON.flag),
        flaggedCountText,
      ]);
      const updateFlagged = () => {
        const n = questions.reduce((a, q) => a + (q && q.flagged ? 1 : 0), 0);
        flaggedCountText.textContent = String(n);
        flaggedBadge.style.display = n ? "" : "none";
      };
      const headActions = el("div", { class: "apphead-actions" }, []);
      const header = el("div", { class: "apphead" }, [
        el("div", { class: "apphead-row" }, [
          el("div", { class: "apphead-label" }, [
            el("span", { class: "apphead-title", text: "Application" }),
            el("span", { class: "apphead-count", text: count }),
            flaggedBadge,
          ]),
          headActions,
        ]),
      ]);
      // Flag toggles persist through the same hook as before (content.js re-caches questions).
      const persistFlags = () => {
        if (typeof opts.onApplicationExtracted === "function") opts.onApplicationExtracted(questions);
      };
      const live =
        UI.applicationForm && typeof UI.applicationForm.renderLive === "function"
          ? UI.applicationForm.renderLive(items, {
              onEdit: (key, value) => {
                if (typeof opts.onAnswerEdit === "function") opts.onAnswerEdit(key, value);
              },
              onDismiss: (key) => {
                if (typeof opts.onQuestionDismiss === "function") opts.onQuestionDismiss(key);
              },
              onFlagChange: () => {
                updateFlagged();
                persistFlags();
              },
            })
          : { node: el("p", { class: "apphelp", text: "Renderer unavailable." }), updateAnswer() {} };
      // Clear all — drop every detected question so nothing application-related is saved. Reversible
      // (an Undo CTA in the cleared state), so it's a quiet neutral action here, not a destructive one.
      const clearBtn = el("button", {
        class: "appclear",
        type: "button",
        title: "Clear all — save no application questions for this job",
      });
      clearBtn.append(el("span", { text: "Clear all" }));
      clearBtn.addEventListener("click", () => {
        appCleared = true;
        if (typeof opts.onApplicationClearedChange === "function") opts.onApplicationClearedChange(true);
        renderAppCleared();
      });
      headActions.append(clearBtn);
      appPane.append(header, live.node);
      appLive = live;
      updateFlagged();
      // Application questions now exist for this page → the AI-prep toggle becomes meaningful.
      if (aiCard) aiCard.style.display = "";
      mountAutofill(headActions, header);
    }

    // The undo-able "cleared" state — shown after Clear all. Restoring flips the flag and re-renders
    // the model form-sync has kept live the whole time.
    function renderAppCleared() {
      clearApp();
      appLive = null;
      const ic = el("div", { class: "ic" });
      ic.append(icon(ICON.clipboard));
      const undo = el("button", { class: "btn btn--ghost appundo", type: "button" });
      undo.append(el("span", { text: "Undo" }));
      undo.addEventListener("click", () => {
        appCleared = false;
        if (typeof opts.onApplicationClearedChange === "function") opts.onApplicationClearedChange(false);
        renderAppLive(lastAppItems);
      });
      appPane.append(
        el("div", { class: "appstate" }, [
          ic,
          el("h3", { text: "Application cleared" }),
          el("p", { text: "No application questions will be saved with this job. You can bring them back." }),
          undo,
        ]),
      );
      if (aiCard) aiCard.style.display = "none";
    }

    // Guards the async restore below from clobbering a fresh extraction already in flight.
    let appInteracted = false;
    function runAppExtraction() {
      if (typeof opts.onExtractApplication !== "function") {
        renderAppError("Application extraction isn't available here.");
        return;
      }
      appInteracted = true;
      renderAppLoading();
      Promise.resolve()
        .then(() => opts.onExtractApplication())
        .then((res) => {
          const questions = Array.isArray(res) ? res : (res && res.questions) || [];
          if (!questions.length) {
            renderAppEmpty();
          } else {
            renderAppResult(questions);
            if (typeof opts.onApplicationExtracted === "function") opts.onApplicationExtracted(questions);
          }
        })
        .catch((err) => renderAppError(err && err.message ? err.message : null));
    }

    // REVERT: to restore LLM question extraction, call renderAppBlank() here instead (its
    // button wires runAppExtraction), re-enable the reextract button in renderAppResult,
    // and re-enable onExtractApplication in content.js#openSavePanel.
    if (appCleared) renderAppCleared();
    else renderAppPickerHint();

    // Restore a previous extraction for this page (chrome.storage.local) so closing/reopening —
    // or restarting the browser — keeps the questions. Applies only while still blank.
    if (typeof opts.loadApplication === "function") {
      Promise.resolve()
        .then(() => opts.loadApplication())
        .then((restored) => {
          if (appInteracted || !restored) return;
          // Back-compat: an array is just questions (editable). The object shape carries the saved
          // job's answers + a `saved` flag → render the current values read-only.
          const questions = Array.isArray(restored) ? restored : restored.questions;
          if (!questions || !questions.length) return;
          const viewOpts = Array.isArray(restored)
            ? undefined
            : { answers: restored.answers, readOnly: !!restored.saved };
          renderAppResult(questions, viewOpts);
        })
        .catch(() => {});
    }

    // Live tray API: content.js drives the Application tab through this handle. setModel
    // re-renders on STRUCTURE changes (new/removed/off-page questions); updateAnswer patches a
    // single control's value in place (page → panel mirror). setModel marks appInteracted so a
    // slow loadApplication restore can't clobber a fresher live model.
    if (typeof opts.onApplicationReady === "function") {
      opts.onApplicationReady({
        setModel(items) {
          renderAppLive(items);
        },
        updateAnswer(key, value) {
          if (appLive) appLive.updateAnswer(key, value);
        },
      });
    }

    // ---- Resume pane (documents list + tailored-generation actions) ----
    // Generation is intentionally stalled: the documents are placeholder rows and the two
    // "generate" actions are wired to no-ops (a quiet "Soon" pill sets the expectation). The
    // job here is to land the layout, hierarchy, and affordances so the real backend can drop in.
    const resumePane = el("div", {
      class: "pane respane",
      id: "jt-pane-resume",
      role: "tabpanel",
      "aria-labelledby": "jt-tab-resume",
      hidden: "",
    });

    // Real documents from the backend. Each row carries getFile() → the actual File, so it can be
    // dragged onto a page upload field or downloaded. Local uploads keep their File in memory so
    // they're draggable immediately too. Shape: { id, name, meta, mimeType, getFile }.
    let resumeDocs = [];
    let selectedDocId = null;
    let docsLoaded = false;

    const docList = el("div", { class: "doclist" });
    const resumeFileInput = el("input", {
      type: "file",
      accept: ".pdf,.doc,.docx",
      style: "display:none",
    });

    function metaForDoc(d) {
      const ext = ((d.fileName || d.title || "").split(".").pop() || "").toUpperCase();
      const kb = (d.size || 0) / 1024;
      const size = d.size ? (kb < 1024 ? Math.round(kb) + " KB" : (kb / 1024).toFixed(1) + " MB") : "";
      return [ext || null, size || null].filter(Boolean).join(" · ");
    }

    async function downloadDoc(doc) {
      let file;
      try {
        file = await doc.getFile();
      } catch (_) {
        return;
      }
      if (!file) return;
      const url = URL.createObjectURL(file);
      const a = el("a", { href: url, download: doc.name || file.name || "document" });
      (document.body || document.documentElement).appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    }

    function docRow(doc) {
      const selected = doc.id === selectedDocId;
      const dl = el("button", {
        class: "doc-dl",
        type: "button",
        title: "Download",
        "aria-label": "Download " + doc.name,
      });
      dl.append(icon(ICON.download));
      dl.addEventListener("click", (e) => {
        e.stopPropagation();
        downloadDoc(doc);
      });
      const row = el(
        "div",
        {
          class: "docrow",
          role: "button",
          tabindex: "0",
          "aria-pressed": selected ? "true" : "false",
          title: "Click to select · drag onto a file field on the page to attach",
        },
        [
          (() => {
            const ic = el("div", { class: "doc-ic" });
            ic.append(icon(ICON.file));
            return ic;
          })(),
          el("div", { class: "doc-body" }, [
            el("div", { class: "doc-name", text: doc.name }),
            el("div", { class: "doc-meta", text: doc.meta }),
          ]),
          dl,
        ],
      );
      // Click selects (a drag suppresses the trailing click — see doc-drag).
      row.addEventListener("click", () => {
        selectedDocId = selectedDocId === doc.id ? null : doc.id;
        renderDocList();
      });
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          row.click();
        }
      });
      // Press-and-drag → attach onto a page upload field. UI.docDrag owns the ghost, cursor,
      // hit-testing and the real file set; a below-threshold press stays a click (selection).
      row.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || (e.target.closest && e.target.closest(".doc-dl"))) return;
        if (!UI.docDrag || typeof UI.docDrag.start !== "function") return;
        UI.docDrag.start({ startEvent: e, label: doc.name, getFile: () => doc.getFile() });
      });
      return row;
    }

    function renderDocList() {
      docList.replaceChildren();
      if (!docsLoaded) {
        docList.append(el("div", { class: "docempty", text: "Loading your documents…" }));
        return;
      }
      resumeDocs.forEach((doc) => docList.append(docRow(doc)));
      if (!resumeDocs.length) {
        docList.append(
          el("div", { class: "docempty", text: "No documents yet — upload one to drag it onto applications." }),
        );
      }
      // Quiet ghost "upload" row at the foot of the same surface.
      const uploadRow = el("button", { class: "docrow docrow--upload", type: "button" }, [
        (() => {
          const ic = el("div", { class: "doc-ic" });
          ic.append(icon(ICON.upload));
          return ic;
        })(),
        el("span", { text: "Upload a resume" }),
      ]);
      uploadRow.addEventListener("click", () => resumeFileInput.click());
      docList.append(uploadRow);
    }

    // Load the real document list (best effort; empty on failure). Then render.
    if (typeof opts.loadDocuments === "function") {
      Promise.resolve()
        .then(() => opts.loadDocuments())
        .then((docs) => {
          docsLoaded = true;
          resumeDocs = (docs || []).map((d) => ({
            id: d.id,
            name: d.fileName || d.title || "Document",
            meta: metaForDoc(d),
            mimeType: d.mimeType,
            getFile: () =>
              opts.fetchDocumentFile({ id: d.id, name: d.fileName || d.title, mimeType: d.mimeType }),
          }));
          if (resumeDocs.length && !selectedDocId) selectedDocId = resumeDocs[0].id;
          renderDocList();
        })
        .catch(() => {
          docsLoaded = true;
          renderDocList();
        });
    } else {
      docsLoaded = true;
    }

    // Local upload: keep the real File so the row is immediately draggable/downloadable.
    resumeFileInput.addEventListener("change", () => {
      const file = resumeFileInput.files && resumeFileInput.files[0];
      resumeFileInput.value = "";
      if (!file) return;
      const ext = (file.name.split(".").pop() || "file").toUpperCase();
      const kb = file.size / 1024;
      const size = kb < 1024 ? Math.round(kb) + " KB" : (kb / 1024).toFixed(1) + " MB";
      const id = "u" + Date.now() + "-" + file.size;
      resumeDocs.unshift({
        id,
        name: file.name,
        meta: ext + " · " + size + " · Just added",
        mimeType: file.type,
        getFile: () => Promise.resolve(file),
      });
      selectedDocId = id;
      renderDocList();
    });

    function genBtn(iconPaths, title, sub) {
      const btn = el("button", { class: "gen-btn", type: "button" }, [
        (() => {
          const ic = el("div", { class: "gen-ic" });
          ic.append(icon(iconPaths));
          return ic;
        })(),
        el("div", { class: "gen-txt" }, [
          el("div", { class: "gen-title", text: title }),
          el("div", { class: "gen-sub", text: sub }),
        ]),
        el("span", { class: "soon", text: "Soon" }),
      ]);
      // Stalled: clicking does nothing yet. The handler is the seam for the real generator.
      btn.addEventListener("click", () => {
        /* TODO: kick off tailored generation for `selectedDocId` + this job */
      });
      return btn;
    }

    renderDocList();
    resumePane.append(
      el("div", { class: "resgroup" }, [
        el("span", { class: "eyebrow", text: "Your documents" }),
        el("div", { class: "doc-hint" }, [
          icon(ICON.upload),
          el("span", {
            text: "Drag a document onto a file-upload field on the page to attach it — or download it.",
          }),
        ]),
        docList,
        resumeFileInput,
      ]),
      el("div", { class: "resgroup" }, [
        el("span", { class: "eyebrow", text: "Tailor for this job" }),
        el("div", { class: "gen-actions" }, [
          genBtn(ICON.wand, "Generate tailored resume", "Reworked to match this role"),
          genBtn(ICON.penLine, "Generate cover letter", "A draft written for this job"),
        ]),
      ]),
    );

    // ---- tabs ----
    function makeTab(key, labelText, iconPaths, selected) {
      const t = el("button", {
        class: "tab",
        type: "button",
        role: "tab",
        id: "jt-tab-" + key,
        "aria-controls": "jt-pane-" + key,
        "aria-selected": selected ? "true" : "false",
        tabindex: selected ? "0" : "-1",
      });
      t.append(icon(iconPaths), el("span", { text: labelText }));
      return t;
    }
    // Tab registry — one entry per pane. Selection, roving tabindex, and arrow-key navigation
    // all derive from this list, so adding a pane (e.g. Resume) is a one-line change.
    const tabDefs = [
      { key: "details", label: "Details", icon: ICON.text, pane: detailsPane },
      { key: "app", label: "Application", icon: ICON.clipboard, pane: appPane },
      { key: "resume", label: "Resume", icon: ICON.file, pane: resumePane },
    ];
    tabDefs.forEach((t, i) => (t.tab = makeTab(t.key, t.label, t.icon, i === 0)));
    const tabs = el(
      "div",
      { class: "tabs", role: "tablist", "aria-label": "Panel sections" },
      tabDefs.map((t) => t.tab),
    );
    function selectTab(which) {
      tabDefs.forEach((t) => {
        const on = t.key === which;
        t.tab.setAttribute("aria-selected", on ? "true" : "false");
        t.tab.tabIndex = on ? 0 : -1;
        t.pane.hidden = !on;
      });
    }
    tabDefs.forEach((t) => t.tab.addEventListener("click", () => selectTab(t.key)));
    tabs.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      const cur = tabDefs.findIndex((t) => t.tab.getAttribute("aria-selected") === "true");
      const delta = e.key === "ArrowRight" ? 1 : -1;
      const next = tabDefs[(cur + delta + tabDefs.length) % tabDefs.length];
      selectTab(next.key);
      next.tab.focus();
    });

    const body = el("div", { class: "body" }, [detailsPane, appPane, resumePane]);

    // ---- Details fields: fill (from extraction/restore), persist (debounced), extract on demand ----
    const edited = new Set();
    function fillInput(inp, value, key) {
      if (!value || edited.has(inp)) return;
      if (key === "title" || !inp.value.trim()) {
        inp.value = value;
        current[key] = value;
      }
    }
    function fillFields(fields) {
      if (fields && typeof fields === "object") {
        fillInput(title.input, fields.title, "title");
        fillInput(company.input, fields.company, "company");
        fillInput(location.input, fields.location, "location");
        fillInput(salaryF.input, fields.salary, "salary");
        if (fields.employmentType && !current.employmentType) {
          current.employmentType = fields.employmentType;
          addChip("employmentType", fields.employmentType);
        }
        if (fields.workplaceType && !current.workplaceType) {
          current.workplaceType = fields.workplaceType;
          addChip("workplaceType", fields.workplaceType);
        }
      }
    }
    function applyCleanedDescription(text) {
      const trimmed = (text || "").trim();
      if (!trimmed) return;
      current.description = trimmed;
      descBox.classList.remove("empty");
      renderRichText(descBox, trimmed);
      updateDescClamp();
    }
    function applyExtraction(result) {
      const res = result && typeof result === "object" ? result : {};
      fillFields(res.fields || {});
      applyCleanedDescription(res.description);
      updateFieldWarnings();
    }

    // Persist a snapshot of the editable Details so it survives close / sub-URL navigation.
    // Debounced on input; flushed synchronously on close (see activeFlush). Empty snapshots
    // are skipped so a bare open→close never writes a junk record.
    let persistTimer = null;
    function detailsSnapshot() {
      return {
        title: title.input.value.trim(),
        company: company.input.value.trim(),
        location: location.input.value.trim(),
        salary: salaryF.input.value.trim(),
        url: url.input.value.trim(),
        employmentType: current.employmentType || "",
        workplaceType: current.workplaceType || "",
        description: current.description || "",
        notes: notesInput.value.trim(),
        extracted: detailsExtracted,
      };
    }
    function persistDetails() {
      if (typeof opts.onDetailsChange !== "function") return;
      const s = detailsSnapshot();
      if (!(s.title || s.company || s.location || s.salary || s.description || s.notes || s.extracted)) {
        return;
      }
      try {
        opts.onDetailsChange(s);
      } catch (_) {}
    }
    function schedulePersist() {
      if (persistTimer) clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        persistTimer = null;
        persistDetails();
      }, 400);
    }
    // Flush hook invoked by close() (synchronous, so writes land before a navigation).
    activeFlush = function () {
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      persistDetails();
    };
    [title.input, company.input, location.input, salaryF.input, url.input, notesInput].forEach(
      (inp) => {
        inp.addEventListener("input", () => {
          edited.add(inp);
          schedulePersist();
          updateFieldWarnings();
        });
      },
    );

    // Live thousands separators for any number typed into Salary — manual or extracted. Free-text
    // friendly: only integer runs of 4+ digits are grouped, so currency symbols, ranges
    // ("120000 - 160000"), units ("/yr") and decimals survive. Caret is preserved by digit count so
    // typing mid-number doesn't jump. Generic — no locale/currency assumptions.
    function groupThousands(str) {
      return String(str).replace(/\d[\d,]*/g, (m) => {
        const digits = m.replace(/,/g, "");
        return digits.length < 4 ? digits : digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      });
    }
    salaryF.input.addEventListener("input", () => {
      const before = salaryF.input.value;
      const formatted = groupThousands(before);
      if (formatted === before) return;
      const caret = salaryF.input.selectionStart == null ? before.length : salaryF.input.selectionStart;
      const digitsBefore = before.slice(0, caret).replace(/\D/g, "").length;
      salaryF.input.value = formatted;
      let pos = 0;
      let seen = 0;
      while (pos < formatted.length && seen < digitsBefore) {
        if (/\d/.test(formatted[pos])) seen++;
        pos++;
      }
      try {
        salaryF.input.setSelectionRange(pos, pos);
      } catch (_) {}
    });

    // detailsInteracted guards the async restore below from clobbering a fresh extraction the
    // user kicked off first (mirrors the Application tab's appInteracted).
    let detailsInteracted = false;
    function runDetailsExtraction() {
      if (typeof opts.onExtractDetails !== "function") return;
      detailsInteracted = true;
      let estimatedTokens = null;
      setDetailsState("loading");
      Promise.resolve()
        .then(() => opts.onExtractDetails())
        .then((res) => {
          estimatedTokens = res && res.estimatedTokens;
          // Update loading state with estimated tokens
          if (estimatedTokens) {
            setDetailsState("loading", null, { estimated: estimatedTokens });
          }
          applyExtraction(res);
          setDetailsState("done", null, res && res.usage);
          // Adaptive UX: the capture knows an application form is on this page — surface the
          // next step instead of waiting for the user to find the Application tab.
          if (res && res.detected && res.detected.hasApplicationForm) {
            const go = el("button", {
              class: "dx-re dx-hintbtn",
              type: "button",
              title: "This page also has an application form — extract its questions",
            });
            go.append(icon(ICON.sparkles), el("span", { text: "Form detected — pick questions" }));
            go.addEventListener("click", (e) => {
              e.stopPropagation();
              selectTab("app");
            });
            dxText.append(go);
          }
          persistDetails();
        })
        .catch((err) => {
          console.error("[JobTracker] Details extraction failed:", err);
          // Capture estimated tokens from error object if present
          const tokens = estimatedTokens || (err && err.estimatedTokens);
          const errorMsg = err && err.message ? err.message : String(err);
          const tokenInfo = tokens ? ` [${tokens} input tokens]` : "";
          setDetailsState("error", errorMsg + tokenInfo);
        });
    }

    // Restore a previously saved Details snapshot for this posting (incl. one anchored on a
    // parent URL) so reopening — or landing on a sub-page like /apply — isn't blank.
    function restoreDetails(d) {
      if (d.title) fillInput(title.input, d.title, "title");
      if (d.company) fillInput(company.input, d.company, "company");
      if (d.location) fillInput(location.input, d.location, "location");
      if (d.salary) fillInput(salaryF.input, d.salary, "salary");
      // Prefer the anchored posting URL over the seeded one (e.g. restore the job page's link
      // even when reopened on its …/apply step), as long as the user hasn't edited the field.
      if (d.url && !edited.has(url.input)) {
        url.input.value = d.url;
        current.url = d.url;
      }
      if (d.employmentType && !current.employmentType) {
        current.employmentType = d.employmentType;
        addChip("employmentType", d.employmentType);
      }
      if (d.workplaceType && !current.workplaceType) {
        current.workplaceType = d.workplaceType;
        addChip("workplaceType", d.workplaceType);
      }
      if (d.description) applyCleanedDescription(d.description);
      if (d.notes && !notesInput.value.trim()) notesInput.value = d.notes;
      if (d.extracted) setDetailsState("done");
      updateFieldWarnings();
    }
    if (typeof opts.loadDetails === "function") {
      Promise.resolve()
        .then(() => opts.loadDetails())
        .then((saved) => {
          if (!detailsInteracted && saved) restoreDetails(saved);
        })
        .catch(() => {});
    }

    // ---- AI prep toggle — COMMENTED OUT for now ----
    // REVERT(prep-with-AI): to bring the toggle back, uncomment the block below, re-add `aiCard` to
    // the actionbar children, and restore the `if (aiCard) aiCard.style.display = ""` reveal in
    // renderAppResult. Until then `aiInput` is a stub so the save payload still carries aiPrep:false.
    // const aiInput = el("input", { type: "checkbox", role: "switch", "aria-label": "Prepare my application with AI" });
    // const aiSwitch = el("span", { class: "switch" }, [aiInput, el("span", { class: "track" }), el("span", { class: "thumb" })]);
    // const aiIc = el("span", { class: "ai-ic" });
    // aiIc.append(icon(ICON.sparkles));
    // const aiCard = el(
    //   "label",
    //   { class: "aibar", title: "Tailors your resume and pre-fills application fields in the background after saving." },
    //   [
    //     aiIc,
    //     el("span", { class: "aibar-text" }, [
    //       el("span", { text: "Prep with AI" }),
    //       el("span", { class: "credits", text: "Uses credits" }),
    //     ]),
    //     aiSwitch,
    //   ],
    // );
    // aiInput.addEventListener("change", () => {
    //   try {
    //     chrome.storage && chrome.storage.local.set({ [PREF_KEY]: aiInput.checked });
    //   } catch (_) {}
    // });
    // try {
    //   chrome.storage &&
    //     chrome.storage.local.get(PREF_KEY, (r) => {
    //       if (r && r[PREF_KEY]) aiInput.checked = true;
    //     });
    // } catch (_) {}
    const aiInput = { checked: false };
    const aiCard = null;

    // ---- action bar (status → actions, one fixed region) ----
    // The action row is dynamic: an unsaved posting shows "Save application"; once saved (now,
    // or persisted from a prior visit to this URL), it shows "View in dashboard" + a quiet
    // "Save changes" so edits can still be pushed (the API upserts by URL).
    const status = el("div", { class: "status" });
    let savedJob = opts.savedJob && opts.savedJob.id ? opts.savedJob : null;
    const actionsRow = el("div", { class: "actions" });
    // Status sits at the top of the fixed footer — persistent across tabs, right above the primary
    // Save / View action so setting a stage and committing read as one gesture.
    const actionbar = el("div", { class: "actionbar" }, [statusFooter, status, actionsRow]);

    // Non-modal: the page stays interactive alongside the panel, so aria-modal is false.
    panelEl = el(
      "div",
      { class: "panel", role: "dialog", "aria-modal": "false", "aria-label": "Save to jobhq" },
      [head, tabs, body, actionbar],
    );
    const handle = el("button", { class: "handle", type: "button", "aria-label": "Expand panel" });
    handle.append(icon(ICON.expand));
    panelEl.append(handle);
    overlayEl = el("div", { class: "overlay" }, [panelEl]);

    // ---- wiring (no outside-click close: the panel is non-modal) ----
    closeBtn.addEventListener("click", close);
    collapseBtn.addEventListener("click", () => setCollapsed(true));
    handle.addEventListener("click", () => setCollapsed(false));
    shadow.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });

    const viewUrl = () => (savedJob && savedJob.viewUrl) || opts.dashboardUrl || "#";

    function showSuccess(finalJob) {
      const check = el("div", { class: "check" });
      check.append(icon(ICON.check));
      const sub = finalJob.company
        ? `${finalJob.title} · ${finalJob.company}`
        : finalJob.title || "It's now in your tracker.";
      const cta = el("a", { class: "btn btn--primary btn--lg cta", href: viewUrl(), target: "_blank", rel: "noopener" });
      cta.append(el("span", { text: "View in dashboard" }), icon(ICON.arrow));
      const done = el("button", { class: "done", type: "button", text: "Done" });
      done.addEventListener("click", close);
      const view = el("div", { class: "success" }, [
        check,
        el("h3", { text: "Saved to jobhq" }),
        el("p", { text: sub }),
        cta,
        done,
      ]);
      head.style.display = "none";
      tabs.style.display = "none";
      body.style.display = "none";
      actionbar.style.display = "none";
      panelEl.append(view);
      cta.focus();
    }

    // The single save path, shared by the first save and a later "Save changes". `btn` is the
    // control that was clicked, so its label can reflect progress without touching the others.
    async function runSave(btn) {
      const finalJob = {
        ...current,
        title: title.input.value.trim() || current.title,
        company: company.input.value.trim() || current.company,
        location: location.input.value.trim() || undefined,
        salary: salaryF.input.value.trim() || undefined,
        url: url.input.value.trim() || current.url || "",
        notes: notesInput.value.trim() || undefined,
        status: statusValue,
        aiPrep: aiInput.checked,
      };
      Array.from(actionsRow.children).forEach((c) => (c.disabled = true));
      const restore = btn.cloneNode(true);
      btn.replaceChildren(el("span", { text: "Saving…" }));
      status.className = "status";
      status.textContent = "";
      try {
        const result = await opts.onConfirm(finalJob);
        if (result && result.viewUrl) savedJob = { id: result.id, viewUrl: result.viewUrl };
        showSuccess(finalJob);
      } catch (err) {
        Array.from(actionsRow.children).forEach((c) => (c.disabled = false));
        btn.replaceChildren(...restore.childNodes);
        status.className = "status err";
        status.textContent = "Couldn't save: " + (err && err.message ? err.message : "unknown error");
      }
    }

    // ---- pre-save warnings for blank important fields (title / company / description) ----
    // We never hard-block a save (the user may genuinely want to track a sparse posting), but a
    // blank important field is almost always a capture miss — so the first Save click WARNS and
    // asks for confirmation ("Save anyway") instead of saving immediately.
    let overrideWarnings = false; // set once the user confirms; the next Save click proceeds
    function importantMissing() {
      const missing = [];
      if (!title.input.value.trim()) missing.push("title");
      if (!company.input.value.trim()) missing.push("company");
      if (!descHasContent()) missing.push("description");
      return missing;
    }
    function joinList(items) {
      if (items.length === 1) return items[0];
      if (items.length === 2) return items[0] + " or " + items[1];
      return items.slice(0, -1).join(", ") + ", or " + items[items.length - 1];
    }
    // Toggle the per-field amber markers, and keep any active "Save anyway" warning in sync as the
    // user fills fields — clearing it (and restoring the normal Save button) once nothing's missing.
    function updateFieldWarnings() {
      const missing = importantMissing();
      titleWarn.style.display = missing.includes("title") ? "" : "none";
      companyWarn.style.display = missing.includes("company") ? "" : "none";
      descWarn.style.display = missing.includes("description") ? "" : "none";
      if (!overrideWarnings) return;
      if (missing.length === 0) {
        overrideWarnings = false;
        status.className = "status";
        status.textContent = "";
        renderActions();
      } else {
        status.className = "status warn";
        status.replaceChildren(
          icon(ICON.alert),
          el("span", { text: "No " + joinList(missing) + " captured. Save anyway?" }),
        );
      }
    }
    // Save entry point: warn-then-confirm on the first click if anything important is blank,
    // otherwise save straight through.
    function attemptSave(btn) {
      if (!overrideWarnings && importantMissing().length) {
        overrideWarnings = true;
        btn.replaceChildren(icon(ICON.bookmark), el("span", { text: "Save anyway" }));
        updateFieldWarnings();
        return;
      }
      runSave(btn);
    }

    // Build the action row for the current saved/unsaved state. Returns the primary control so
    // the caller can focus it on reveal.
    function renderActions() {
      actionsRow.replaceChildren();
      if (savedJob) {
        const change = el("button", { class: "btn btn--ghost", type: "button" });
        change.append(el("span", { text: "Save changes" }));
        change.addEventListener("click", () => attemptSave(change));
        const viewBtn = el("a", { class: "btn btn--primary", href: viewUrl(), target: "_blank", rel: "noopener" });
        viewBtn.append(el("span", { text: "View in dashboard" }), icon(ICON.arrow));
        actionsRow.append(change, viewBtn);
        return viewBtn;
      }
      const saveBtn = el("button", { class: "btn btn--primary", type: "button" });
      saveBtn.append(icon(ICON.bookmark), el("span", { text: "Save to dashboard" }));
      saveBtn.addEventListener("click", () => attemptSave(saveBtn));
      actionsRow.append(saveBtn);
      return saveBtn;
    }
    const primaryAction = renderActions();
    // Initial paint of the blank-field markers (extraction/restore refresh them as data arrives).
    updateFieldWarnings();

    shadow.append(style, overlayEl);
    // Attach to <html> (outside the host page's React/SPA root) so a re-render of <body> can't drop
    // the open drawer mid-use, the way it does to body-attached overlays on Greenhouse et al.
    (document.documentElement || document.body).appendChild(host);

    // Slide in, then measure the description so the clamp/"Show more" is accurate.
    const reveal = () => {
      if (panelEl) panelEl.classList.add("open");
      updateDescClamp();
    };
    // Paint the To-do section (local-first; restores its list from the posting's record).
    renderTodos();
    if (reduceMotion) {
      reveal();
    } else {
      requestAnimationFrame(() => requestAnimationFrame(reveal));
    }
    if (primaryAction && primaryAction.focus) primaryAction.focus();
  }

  UI.modal = { open, close };
})(typeof self !== "undefined" ? self : this);
