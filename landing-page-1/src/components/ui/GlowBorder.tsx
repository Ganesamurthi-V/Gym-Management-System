/* Animated glowing border. Drop inside a `relative` parent; it inherits the
   parent's radius. Styles live in index.css (.glow-ring). */
export default function GlowBorder() {
  return (
    <>
      <span
        aria-hidden
        className="glow-ring glow-ring-blur pointer-events-none absolute inset-0 rounded-[inherit] p-[3px]"
      />
      <span
        aria-hidden
        className="glow-ring pointer-events-none absolute inset-0 rounded-[inherit] p-[2px]"
      />
    </>
  );
}
