import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { prefersReducedMotion } from '../lib/useReveal';
import { useMediaQuery } from '../lib/useMediaQuery';
import { connectionAllowsDecoration } from '../lib/decorationGates';

gsap.registerPlugin(ScrollTrigger);

const SRC = '/video/gymflow-launch.mp4';
const POSTER = '/video/gymflow-launch-poster.webp';

/** Corner radius as it should look on screen, whatever the frame's scale: [phone, wider]. */
const RADII = [18, 32] as const;

/**
 * The product film in the hero, arriving the way a window is pulled towards you:
 * it starts at half its size and grows as it is scrolled up, then holds.
 *
 * Its full size is capped two ways. By width, so there is always a margin at the
 * page edges; and by height (the calc in the className), so the frame ends about
 * where a laptop screen does while its top is parked under the navbar. The film is
 * 16:9 and is not cropped to be shorter: its headline sits near the top edge and
 * the phone near the bottom, so a wider-than-16:9 crop clips both.
 *
 * The growth is a transform, not a width. Animating width would change the hero's
 * height on every scroll frame, and every ScrollTrigger further down the page
 * caches its start position from layout — they would all fire late by however
 * much this had grown. Scaling from the top edge keeps the box the layout sees at
 * its final size from the start.
 */
export function HeroVideo() {
  const frame = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const wide = useMediaQuery('(min-width: 768px)');

  // Autoplay is a decision made once: an 8 MB film is not something to start on
  // Data Saver or 2g, and motion that starts by itself is what reduced motion
  // asks not to get. Those visitors get the poster and a play button instead.
  const [auto] = useState(() => !prefersReducedMotion() && connectionAllowsDecoration());
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  // Controls follow the pointer like a video player's: they appear when the cursor
  // moves over the film, and fade again after a moment of stillness while it plays.
  // While it is paused or finished they stay. A tap counts as pointer movement, so
  // touch screens get the same reveal.
  const [awake, setAwake] = useState(false);
  const idle = useRef<number | undefined>(undefined);
  const [muted, setMuted] = useState(true);
  // Set when the visitor presses pause. Scrolling the film back into view must
  // not overrule that, so the observer below checks it before resuming.
  const heldByUser = useRef(false);
  // Whether enough of the film is on screen for Space to mean "this video".
  const inView = useRef(false);
  // The icon that flashes in the centre after a click or Space, so the toggle is seen to land.
  const [flash, setFlash] = useState<{ icon: 'play' | 'pause'; n: number } | null>(null);

  useEffect(() => {
    const el = frame.current;
    if (!el || prefersReducedMotion()) return;

    // Half size reads as a deliberate small window on a desktop; on a phone it
    // is a thumbnail, so the film starts nearer its full size there.
    const from = wide ? 0.5 : 0.84;
    const radius = RADII[wide ? 1 : 0];
    const ease = gsap.parseEase('power1.out');
    const ctx = gsap.context(() => {
      const apply = (p: number) => {
        const s = from + (1 - from) * p;
        el.style.transform = `scale(${s})`;
        // The radius is scaled with the element, so divide it back out.
        el.style.borderRadius = `${radius / s}px`;
      };
      apply(0);
      ScrollTrigger.create({
        trigger: el,
        // From the moment its top edge enters the viewport until that edge is a
        // third of the way down — measured on the reference this was modelled on.
        start: 'top bottom',
        end: 'top 34%',
        scrub: true,
        onUpdate: self => apply(ease(self.progress)),
      });
    });

    return () => {
      ctx.revert();
      el.style.transform = '';
      el.style.borderRadius = '';
    };
  }, [wide]);

  // Play only while the film is actually in view: at least 40 % of it on screen.
  // The source is not requested before that either (preload="none").
  useEffect(() => {
    const v = video.current;
    if (!v) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        inView.current = entry.isIntersecting;
        if (entry.isIntersecting) {
          if (auto && !heldByUser.current) v.play().catch(() => {});
        } else {
          v.pause();
        }
      },
      { threshold: 0.4 }
    );
    io.observe(v);
    return () => io.disconnect();
  }, [auto]);

  function togglePlay() {
    const v = video.current;
    if (!v) return;
    if (v.paused) {
      heldByUser.current = false;
      v.play().catch(() => {});
    } else {
      heldByUser.current = true;
      v.pause();
    }
  }

  function wake() {
    setAwake(true);
    window.clearTimeout(idle.current);
    idle.current = window.setTimeout(() => setAwake(false), 2500);
  }

  function sleep() {
    window.clearTimeout(idle.current);
    setAwake(false);
  }

  useEffect(() => () => window.clearTimeout(idle.current), []);

  function toggleByUser() {
    const v = video.current;
    if (!v) return;
    const willPlay = v.paused;
    togglePlay();
    setFlash(f => ({ icon: willPlay ? 'play' : 'pause', n: (f?.n ?? 0) + 1 }));
  }

  // Space plays and pauses the film while it is on screen. Anywhere else on the
  // page Space keeps scrolling: it is ignored when focus is on something that
  // already uses it (a button, link, field) and when a modifier is held.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (!inView.current) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, button, a, summary, [contenteditable], [role="button"]')) return;
      e.preventDefault();
      toggleByUser();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function toggleSound() {
    const v = video.current;
    if (!v) return;
    const next = !muted;
    // The film is narrated. Turning sound on halfway through a sentence is
    // worse than starting over, so unmuting plays it from the top.
    if (!next) {
      v.currentTime = 0;
      heldByUser.current = false;
      if (v.paused) v.play().catch(() => {});
    }
    v.muted = next;
    setMuted(next);
  }

  const control =
    'flex items-center gap-2 rounded-full bg-[#0b1220]/85 px-3.5 py-2 text-xs font-medium text-white backdrop-blur transition-colors hover:bg-[#0b1220] md:px-4 md:py-2.5 md:text-sm';

  return (
    <div
      ref={frame}
      className="relative mx-auto aspect-video w-full max-w-[min(1640px,calc((100svh-100px)*16/9))] origin-top overflow-hidden border border-border-subtle bg-[#eef3ff] shadow-[0_50px_110px_-50px_rgba(37,99,235,0.55)] will-change-transform"
      style={{ borderRadius: RADII[wide ? 1 : 0] }}
      onPointerMove={wake}
      onPointerDown={wake}
      onPointerLeave={sleep}
      onFocus={wake}
    >
      <video
        ref={video}
        className={`block h-full w-full object-cover ${playing && !awake ? 'cursor-none' : 'cursor-pointer'}`}
        onClick={toggleByUser}
        src={SRC}
        poster={POSTER}
        width={1600}
        height={900}
        muted
        playsInline
        preload="none"
        onPlay={() => {
          setStarted(true);
          setPlaying(true);
          setEnded(false);
        }}
        onEnded={() => {
          // The film plays once and stops on its last frame with a way to watch it
          // again. The observer above must not restart it the next time it scrolls
          // into view, so this counts as a stop the visitor asked for.
          heldByUser.current = true;
          setPlaying(false);
          setEnded(true);
        }}
        onPause={() => setPlaying(false)}
        aria-label="A one-minute film: how gyms are run today, and the GymFlow owner console and member app."
      />

      {!started && (
        <button
          type="button"
          onClick={toggleByUser}
          aria-label="Play the film"
          className="absolute inset-0 grid place-items-center bg-white/10 transition-colors hover:bg-white/0"
        >
          <span className="grid h-16 w-16 place-items-center rounded-full bg-[#0b1220] text-white shadow-[0_20px_40px_-14px_rgba(37,99,235,0.8)] md:h-20 md:w-20">
            <Play className="h-6 w-6 translate-x-0.5 fill-current md:h-7 md:w-7" />
          </span>
        </button>
      )}

      {started && flash && (
        <span
          key={flash.n}
          aria-hidden
          onAnimationEnd={() => setFlash(null)}
          className="pointer-events-none absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[#0b1220]/80 text-white backdrop-blur md:h-20 md:w-20 animate-[hero-video-flash_0.7s_ease-out_forwards]"
        >
          {flash.icon === 'play' ? <Play className="h-6 w-6 translate-x-0.5 fill-current md:h-7 md:w-7" /> : <Pause className="h-6 w-6 fill-current md:h-7 md:w-7" />}
        </span>
      )}

      {ended && (
        <button
          type="button"
          onClick={toggleByUser}
          className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2.5 rounded-full bg-[#0b1220] px-5 py-3 text-sm font-medium text-white shadow-[0_20px_40px_-14px_rgba(37,99,235,0.8)] transition-transform hover:scale-105 md:px-7 md:py-4 md:text-base"
        >
          <RotateCcw className="h-4 w-4 md:h-5 md:w-5" />
          Watch again
        </button>
      )}

      {/* Always shown while paused or finished; while playing, only just after the
          pointer moved. The fade-in on a darkened band keeps the white labels
          readable over a pale picture. pointer-events are off while hidden so an
          invisible button can never be clicked by accident. */}
      {started && (
        <div
          className={`absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-[#0b1220]/45 to-transparent px-3 pb-3 pt-14 transition-opacity duration-300 md:px-5 md:pb-5 ${
            playing && !awake ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
        >
          <button type="button" onClick={toggleByUser} className={control}>
            {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
            {playing ? 'Pause' : 'Play'}
          </button>
          <button type="button" onClick={toggleSound} aria-pressed={!muted} className={control}>
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            {muted ? 'Play with sound' : 'Mute'}
          </button>
        </div>
      )}
    </div>
  );
}
