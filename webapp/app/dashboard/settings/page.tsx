import { getSessionUser } from "@/lib/auth/current-user"
import { getProfile } from "@/lib/server/profile"
import {
  EMPTY_PROFILE,
  type ProfileSettings,
} from "@/components/dashboard/settings/profile-settings"
import { SettingsForm } from "@/components/dashboard/settings/settings-form"

export const dynamic = "force-dynamic"
export const metadata = { title: "Settings · jobhq" }

// Name & contact email are app-owned (the user can override them for applications), but on first
// visit we pre-fill them from the signed-in identity so the form isn't blank. Only seed fields the
// user hasn't set themselves — never clobber a saved override.
function seedIdentity(
  profile: ProfileSettings,
  user: { name: string | null; email: string },
): ProfileSettings {
  const seeded = { ...profile }
  if (!seeded.email) seeded.email = user.email
  if (!seeded.firstName && !seeded.lastName && user.name) {
    const [first, ...rest] = user.name.trim().split(/\s+/)
    seeded.firstName = first ?? ""
    seeded.lastName = rest.join(" ")
  }
  return seeded
}

export default async function SettingsPage() {
  const user = await getSessionUser()
  const saved = (await getProfile(user.id)) ?? EMPTY_PROFILE
  return <SettingsForm initial={seedIdentity(saved, user)} />
}
