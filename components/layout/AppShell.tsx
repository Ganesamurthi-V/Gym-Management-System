// Server component — passes children to the client shell guard
import ShellGuard from './ShellGuard'

export default function AppShell({ children }: { children: React.ReactNode }) {
  return <ShellGuard>{children}</ShellGuard>
}
