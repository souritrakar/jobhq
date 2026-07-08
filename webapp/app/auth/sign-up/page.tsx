import Link from "next/link"
import { redirect } from "next/navigation"

import { getOptionalSessionUser } from "@/lib/auth/current-user"
import { AuthShell } from "@/components/auth/auth-shell"
import { SignUpForm } from "./sign-up-form"

export const dynamic = "force-dynamic"
export const metadata = { title: "Create your account — jobhq" }

export default async function SignUpPage() {
  if (await getOptionalSessionUser()) redirect("/dashboard")

  return (
    <AuthShell
      title="Create your account"
      subtitle="Track every application in one place"
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/auth/sign-in"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm />
    </AuthShell>
  )
}
