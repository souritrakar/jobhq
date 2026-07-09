import { autumnHandler } from "autumn-js/next"

import { getOptionalSessionUser } from "@/lib/auth/current-user"

/**
 * Autumn's backend endpoints (`/api/autumn/*`), called by the client `useCustomer()` hook.
 *
 * `identify` is the trust boundary: the Autumn customer id is ALWAYS the signed-in user's id, read
 * from the Neon Auth session cookie — never from the request body or a client-supplied header. An
 * unauthenticated request yields no customer, so the hook can't act on anyone's behalf. See
 * docs/BILLING.md and docs/AUTH.md.
 */
export const { GET, POST } = autumnHandler({
  identify: async () => {
    const user = await getOptionalSessionUser()
    if (!user) return { customerId: undefined }
    return {
      customerId: user.id,
      customerData: { name: user.name ?? undefined, email: user.email },
    }
  },
})
