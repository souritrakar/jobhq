import type { NotificationDto } from "./types"

type Envelope<T> = { data?: T; error?: { message?: string } }

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init })
  const body = (await res.json().catch(() => null)) as Envelope<T> | null
  if (!res.ok || body?.data === undefined) {
    throw new Error(body?.error?.message ?? "Something went wrong. Try again.")
  }
  return body.data
}

export function listNotifications(): Promise<NotificationDto[]> {
  return request<NotificationDto[]>("/api/notifications")
}
export function markNotificationRead(id: string): Promise<{ id: string }> {
  return request(`/api/notifications/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ read: true }),
  })
}
export function markAllNotificationsRead(): Promise<{ ok: true }> {
  return request("/api/notifications/read-all", { method: "POST" })
}
