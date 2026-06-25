import type { NotificationPreference } from "@prisma/client"

export type ResolvedChannels = { inApp: boolean; email: boolean; extension: boolean }

// Defaults when a user has no prefs row yet: everything on. (The full prefs service — lazy
// create, update, digest scheduling — is added in a later task; this resolver is needed now by
// the delivery worker.)
export function resolveChannels(prefs: NotificationPreference | null): ResolvedChannels {
  if (!prefs) return { inApp: true, email: true, extension: true }
  return { inApp: prefs.inAppEnabled, email: prefs.emailEnabled, extension: prefs.extensionEnabled }
}
