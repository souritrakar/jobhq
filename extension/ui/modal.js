// Save panel — a right-anchored, non-modal drawer rendered in a Shadow DOM. It slides in from
// the edge, leaves the page fully interactive, and is dismissed only via its own controls
// (X closes; chevron collapses to a reopen handle; Esc closes). Two tabs:
//   • Details     — the parsed job, shown as an editable identity + property list and a clean
//                   rendered description (progressive disclosure). Auto-extracts on open.
//   • Application — the form's questions, a user-triggered, progress-tracked review.
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
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
    alert:
      '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  };

  let host = null;
  let shadow = null;
  let lastFocus = null;
  let overlayEl = null;
  let panelEl = null;
  let reduceMotion = false;
  // Set by open(): flushes the current Details snapshot to storage synchronously. Called on
  // close so the latest edits survive even when close is triggered by a navigation.
  let activeFlush = null;

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
        --accent:oklch(0.58 0.13 150);
        --accent-press:oklch(0.52 0.13 150);
        --accent-ink:oklch(0.46 0.1 152);
        --accent-bg:oklch(0.965 0.022 150);
        --accent-fg:oklch(0.99 0.01 145);
        --danger:oklch(0.55 0.16 25);
        --danger-bg:oklch(0.965 0.018 25);
        /* Star / "flagged for review" — warm amber, distinct from the fern accent and
           the red danger so "important" reads as its own semantic. */
        --star:oklch(0.74 0.14 75);
        --star-ink:oklch(0.56 0.12 70);
        --r1:6px; --r2:8px; --r3:12px; --r4:16px;
        --shadow-panel:-10px 0 30px oklch(0.2 0.02 250 / .08);
        --ring:0 0 0 2px oklch(0.58 0.13 150 / .2);
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

      /* ---- tabs ---- */
      .tabs{flex:0 0 auto;display:flex;gap:4px;padding:0 12px;border-bottom:1px solid var(--line);}
      .tab{display:inline-flex;align-items:center;gap:6px;font-family:var(--font);font-size:13px;
        font-weight:600;color:var(--ink-3);background:none;border:none;cursor:pointer;padding:10px 10px;
        border-bottom:2px solid transparent;margin-bottom:-1px;
        transition:color .12s ease,border-color .12s ease;}
      .tab:hover{color:var(--ink);}
      .tab[aria-selected="true"]{color:var(--accent-ink);border-bottom-color:var(--accent);}
      .tab svg{width:15px;height:15px;}
      .tab:focus-visible{outline:2px solid var(--accent);outline-offset:-3px;border-radius:6px;}

      /* ---- scrollable body + panes ---- */
      .body{flex:1 1 auto;overflow:auto;display:flex;flex-direction:column;}
      .pane{flex:1 1 auto;display:flex;flex-direction:column;gap:14px;padding:16px 16px 20px;}
      .pane[hidden]{display:none;}

      /* reading indicator (extraction status, Details) */
      .finding{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:500;
        color:var(--accent-ink);}
      .finding svg{width:14px;height:14px;flex:0 0 auto;}
      .finding.muted{color:var(--ink-3);}

      /* ---- Details: user-triggered AI extract bar (idle button → loading → done → error) ---- */
      .dx{display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-height:32px;}
      .dx .dx-btn{padding:7px 12px;}
      .dx .dx-note{min-width:0;}
      /* "Re-extract" affordance shown once the fields are filled (quiet, inline). */
      .dx-re{display:inline-flex;align-items:center;gap:5px;background:none;border:none;cursor:pointer;
        font-family:var(--font);font-size:12px;font-weight:600;color:var(--ink-3);padding:2px 4px;
        border-radius:6px;transition:background .12s ease,color .12s ease;}
      .dx-re:hover{background:var(--bg-hover);color:var(--ink);}
      .dx-re svg{width:13px;height:13px;}
      .dx-re:focus-visible{outline:2px solid var(--accent);outline-offset:1px;}

      /* ---- Details: identity + properties (Notion-style editable) ---- */
      .di{width:100%;font-family:var(--font);color:var(--ink);background:transparent;border:none;
        border-radius:var(--r1);padding:5px 7px;transition:background .12s ease,box-shadow .12s ease;}
      .di::placeholder{color:var(--ink-3);}
      .di:hover{background:var(--bg-hover);}
      .di:focus{outline:none;background:var(--bg-sunken);box-shadow:var(--ring);}
      .di.pending::placeholder{color:var(--accent-ink);font-style:italic;}

      .identity{display:flex;flex-direction:column;gap:1px;}
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
      .apphead-count{font-size:12px;font-weight:500;color:var(--ink-3);}
      .apphead-flagged{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:600;
        color:var(--star-ink);}
      .apphead-flagged svg{width:13px;height:13px;fill:currentColor;stroke:currentColor;}
      .reextract{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 10px;
        background:none;border:none;cursor:pointer;font-family:var(--font);font-size:12px;
        font-weight:600;color:var(--ink-3);border-radius:6px;
        transition:background .12s ease,color .12s ease;}
      .reextract:hover{background:var(--bg-hover);color:var(--ink);}
      .reextract svg{width:14px;height:14px;}
      .reextract:focus-visible{outline:2px solid var(--accent);outline-offset:1px;}

      /* ---- action bar (one fixed region: status → AI toggle → buttons) ---- */
      .actionbar{flex:0 0 auto;border-top:1px solid var(--line);background:var(--bg);}
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
        box-shadow:0 0 0 8px oklch(0.58 0.13 150 / .06);}
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
  //             onApplicationExtracted })
  function open(job, opts) {
    opts = opts || {};
    if (host) removeHost();
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
    const source = (job.source || "").trim();
    const titles = el("div", { class: "titles" }, [
      el("h2", { text: "Save to tracker" }),
      el("span", { class: "sub", text: source || "Review the details, then save" }),
    ]);
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
    let detailsExtracted = false;
    const dxBtn = el("button", { class: "btn btn--ghost dx-btn", type: "button" });
    const dxNote = el("span", { class: "finding dx-note" });
    const detailsBar = el("div", { class: "dx" }, [dxBtn, dxNote]);
    dxBtn.addEventListener("click", runDetailsExtraction);

    function setDetailsState(state) {
      detailsExtracted = state === "done";
      dxNote.replaceChildren();
      if (state === "loading") {
        dxBtn.style.display = "none";
        dxNote.className = "finding loading dx-note";
        dxNote.append(icon(ICON.sparkles), el("span", { text: "Reading this posting…" }));
        dxNote.style.display = "";
      } else if (state === "done") {
        dxBtn.style.display = "none";
        dxNote.className = "finding dx-note";
        const re = el("button", { class: "dx-re", type: "button", title: "Extract again" });
        re.append(icon(ICON.refresh), el("span", { text: "Re-extract" }));
        re.addEventListener("click", runDetailsExtraction);
        dxNote.append(icon(ICON.check), el("span", { text: "Auto-filled by AI" }), re);
        dxNote.style.display = "";
      } else if (state === "error") {
        dxBtn.style.display = "";
        dxBtn.replaceChildren(icon(ICON.refresh), el("span", { text: "Try again" }));
        dxNote.className = "finding muted dx-note";
        dxNote.append(el("span", { text: "Couldn't auto-fill — enter the details manually." }));
        dxNote.style.display = "";
      } else {
        // idle
        dxBtn.style.display = "";
        dxBtn.replaceChildren(icon(ICON.sparkles), el("span", { text: "Extract with AI" }));
        dxNote.style.display = "none";
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
      el("span", { class: "eyebrow", text: "Your notes" }),
      notesInput,
    ]);

    // ---- reminders (only meaningful for a SAVED posting — the section gates itself otherwise) ----
    // A ruled block matching Description / Your notes. The list + add form are rendered by the
    // sibling ui/reminders.js module, handed the saved job id (or null → "save first" gate).
    const remindersBox = el("div", { class: "reminders-box" });
    const remindersWrap = el("div", { class: "notes-wrap" }, [
      el("span", { class: "eyebrow", text: "Reminders" }),
      remindersBox,
    ]);
    function renderReminders() {
      if (root.JTReminders && typeof root.JTReminders.render === "function") {
        root.JTReminders.render(remindersBox, {
          jobId: savedJob && savedJob.id ? savedJob.id : null,
          host,
        });
      }
    }

    const detailsPane = el(
      "div",
      { class: "pane", id: "jt-pane-details", role: "tabpanel", "aria-labelledby": "jt-tab-details" },
      [detailsBar, identity, props, meta, descWrap, notesWrap, remindersWrap],
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
      const btn = el("button", {
        class: "btn btn--primary btn--lg appextract" + (loading ? " loading" : ""),
        type: "button",
      });
      if (loading) btn.disabled = true;
      btn.append(icon(btnIcon), el("span", { text: btnLabel }));
      if (!loading) btn.addEventListener("click", runAppExtraction);
      appPane.append(
        el("div", { class: "appstate" + (kind === "err" ? " err" : "") }, [
          ic,
          el("h3", { text: heading }),
          el("p", { text }),
          btn,
        ]),
      );
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
      const reBtn = el("button", { class: "reextract", type: "button", title: "Extract again" });
      reBtn.append(icon(ICON.refresh), el("span", { text: "Re-extract" }));
      reBtn.addEventListener("click", runAppExtraction);
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

      const header = el("div", { class: "apphead" }, [
        el("div", { class: "apphead-row" }, [
          el("div", { class: "apphead-label" }, [
            el("span", { class: "apphead-title", text: "Application" }),
            el("span", { class: "apphead-count", text: count }),
            flaggedBadge,
          ]),
          reBtn,
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
      // In the read-only answer view, a quiet caption tells the user these are their saved values
      // (mirrored from the web app) and where to edit them — so the disabled fields don't read as broken.
      if (readOnly) {
        appPane.append(
          el("p", {
            class: "apphint",
            text: "Your saved answers, mirrored from the web app (read-only). Copy from here, or edit in the dashboard.",
          }),
        );
      }
      appPane.append(grid);
      updateFlagged();
      // Application questions now exist for this page → the AI-prep toggle becomes meaningful.
      if (aiCard) aiCard.style.display = "";
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

    renderAppBlank();

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
    const tabDetails = makeTab("details", "Details", ICON.text, true);
    const tabApp = makeTab("app", "Application", ICON.clipboard, false);
    const tabs = el("div", { class: "tabs", role: "tablist", "aria-label": "Panel sections" }, [
      tabDetails,
      tabApp,
    ]);
    function selectTab(which) {
      const onDetails = which === "details";
      tabDetails.setAttribute("aria-selected", onDetails ? "true" : "false");
      tabApp.setAttribute("aria-selected", onDetails ? "false" : "true");
      tabDetails.tabIndex = onDetails ? 0 : -1;
      tabApp.tabIndex = onDetails ? -1 : 0;
      detailsPane.hidden = !onDetails;
      appPane.hidden = onDetails;
    }
    tabDetails.addEventListener("click", () => selectTab("details"));
    tabApp.addEventListener("click", () => selectTab("app"));
    tabs.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      const toApp = e.key === "ArrowRight";
      selectTab(toApp ? "app" : "details");
      (toApp ? tabApp : tabDetails).focus();
    });

    const body = el("div", { class: "body" }, [detailsPane, appPane]);

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

    // detailsInteracted guards the async restore below from clobbering a fresh extraction the
    // user kicked off first (mirrors the Application tab's appInteracted).
    let detailsInteracted = false;
    function runDetailsExtraction() {
      if (typeof opts.onExtractDetails !== "function") return;
      detailsInteracted = true;
      setDetailsState("loading");
      Promise.resolve()
        .then(() => opts.onExtractDetails())
        .then((res) => {
          applyExtraction(res);
          setDetailsState("done");
          persistDetails();
        })
        .catch(() => setDetailsState("error"));
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

    // ---- AI prep toggle (opt-in, off by default; choice persists) ----
    const aiInput = el("input", { type: "checkbox", role: "switch", "aria-label": "Prepare my application with AI" });
    const aiSwitch = el("span", { class: "switch" }, [aiInput, el("span", { class: "track" }), el("span", { class: "thumb" })]);
    const aiIc = el("span", { class: "ai-ic" });
    aiIc.append(icon(ICON.sparkles));
    const aiCard = el(
      "label",
      { class: "aibar", title: "Tailors your resume and pre-fills application fields in the background after saving." },
      [
        aiIc,
        el("span", { class: "aibar-text" }, [
          el("span", { text: "Prep with AI" }),
          el("span", { class: "credits", text: "Uses credits" }),
        ]),
        aiSwitch,
      ],
    );
    aiInput.addEventListener("change", () => {
      try {
        chrome.storage && chrome.storage.local.set({ [PREF_KEY]: aiInput.checked });
      } catch (_) {}
    });
    try {
      chrome.storage &&
        chrome.storage.local.get(PREF_KEY, (r) => {
          if (r && r[PREF_KEY]) aiInput.checked = true;
        });
    } catch (_) {}

    // ---- action bar (status → AI toggle → actions, one fixed region) ----
    // The AI-prep toggle stays hidden until application questions exist for this page —
    // there's nothing to "prep" before then. revealAiCard() is called from renderAppResult.
    // The action row is dynamic: an unsaved posting shows "Save application"; once saved (now,
    // or persisted from a prior visit to this URL), it shows "View in dashboard" + a quiet
    // "Save changes" so edits can still be pushed (the API upserts by URL).
    const status = el("div", { class: "status" });
    aiCard.style.display = "none";
    let savedJob = opts.savedJob && opts.savedJob.id ? opts.savedJob : null;
    const actionsRow = el("div", { class: "actions" });
    const actionbar = el("div", { class: "actionbar" }, [status, aiCard, actionsRow]);

    // Non-modal: the page stays interactive alongside the panel, so aria-modal is false.
    panelEl = el(
      "div",
      { class: "panel", role: "dialog", "aria-modal": "false", "aria-label": "Save to JobTracker" },
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
        el("h3", { text: "Saved to JobTracker" }),
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
        // The posting now has an id → the reminders section can leave its "save first" gate.
        renderReminders();
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
      saveBtn.append(icon(ICON.bookmark), el("span", { text: "Save application" }));
      saveBtn.addEventListener("click", () => attemptSave(saveBtn));
      actionsRow.append(saveBtn);
      return saveBtn;
    }
    const primaryAction = renderActions();
    // Initial paint of the blank-field markers (extraction/restore refresh them as data arrives).
    updateFieldWarnings();

    shadow.append(style, overlayEl);
    document.body.appendChild(host);

    // Slide in, then measure the description so the clamp/"Show more" is accurate.
    const reveal = () => {
      if (panelEl) panelEl.classList.add("open");
      updateDescClamp();
    };
    // Paint the reminders section now that savedJob is initialized (gates itself if unsaved).
    renderReminders();
    if (reduceMotion) {
      reveal();
    } else {
      requestAnimationFrame(() => requestAnimationFrame(reveal));
    }
    if (primaryAction && primaryAction.focus) primaryAction.focus();
  }

  UI.modal = { open, close };
})(typeof self !== "undefined" ? self : this);
