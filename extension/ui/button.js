// Save-Job button. Rendered in a Shadow DOM so the host page's CSS can't restyle it and
// ours can't leak. Fern-green identity, mirrors the tokens in popup/popup.css.
//
// It is ALWAYS present (extraction is user-triggered on any site), so UX-wise it has to be
// reachable without ever getting in the way:
//   • icon-only + small (a 36px circle) → minimal footprint, no text clutter
//   • upper-right, but offset BELOW the typical fixed site header (top:90px) so it never
//     overlaps a site's own nav/search/account controls
//   • dimmed at rest (opacity .5) and fully opaque on hover/focus → fades into busy pages
//     but is obviously clickable when you reach for it
//   • native tooltip (title) restores the label that the icon-only form drops
// Exposes JobTracker.ui.button with show/hide/setState. Isolated-world global.
(function (root) {
  const NS = (root.JobTracker = root.JobTracker || {});
  const UI = (NS.ui = NS.ui || {});

  const HOST_ID = "jobtracker-save-host";
  const SVGNS = "http://www.w3.org/2000/svg";
  const SAVED_REVERT_MS = 2200; // dev button only: how long its dummy tick lingers before reverting
  const TOKENS = {
    primary: "oklch(0.58 0.13 150)",
    primaryHover: "oklch(0.52 0.13 150)",
    primaryFg: "oklch(0.99 0.01 145)",
    ring: "oklch(0.58 0.13 150)",
    shadow: "0 4px 14px oklch(0.28 0.02 250 / 0.20)",
  };
  // lucide-style line icons, drawn at currentColor.
  const ICON = {
    bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
  };
  const TITLES = { idle: "Save to Tracker", saved: "Saved to Tracker" };

  let hostEl = null;
  let btnEl = null;
  let iconEl = null;
  let onClick = null;

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

  function ensure() {
    if (hostEl && document.body && document.body.contains(hostEl)) return;
    if (!document.body) return; // non-HTML document (e.g. a standalone SVG/XML) — nothing to attach to
    hostEl = document.createElement("div");
    if (!hostEl.style) {
      // SVG/XML documents create elements with no CSSStyleDeclaration — bail instead of throwing.
      hostEl = null;
      return;
    }
    hostEl.id = HOST_ID;
    hostEl.style.all = "initial";
    const r = hostEl.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      .fab{position:fixed;top:90px;right:16px;z-index:2147483646;
        display:inline-flex;align-items:center;justify-content:center;
        width:36px;height:36px;padding:0;background:${TOKENS.primary};color:${TOKENS.primaryFg};
        border:none;border-radius:50%;cursor:pointer;box-shadow:${TOKENS.shadow};
        opacity:.5;transition:background .15s ease,transform .15s ease,opacity .15s ease;}
      .fab:hover{background:${TOKENS.primaryHover};opacity:1;transform:translateY(-1px);}
      .fab:focus-visible{outline:2px solid ${TOKENS.ring};outline-offset:2px;opacity:1;}
      .fab:active{transform:translateY(0);}
      .fab.saved{opacity:1;}
      .fab svg{width:18px;height:18px;}
      .fab.pop{animation:jt-pop .32s ease;}
      @keyframes jt-pop{0%{transform:scale(1)}40%{transform:scale(1.18)}100%{transform:scale(1)}}
      @media (prefers-reduced-motion: reduce){
        .fab{transition:background .15s ease,opacity .15s ease;} .fab:hover{transform:none;}
        .fab.pop{animation:none;}}
    `;
    btnEl = document.createElement("button");
    btnEl.type = "button";
    btnEl.className = "fab";
    btnEl.setAttribute("aria-label", TITLES.idle);
    btnEl.title = TITLES.idle;
    iconEl = icon(ICON.bookmark);
    btnEl.append(iconEl);
    btnEl.addEventListener("click", () => onClick && onClick());
    r.append(style, btnEl);
    document.body.appendChild(hostEl);
  }

  UI.button = {
    show(handler) {
      onClick = handler;
      ensure();
      if (!hostEl) return; // non-injectable document — skip silently
      hostEl.style.display = "";
      this.setState("idle");
    },
    hide() {
      if (hostEl) hostEl.style.display = "none";
    },
    // The tick is a PERSISTENT per-page status light: shown whenever the current posting is
    // already saved, a bookmark otherwise. content.js re-derives it from storage on load and on
    // every route change, so it must not auto-revert. Pass { animate:true } for the one-shot
    // celebratory pop on a fresh save; passive restores (load / nav) leave it off.
    setState(state, opts) {
      ensure(); // self-heal if the host page swapped out document.body under us
      if (!hostEl || !btnEl) return;
      const saved = state === "saved";
      iconEl.innerHTML = saved ? ICON.check : ICON.bookmark;
      btnEl.title = saved ? TITLES.saved : TITLES.idle;
      btnEl.setAttribute("aria-label", saved ? TITLES.saved : TITLES.idle);
      btnEl.classList.toggle("saved", saved);
      if (saved && opts && opts.animate) {
        btnEl.classList.remove("pop");
        void btnEl.offsetWidth; // force reflow so the animation can replay on a repeat save
        btnEl.classList.add("pop");
      } else if (!saved) {
        btnEl.classList.remove("pop");
      }
    },
  };

  // ============ Dev / dummy button ============
  // A second pill that opens the SAME save panel but seeded entirely with local dummy data
  // (no backend, no Groq) so the modal's Details + Application UI can be iterated on instantly.
  // Distinguished from the real button by an amber tint + flask icon, and parked just below it.
  const DEV_HOST_ID = "jobtracker-devsave-host";
  const DEV_TOKENS = {
    primary: "oklch(0.72 0.15 70)",
    primaryHover: "oklch(0.66 0.15 70)",
    primaryFg: "oklch(0.99 0.01 95)",
    ring: "oklch(0.72 0.15 70)",
    shadow: "0 4px 14px oklch(0.28 0.02 250 / 0.20)",
  };
  // lucide flask-conical — reads as "test / dummy / lab".
  const DEV_ICON = {
    flask:
      '<path d="M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2"/><path d="M6.453 15h11.094"/><path d="M8.5 2h7"/>',
    check: ICON.check,
  };
  const DEV_TITLES = { idle: "Save with dummy data (dev)", saved: "Filled with dummy data" };

  let devHostEl = null;
  let devBtnEl = null;
  let devIconEl = null;
  let devOnClick = null;
  let devRevertTimer = null;

  function devEnsure() {
    if (devHostEl && document.body && document.body.contains(devHostEl)) return;
    if (!document.body) return;
    devHostEl = document.createElement("div");
    if (!devHostEl.style) {
      devHostEl = null;
      return;
    }
    devHostEl.id = DEV_HOST_ID;
    devHostEl.style.all = "initial";
    const r = devHostEl.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    // Parked one button-height + gap below the real Save button (top:90 + 36 + 8).
    style.textContent = `
      .fab{position:fixed;top:134px;right:16px;z-index:2147483646;
        display:inline-flex;align-items:center;justify-content:center;
        width:36px;height:36px;padding:0;background:${DEV_TOKENS.primary};color:${DEV_TOKENS.primaryFg};
        border:1px dashed ${DEV_TOKENS.primaryFg};border-radius:50%;cursor:pointer;box-shadow:${DEV_TOKENS.shadow};
        opacity:.5;transition:background .15s ease,transform .15s ease,opacity .15s ease;}
      .fab:hover{background:${DEV_TOKENS.primaryHover};opacity:1;transform:translateY(-1px);}
      .fab:focus-visible{outline:2px solid ${DEV_TOKENS.ring};outline-offset:2px;opacity:1;}
      .fab:active{transform:translateY(0);}
      .fab.saved{opacity:1;}
      .fab svg{width:17px;height:17px;}
      @media (prefers-reduced-motion: reduce){
        .fab{transition:background .15s ease,opacity .15s ease;} .fab:hover{transform:none;}}
    `;
    devBtnEl = document.createElement("button");
    devBtnEl.type = "button";
    devBtnEl.className = "fab";
    devBtnEl.setAttribute("aria-label", DEV_TITLES.idle);
    devBtnEl.title = DEV_TITLES.idle;
    devIconEl = icon(DEV_ICON.flask);
    devBtnEl.append(devIconEl);
    devBtnEl.addEventListener("click", () => devOnClick && devOnClick());
    r.append(style, devBtnEl);
    document.body.appendChild(devHostEl);
  }

  UI.devButton = {
    show(handler) {
      devOnClick = handler;
      devEnsure();
      if (!devHostEl) return; // non-injectable document — skip silently
      devHostEl.style.display = "";
      this.setState("idle");
    },
    hide() {
      if (devHostEl) devHostEl.style.display = "none";
    },
    setState(state) {
      if (!devBtnEl) return;
      clearTimeout(devRevertTimer);
      const saved = state === "saved";
      devIconEl.innerHTML = saved ? DEV_ICON.check : DEV_ICON.flask;
      devBtnEl.title = saved ? DEV_TITLES.saved : DEV_TITLES.idle;
      devBtnEl.setAttribute("aria-label", saved ? DEV_TITLES.saved : DEV_TITLES.idle);
      devBtnEl.classList.toggle("saved", saved);
      if (saved) {
        devRevertTimer = setTimeout(() => UI.devButton.setState("idle"), SAVED_REVERT_MS);
      }
    },
  };
})(typeof self !== "undefined" ? self : this);
