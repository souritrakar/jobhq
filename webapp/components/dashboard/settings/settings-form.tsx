"use client"

import { useMemo, useState } from "react"
import {
  ChevronDown,
  Link2,
  Lock,
  MapPin,
  Save,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { saveProfile } from "@/lib/profile/client"
import {
  CURRENCY_OPTIONS,
  DISABILITY_STATUS_OPTIONS,
  EMPTY_PROFILE,
  GENDER_OPTIONS,
  NOTICE_PERIOD_OPTIONS,
  PRONOUN_OPTIONS,
  type ProfileSettings,
  RACE_ETHNICITY_OPTIONS,
  REMOTE_PREFERENCE_OPTIONS,
  VETERAN_STATUS_OPTIONS,
  WORK_AUTHORIZATION_OPTIONS,
} from "./profile-settings"

type SaveState = "idle" | "saving" | "saved"

// Local (not UTC) "YYYY-MM-DD" for a <input type="date"> min, so "earliest start" can't be a past
// day. Computed in the viewer's timezone to match how the browser renders the date field.
function localToday(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function SettingsForm({ initial }: { initial?: Partial<ProfileSettings> }) {
  const seed = useMemo<ProfileSettings>(
    () => ({ ...EMPTY_PROFILE, ...initial }),
    [initial],
  )
  const [profile, setProfile] = useState<ProfileSettings>(seed)
  const [saved, setSaved] = useState<ProfileSettings>(seed)
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [error, setError] = useState<string | null>(null)
  const [showVoluntary, setShowVoluntary] = useState(false)

  const dirty = useMemo(
    () => JSON.stringify(profile) !== JSON.stringify(saved),
    [profile, saved],
  )

  function set<K extends keyof ProfileSettings>(key: K, value: ProfileSettings[K]) {
    setProfile((cur) => ({ ...cur, [key]: value }))
    if (saveState === "saved") setSaveState("idle")
    if (error) setError(null)
  }

  function discard() {
    setProfile(saved)
    setSaveState("idle")
    setError(null)
  }

  async function save() {
    setSaveState("saving")
    setError(null)
    try {
      // Persist via PUT /api/profile; reflect the server's normalized result (trimmed text, empty
      // strings for cleared fields) back into both snapshots so the form is no longer dirty.
      const result = await saveProfile(profile)
      setSaved(result)
      setProfile(result)
      setSaveState("saved")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save. Try again.")
      setSaveState("idle")
    }
  }

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ")
  const initials =
    [profile.firstName, profile.lastName]
      .map((s) => s.trim().charAt(0))
      .filter(Boolean)
      .join("")
      .toUpperCase() || null

  return (
    <div className="flex flex-col gap-6 pb-24">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Your details, saved once and reused to autofill the repetitive parts of job
          applications.
        </p>
      </header>

      {/* Profile summary */}
      <Card className="flex items-center gap-4 p-5">
        <span
          className="grid size-14 shrink-0 place-items-center rounded-full bg-primary/10 text-lg font-semibold text-primary"
          aria-hidden
        >
          {initials ?? <UserRound className="size-6" />}
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium">{fullName || "Your name"}</p>
          <p className="truncate text-sm text-muted-foreground">
            {profile.email || "Add your contact details below"}
          </p>
        </div>
      </Card>

      {/* Personal details */}
      <SectionCard
        icon={UserRound}
        title="Personal details"
      >
        <Field label="First name">
          <Input
            value={profile.firstName}
            onChange={(e) => set("firstName", e.target.value)}
            placeholder="Jane"
            autoComplete="given-name"
          />
        </Field>
        <Field label="Last name">
          <Input
            value={profile.lastName}
            onChange={(e) => set("lastName", e.target.value)}
            placeholder="Doe"
            autoComplete="family-name"
          />
        </Field>
        <Field label="Preferred name" hint="Optional">
          <Input
            value={profile.preferredName}
            onChange={(e) => set("preferredName", e.target.value)}
            placeholder="What you go by"
          />
        </Field>
        <SelectField
          label="Pronouns"
          hint="Optional"
          value={profile.pronouns}
          onChange={(v) => set("pronouns", v)}
          options={PRONOUN_OPTIONS}
          placeholder="Select pronouns"
        />
        <Field label="Email">
          <Input
            type="email"
            value={profile.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="jane@example.com"
            autoComplete="email"
          />
        </Field>
        <Field label="Phone">
          <Input
            type="tel"
            value={profile.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="+1 (555) 000-0000"
            autoComplete="tel"
          />
        </Field>
      </SectionCard>

      {/* Location & address */}
      <SectionCard
        icon={MapPin}
        title="Location & address"
      >
        <Field label="Country">
          <Input
            value={profile.country}
            onChange={(e) => set("country", e.target.value)}
            placeholder="United States"
            autoComplete="country-name"
          />
        </Field>
        <Field label="State / Region">
          <Input
            value={profile.state}
            onChange={(e) => set("state", e.target.value)}
            placeholder="California"
            autoComplete="address-level1"
          />
        </Field>
        <Field label="City">
          <Input
            value={profile.city}
            onChange={(e) => set("city", e.target.value)}
            placeholder="San Francisco"
            autoComplete="address-level2"
          />
        </Field>
        <Field label="Postal code">
          <Input
            value={profile.postalCode}
            onChange={(e) => set("postalCode", e.target.value)}
            placeholder="94103"
            autoComplete="postal-code"
          />
        </Field>
        <Field label="Street address" hint="Optional" full>
          <Input
            value={profile.streetAddress}
            onChange={(e) => set("streetAddress", e.target.value)}
            placeholder="123 Market St"
            autoComplete="address-line1"
          />
        </Field>
        <Field label="Apartment, suite, etc." hint="Optional" full>
          <Input
            value={profile.addressLine2}
            onChange={(e) => set("addressLine2", e.target.value)}
            placeholder="Unit 4B"
            autoComplete="address-line2"
          />
        </Field>
      </SectionCard>

      {/* Work eligibility */}
      <SectionCard
        icon={ShieldCheck}
        title="Work eligibility"
      >
        <SelectField
          label="Work authorization"
          value={profile.workAuthorization}
          onChange={(v) => set("workAuthorization", v)}
          options={WORK_AUTHORIZATION_OPTIONS}
          placeholder="Select status"
        />
        <Field label="Visa status" hint="Optional">
          <Input
            value={profile.visaStatus}
            onChange={(e) => set("visaStatus", e.target.value)}
            placeholder="e.g. H-1B, Citizen, Permanent Resident"
          />
        </Field>
        <SwitchRow
          label="Require sponsorship"
          description="Will you now or in the future need visa sponsorship?"
          checked={profile.requiresSponsorship}
          onChange={(v) => set("requiresSponsorship", v)}
        />
      </SectionCard>

      {/* Professional links */}
      <SectionCard
        icon={Link2}
        title="Professional links"
      >
        <Field label="LinkedIn" full>
          <Input
            type="url"
            value={profile.linkedinUrl}
            onChange={(e) => set("linkedinUrl", e.target.value)}
            placeholder="https://linkedin.com/in/you"
          />
        </Field>
        <Field label="Portfolio / Website" full>
          <Input
            type="url"
            value={profile.portfolioUrl}
            onChange={(e) => set("portfolioUrl", e.target.value)}
            placeholder="https://your-site.com"
          />
        </Field>
        <Field label="GitHub" full>
          <Input
            type="url"
            value={profile.githubUrl}
            onChange={(e) => set("githubUrl", e.target.value)}
            placeholder="https://github.com/you"
          />
        </Field>
      </SectionCard>

      {/* Job preferences */}
      <SectionCard
        icon={SlidersHorizontal}
        title="Job preferences"
      >
        <Field label="Current title" hint="Optional">
          <Input
            value={profile.currentTitle}
            onChange={(e) => set("currentTitle", e.target.value)}
            placeholder="Software Engineer"
            autoComplete="organization-title"
          />
        </Field>
        <Field label="Current company" hint="Optional">
          <Input
            value={profile.currentCompany}
            onChange={(e) => set("currentCompany", e.target.value)}
            placeholder="Acme Inc."
            autoComplete="organization"
          />
        </Field>
        <Field label="Desired salary" hint="Optional">
          <div className="flex gap-2">
            <div className="w-24 shrink-0">
              <Select
                value={profile.salaryCurrency || null}
                onValueChange={(v) => set("salaryCurrency", (v as string) ?? "")}
              >
                <SelectTrigger aria-label="Currency">
                  <SelectValue placeholder="USD" />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input
              inputMode="numeric"
              value={profile.desiredSalary}
              onChange={(e) => set("desiredSalary", e.target.value)}
              placeholder="120,000"
            />
          </div>
        </Field>
        <SelectField
          label="Notice period"
          hint="Optional"
          value={profile.noticePeriod}
          onChange={(v) => set("noticePeriod", v)}
          options={NOTICE_PERIOD_OPTIONS}
          placeholder="Select availability"
        />
        <Field label="Earliest start date" hint="Optional">
          <Input
            type="date"
            min={localToday()}
            value={profile.earliestStartDate}
            onChange={(e) => set("earliestStartDate", e.target.value)}
          />
        </Field>
        <SelectField
          label="Remote preference"
          hint="Optional"
          value={profile.remotePreference}
          onChange={(v) => set("remotePreference", v)}
          options={REMOTE_PREFERENCE_OPTIONS}
          placeholder="Select preference"
        />
        <SwitchRow
          label="Open to relocation"
          description="Willing to move for the right role."
          checked={profile.openToRelocation}
          onChange={(v) => set("openToRelocation", v)}
        />
      </SectionCard>

      {/* Voluntary self-identification (collapsed) */}
      <Card className="overflow-hidden p-0">
        <button
          type="button"
          onClick={() => setShowVoluntary((v) => !v)}
          className="flex w-full items-center gap-3 p-5 text-left transition-colors hover:bg-muted/40"
          aria-expanded={showVoluntary}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            <Scale className="size-4.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              Voluntary self-identification
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[0.7rem] font-normal text-muted-foreground">
                Optional
              </span>
            </span>
            <span className="mt-0.5 block text-sm text-muted-foreground">
              The EEO questions some applications ask. Entirely optional and never
              required to apply.
            </span>
          </span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              showVoluntary && "rotate-180",
            )}
          />
        </button>

        {showVoluntary && (
          <div className="border-t border-border p-5">
            <p className="mb-4 flex items-start gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              <Lock className="mt-px size-3.5 shrink-0" />
              <span>
                This information is private to you, used only to prefill voluntary
                self-ID fields, and you can choose &ldquo;Prefer not to say&rdquo; for
                any of it.
              </span>
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Gender"
                value={profile.gender}
                onChange={(v) => set("gender", v)}
                options={GENDER_OPTIONS}
                placeholder="Prefer not to say"
              />
              <SelectField
                label="Race / Ethnicity"
                value={profile.raceEthnicity}
                onChange={(v) => set("raceEthnicity", v)}
                options={RACE_ETHNICITY_OPTIONS}
                placeholder="Prefer not to say"
              />
              <SelectField
                label="Veteran status"
                value={profile.veteranStatus}
                onChange={(v) => set("veteranStatus", v)}
                options={VETERAN_STATUS_OPTIONS}
                placeholder="Prefer not to say"
              />
              <SelectField
                label="Disability status"
                value={profile.disabilityStatus}
                onChange={(v) => set("disabilityStatus", v)}
                options={DISABILITY_STATUS_OPTIONS}
                placeholder="Prefer not to answer"
              />
            </div>
          </div>
        )}
      </Card>

      {/* Sticky save bar — only when there are unsaved changes */}
      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur md:left-64">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-3 sm:px-8">
            <p className={cn("text-sm", error ? "text-destructive" : "text-muted-foreground")}>
              {error ?? "You have unsaved changes"}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="lg" onClick={discard} disabled={saveState === "saving"}>
                Discard
              </Button>
              <Button size="lg" onClick={save} disabled={saveState === "saving"}>
                <Save className="size-4" />
                {saveState === "saving" ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {saveState === "saved" && !dirty && (
        <p className="text-center text-sm text-muted-foreground">All changes saved.</p>
      )}
    </div>
  )
}

/* ---------- small building blocks ---------- */

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <Card className="p-5">
      {/* Neutral icon badge: fern is rationed to the page's single brand moment (the avatar) and
          the primary Save action — a fern badge on every section would rank nothing. */}
      <div className="mb-5 flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4.5" />
        </span>
        <div>
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </Card>
  )
}

function Field({
  label,
  hint,
  full,
  children,
}: {
  label: string
  hint?: string
  full?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", full && "sm:col-span-2")}>
      <Label className="justify-between">
        <span>{label}</span>
        {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
      </Label>
      {children}
    </div>
  )
}

function SelectField({
  label,
  hint,
  value,
  onChange,
  options,
  placeholder,
  full,
}: {
  label: string
  hint?: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  placeholder: string
  full?: boolean
}) {
  return (
    <Field label={label} hint={hint} full={full}>
      <Select value={value || null} onValueChange={(v) => onChange((v as string) ?? "")}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

function SwitchRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-md border border-border bg-background p-3 sm:col-span-2">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-sm text-muted-foreground">{description}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  )
}
