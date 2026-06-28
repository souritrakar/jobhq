import { prisma } from "@/lib/db"

/**
 * Bridge a Neon Auth identity into our local `users` table (see docs/AUTH.md).
 *
 * Neon Auth stores users in the separate `neon_auth` schema, but every owned row in our app
 * (`Job`, `Reminder`, …) has a `userId` foreign key to `public.users`. So before a freshly
 * authenticated user writes anything, a matching local row must exist — this upserts it,
 * keyed by the Neon Auth user id (which we store verbatim as `User.id`).
 *
 * Idempotent: callers memoize per process, but the upsert itself is safe to call repeatedly.
 */
export async function ensureUser(input: {
  id: string
  email: string
  name: string | null
}): Promise<void> {
  await prisma.user.upsert({
    where: { id: input.id },
    create: { id: input.id, email: input.email, name: input.name },
    update: { email: input.email, name: input.name },
  })
}
