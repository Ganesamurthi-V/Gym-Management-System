// Passthrough layout — OnboardingWizard renders as a fixed full-screen overlay
// that covers the AppShell, so no special wrapper is needed here.
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
