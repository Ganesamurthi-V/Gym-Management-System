import { AlertTriangle } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

/**
 * /activate/error
 *
 * Shown when email verification fails (expired link, invalid token, etc.)
 */
export default function ActivateErrorPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 flex flex-col items-center">
          <Image src="/icons/icon.svg" alt="GymFlow" width={48} height={48} className="mb-4 rounded-2xl shadow-md" />
        </div>

        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="h-8 w-8 text-red-500" />
          </div>

          <h1 className="text-xl font-bold text-red-900">
            Verification Failed
          </h1>

          <p className="mt-3 text-sm leading-relaxed text-red-700">
            The email verification link is invalid or has expired. This can happen
            if the link was already used or if too much time has passed.
          </p>

          <p className="mt-3 text-sm text-red-600">
            Please contact your gym to request a new activation invitation.
          </p>

          <Link
            href="/auth/login"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-700 px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-slate-800 transition-colors"
          >
            Go to Login
          </Link>
        </div>
      </div>
    </main>
  )
}
