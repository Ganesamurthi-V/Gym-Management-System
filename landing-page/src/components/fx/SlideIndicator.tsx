// Indicator that slides under a tab row via translateX only (240ms ease-out); width is fixed at 1/count.

type SlideIndicatorProps = {
  index: number
  count: number
  className?: string
}

export function SlideIndicator({ index, count, className }: SlideIndicatorProps) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-y-0 left-0 motion-safe:transition-transform motion-safe:duration-[240ms] motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)] ${className ?? ''}`}
      style={{
        width: `calc(100% / ${count})`,
        transform: `translateX(${index * 100}%)`,
      }}
    />
  )
}
