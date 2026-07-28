import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: '#020617',
  colorScheme: 'dark',
}

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="theme-auth min-h-dvh bg-slate-950 text-slate-50">{children}</div>
}
