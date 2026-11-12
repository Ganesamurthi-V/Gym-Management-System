// A template remounts on every navigation, so this CSS-only class gives a soft
// route-enter transition with zero JS (nothing waits on hydration).
export default function MemberTemplate({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="animate-rise-in">{children}</div>
}
