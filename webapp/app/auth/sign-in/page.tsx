import Link from "next/link"
import { redirect } from "next/navigation"

import { getOptionalSessionUser } from "@/lib/auth/current-user"
import { AuthShell } from "@/components/auth/auth-shell"
import { SignInForm } from "./sign-in-form"

export const dynamic = "force-dynamic"
export const metadata = { title: "Sign in — jobhq" }

export default async function SignInPage() {
  // Already signed in? Don't flash a login form — send them to the app.
  if (await getOptionalSessionUser()) redirect("/dashboard")

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your jobhq account"
      footer={
        <>
          New to jobhq?{" "}
          <Link
            href="/auth/sign-up"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <SignInForm />
    </AuthShell>
  )
}
