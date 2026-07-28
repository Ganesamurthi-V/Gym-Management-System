import { MemberShell } from '@/components/layout/MemberShell'

export default function ProtectedAppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <MemberShell>{children}</MemberShell>
}
