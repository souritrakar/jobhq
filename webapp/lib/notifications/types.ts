export type NotificationKind = "reminder" | "interview" | "digest"

export type NotificationDto = {
  id: string
  kind: NotificationKind
  title: string
  body?: string
  href?: string
  readAt?: string
  createdAt: string
}
