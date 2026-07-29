import { CheckCircle2 } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

/**
 * /activate/success
 *
 * Shown after the member clicks the email verification link and the callback
 * completes. Their account is now fully active.
 */
export default function ActivateSuccessPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 flex flex-col items-center">
          <Image src="/icons/icon.svg" alt="GymFlow" width={48} height={48} className="mb-4 rounded-2xl shadow-md" />
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>

          <h1 className="text-xl font-bold text-emerald-900">
            Account Activated Successfully!
          </h1>

          <p className="mt-3 text-sm leading-relaxed text-emerald-700">
            Your GymFlow Members account is now ready. You can now sign in using
            your email address and password.
          </p>

          <Link
            href="/auth/login"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 transition-colors"
          >
            Go to Login
          </Link>
        </div>

        <p className="mt-4 text-xs text-slate-400">
          You will be able to view your membership, workouts, and progress once signed in.
        </p>
      </div>
    </main>
  )
}
