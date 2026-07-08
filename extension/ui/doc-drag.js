// Drag a saved document (Resume tab) onto a file-upload field on the page and actually SET the file
// on it — an OS-style press-hold-move drag that ends in a real upload.
//
// Why custom (not native HTML5 drag): the browser won't let a page script inject a File we fetched
// into a genuine drag's DataTransfer, so a real OS drag can't hand our file to the page's drop
// handler. Instead this is a pointer drag with a floating ghost; on release over a file field we
// write the File programmatically (DataTransfer → input.files → native change), exactly as a real
// pick/drop does. Runs in the content-script world, so it shares the page DOM and can hit-test and
// write page inputs. Cross-origin iframe'd inputs are unreachable (elementFromPoint returns the
// <iframe>), so those fields simply don't accept the drop — as expected.
//
// Isolated-world global: JobTracker.ui.docDrag. UMD-exported for unit tests (jsdom).
(function (root, factory) {
  "use strict";
  const NS = (root.JobTracker = root.JobTracker || {});
  NS.ui = NS.ui || {};
  const api = factory(root);
  NS.ui.docDrag = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis, function (root) {
  "use strict";

  const DRAG_THRESHOLD = 5; // px of movement before a press becomes a drag (below it's a click)
  const CLIMB = 4; // how far to climb from the drop point looking for a hidden file input
  const OK_COLOR = "#3f9d5f";

  // Set a File on a native <input type=file> the way a real pick/drop does: a DataTransfer carries
  // the file, then native input+change fire so the page's framework (React, etc.) reacts.
  function setFileOnInput(input, file) {
    if (!input || !file) return false;
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
    } catch (_) {
      return false; // e.g. a disabled/detached input
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  // The file input a drop at (x,y) should target: the input itself, one linked via <label for>, or
  // one nested inside the styled dropzone/button under the cursor (ATS hide the real input behind a
  // "Attach"/"Drag to upload" area). Returns null when nothing file-like is under the point.
  function fileInputAt(x, y) {
    const el =
      root.document && typeof document.elementFromPoint === "function"
        ? document.elementFromPoint(x, y)
        : null;
    if (!el) return null;
    if (el.tagName === "INPUT" && (el.type || "").toLowerCase() === "file") return el;
    const label = el.closest && el.closest("label");
    if (label) {
      const forId = label.getAttribute("for");
      if (forId) {
        const f = document.getElementById(forId);
        if (f && f.tagName === "INPUT" && (f.type || "").toLowerCase() === "file") return f;
      }
      const inner = label.querySelector('input[type="file"]');
      if (inner) return inner;
    }
    let node = el;
    for (let i = 0; i < CLIMB && node; i++) {
      const f = node.querySelector && node.querySelector('input[type="file"]');
      if (f) return f;
      node = node.parentElement;
    }
    return null;
  }

  // The visible box to outline for a target input — the input itself if it takes space, else the
  // nearest sizeable ancestor (the styled dropzone standing in for a 0×0 hidden input).
  function highlightBoxFor(input) {
    let node = input;
    for (let i = 0; i < CLIMB && node; i++) {
      const r = node.getBoundingClientRect && node.getBoundingClientRect();
      if (r && r.width > 8 && r.height > 8) return node;
      node = node.parentElement;
    }
    return input;
  }

  // start(opts): begin a drag from a pointerdown. opts:
  //   startEvent      — the pointerdown PointerEvent on the doc row
  //   label           — filename shown in the ghost
  //   getFile()       — async () => File; kicked off the moment the drag begins so it's ready by drop
  //   onDone(result)  — { status: 'filled' | 'missed' | 'error' }
  // Below the movement threshold the press is left alone (the row's click selects it).
  function start(opts) {
    opts = opts || {};
    const startEvent = opts.startEvent;
    if (!startEvent || !root.document) return;
    const sx = startEvent.clientX;
    const sy = startEvent.clientY;
    const docEl = document.documentElement;
    const prevCursor = docEl.style.cursor;
    const prevUserSelect = docEl.style.userSelect;

    let dragging = false;
    let ghost = null;
    let filePromise = null;
    let hlBox = null;
    let hlPrev = "";

    function highlight(input) {
      const box = input ? highlightBoxFor(input) : null;
      if (box === hlBox) return;
      if (hlBox) hlBox.style.outline = hlPrev;
      hlBox = box;
      if (box) {
        hlPrev = box.style.outline;
        box.style.outline = "2px solid " + OK_COLOR;
        box.style.outlineOffset = "2px";
      }
    }

    function makeGhost() {
      const g = document.createElement("div");
      g.setAttribute("aria-hidden", "true");
      g.style.cssText =
        "position:fixed;z-index:2147483647;top:0;left:0;pointer-events:none;display:flex;" +
        "align-items:center;gap:8px;max-width:260px;padding:8px 12px;border-radius:10px;" +
        "background:#fff;box-shadow:0 10px 30px rgba(20,25,40,.24);border:1px solid rgba(20,25,40,.1);" +
        "font:600 13px/1.2 'Satoshi',system-ui,-apple-system,sans-serif;color:#20262e;" +
        "transform:translate(-50%,-135%);will-change:transform;transition:opacity .15s ease;";
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("width", "16");
      svg.setAttribute("height", "16");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", OK_COLOR);
      svg.setAttribute("stroke-width", "2");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
      svg.innerHTML =
        '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>';
      const label = document.createElement("span");
      label.textContent = opts.label || "Document";
      label.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;";
      g.append(svg, label);
      (document.body || docEl).appendChild(g);
      return g;
    }

    function flash(input, ok) {
      const box = highlightBoxFor(input);
      if (!box) return;
      const prev = box.style.outline;
      box.style.outline = "2.5px solid " + (ok ? OK_COLOR : "#c0392b");
      box.style.outlineOffset = "2px";
      setTimeout(() => {
        box.style.outline = prev;
      }, 700);
    }

    function beginDrag() {
      dragging = true;
      ghost = makeGhost();
      docEl.style.userSelect = "none";
      filePromise = Promise.resolve()
        .then(() => (opts.getFile ? opts.getFile() : null))
        .catch(() => null);
    }

    function moveTo(x, y) {
      if (ghost) {
        ghost.style.left = x + "px";
        ghost.style.top = y + "px";
      }
      const input = fileInputAt(x, y);
      highlight(input);
      docEl.style.cursor = input ? "copy" : "grabbing";
    }

    function onMove(e) {
      const x = e.clientX;
      const y = e.clientY;
      if (!dragging) {
        if (Math.abs(x - sx) < DRAG_THRESHOLD && Math.abs(y - sy) < DRAG_THRESHOLD) return;
        beginDrag();
      }
      moveTo(x, y);
      if (e.cancelable) e.preventDefault();
    }

    function cleanupVisual() {
      if (ghost) ghost.remove();
      ghost = null;
      highlight(null);
      docEl.style.cursor = prevCursor;
      docEl.style.userSelect = prevUserSelect;
    }
    function cleanupListeners() {
      document.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("pointerup", onUp, true);
      document.removeEventListener("pointercancel", onUp, true);
    }

    async function onUp(e) {
      cleanupListeners();
      if (!dragging) {
        cleanupVisual();
        return; // never crossed the threshold → a plain click; let the row select itself
      }
      // Suppress the click that fires after a real drag so it can't also toggle row selection.
      const swallow = (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      document.addEventListener("click", swallow, true);
      setTimeout(() => document.removeEventListener("click", swallow, true), 0);

      const input = fileInputAt(e.clientX, e.clientY);
      let result = { status: "missed" };
      if (input) {
        const file = await filePromise;
        const ok = file && setFileOnInput(input, file);
        result = { status: ok ? "filled" : "error" };
        flash(input, !!ok);
      }
      cleanupVisual();
      if (typeof opts.onDone === "function") {
        try {
          opts.onDone(result);
        } catch (_) {}
      }
    }

    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointerup", onUp, true);
    document.addEventListener("pointercancel", onUp, true);
  }

  return { start, setFileOnInput, fileInputAt };
});
