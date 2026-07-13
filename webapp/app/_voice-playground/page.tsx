"use client";

/**
 * Voice Typing Playground — a sandbox for the voxglide voice-typing feature.
 *
 * Speak into the mic and the voxglide SDK transcribes your speech, asks Claude
 * (via the local proxy in ../../voxglide-server) to map it onto the form below,
 * and fills the fields for you — Wispr-Flow-style dictation that organizes a
 * ramble into structured answers.
 *
 * Requires the proxy running on ws://localhost:3100:
 *   cd voxglide-server && npm run dev
 *
 * The form is intentionally UNCONTROLLED: the SDK writes straight into the DOM
 * and "Save to tracker" reads the current values via FormData — so you can save
 * mid-sentence with a partial answer, which is the behavior we want to support.
 */

import { useRef, useState } from "react";
import { VoxGlideProvider, useVoxGlide } from "@voxglide/react";

// Proxy runs on 3200 — NOT 3100, which is the webapp/backend the Chrome extension targets.
const SERVER_URL =
  process.env.NEXT_PUBLIC_VOXGLIDE_URL ?? "ws://localhost:3200";

// Fields the SDK should fill. `name` is what FormData reads; the label/placeholder
// text is the signal the LLM uses to route speech to the right field.
const FIELDS = [
  { name: "fullName", label: "Full name", placeholder: "Jane Doe", type: "input" },
  { name: "role", label: "Role applying for", placeholder: "Backend Engineer", type: "input" },
  { name: "company", label: "Company", placeholder: "GPTZero", type: "input" },
  {
    name: "whyRole",
    label: "Why do you want this role?",
    placeholder: "Speak freely. The assistant will organize it here.",
    type: "textarea",
  },
  {
    name: "notes",
    label: "Notes / voice memo",
    placeholder: "Any extra thoughts to save to the tracker.",
    type: "textarea",
  },
] as const;

export default function VoicePlaygroundPage() {
  return (
    <VoxGlideProvider
      serverUrl={SERVER_URL}
      autoContext
      tts={false}
      debug
      context="A job application form. Map the user's speech to the matching fields: full name, role applying for, company, why they want the role, and free-form notes. For rambling answers, organize the relevant parts into the matching field."
      ui={{ position: "bottom-right", theme: { preset: "light", size: "md" } }}
    >
      <Playground />
    </VoxGlideProvider>
  );
}

function Playground() {
  const { state, transcript, toggle, isReady, error } = useVoxGlide();
  const formRef = useRef<HTMLFormElement>(null);
  const [saved, setSaved] = useState<Record<string, string> | null>(null);

  function handleSave() {
    if (!formRef.current) return;
    const data = new FormData(formRef.current);
    const snapshot: Record<string, string> = {};
    for (const [key, value] of data.entries()) {
      const text = String(value).trim();
      if (text) snapshot[key] = text; // partial is fine — only keep what's filled
    }
    setSaved(snapshot);
    // Persistence is a stub for the playground.
    console.log("[voice-playground] Save to tracker:", snapshot);
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Voice Typing Playground
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Click <span className="font-medium">Start voice</span> (or the floating mic),
          speak your answers, and watch the fields fill in. Save anytime, even a partial
          answer.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-[1fr_20rem]">
        {/* ── Form ── */}
        <form ref={formRef} className="space-y-5" onSubmit={(e) => e.preventDefault()}>
          {FIELDS.map((field) => (
            <div key={field.name} className="space-y-1.5">
              <label
                htmlFor={field.name}
                className="block text-sm font-medium text-zinc-700"
              >
                {field.label}
              </label>
              {field.type === "textarea" ? (
                <textarea
                  id={field.name}
                  name={field.name}
                  rows={field.name === "whyRole" ? 5 : 3}
                  placeholder={field.placeholder}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              ) : (
                <input
                  id={field.name}
                  name={field.name}
                  type="text"
                  placeholder={field.placeholder}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
          >
            Save to tracker
          </button>

          {saved && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
                Saved snapshot {Object.keys(saved).length === 0 && "(empty)"}
              </p>
              <pre className="mt-2 overflow-x-auto text-xs text-emerald-900">
                {JSON.stringify(saved, null, 2)}
              </pre>
            </div>
          )}
        </form>

        {/* ── Voice panel ── */}
        <aside className="space-y-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-700">Voice</span>
              <StatusPill state={state} isReady={isReady} error={error} />
            </div>

            <button
              type="button"
              onClick={() => toggle()}
              disabled={!isReady}
              className="mt-3 w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {state.isListening ? "Stop voice" : "Start voice"}
            </button>

            {error && (
              <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
                <br />
                Is the proxy running? <code>cd voxglide-server &amp;&amp; npm run dev</code>
              </p>
            )}
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-zinc-700">Live transcript</p>
            <div className="mt-2 max-h-80 space-y-2 overflow-y-auto">
              {transcript.length === 0 ? (
                <p className="text-xs text-zinc-400">Nothing yet. Start speaking.</p>
              ) : (
                transcript.map((entry, i) => (
                  <div
                    key={`${entry.timestamp}-${i}`}
                    className="text-xs leading-relaxed"
                  >
                    <span
                      className={
                        entry.speaker === "user"
                          ? "font-medium text-zinc-900"
                          : "font-medium text-emerald-700"
                      }
                    >
                      {entry.speaker === "user" ? "You" : "AI"}:
                    </span>{" "}
                    <span
                      className={entry.isFinal ? "text-zinc-700" : "text-zinc-400 italic"}
                    >
                      {entry.text}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

function StatusPill({
  state,
  isReady,
  error,
}: {
  state: { isConnected: boolean; isConnecting: boolean; isListening: boolean };
  isReady: boolean;
  error: string | null;
}) {
  let label = "Idle";
  let color = "bg-zinc-100 text-zinc-600";
  if (error) {
    label = "Error";
    color = "bg-red-100 text-red-700";
  } else if (!isReady || state.isConnecting) {
    label = "Connecting…";
    color = "bg-clay-soft text-clay-ink";
  } else if (state.isListening) {
    label = "Listening";
    color = "bg-emerald-100 text-emerald-700";
  } else if (isReady) {
    label = "Ready";
    color = "bg-zinc-100 text-zinc-600";
  }
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}
