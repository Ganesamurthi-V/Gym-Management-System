import { authDividerLabel, authSecondaryButton } from '@/components/auth/authStyles'

/**
 * "Continue with Google" for gym owners. A plain link on purpose: the OAuth flow is a full
 * navigation to our own route, which sets the state cookie and redirects to Google. The "G"
 * is inline SVG so the CSP needs no extra image host.
 */
export function GoogleButton() {
  return (
    <>
      <a href="/api/auth/google/start" className={authSecondaryButton}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.08 3.57-5.15 3.57-8.81z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.87-3c-1.07.72-2.45 1.15-4.08 1.15-3.14 0-5.8-2.12-6.75-4.97H1.25v3.09A12 12 0 0 0 12 24z"
          />
          <path
            fill="#FBBC05"
            d="M5.25 14.27a7.2 7.2 0 0 1 0-4.54V6.64H1.25a12 12 0 0 0 0 10.72l4-3.09z"
          />
          <path
            fill="#EA4335"
            d="M12 4.75c1.76 0 3.34.61 4.58 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.25 6.64l4 3.09C6.2 6.87 8.86 4.75 12 4.75z"
          />
        </svg>
        Continue with Google
      </a>
      <div className="my-[var(--auth-gap-md)] flex items-center gap-4">
        <div className="h-px flex-1 bg-neutral-200" />
        <span className={authDividerLabel}>Or</span>
        <div className="h-px flex-1 bg-neutral-200" />
      </div>
    </>
  )
}
