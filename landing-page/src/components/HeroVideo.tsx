import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { prefersReducedMotion } from '../lib/prefersReducedMotion';
import { useMediaQuery } from '../lib/useMediaQuery';
import { connectionAllowsDecoration } from '../lib/decorationGates';
import '../styles/hero.css';

// Two cuts of the same film: the 16:9 one for a laptop and the 9:16 one for a phone. A
// portrait phone shows a 16:9 film as a thin strip with its text too small to read;
// the 9:16 cut is laid out for the tall frame, with the same script and narration.
const FILMS = {
  wide: { src: '/video/gymflow-launch.mp4', poster: '/video/gymflow-launch-poster.webp', w: 1600, h: 900 },
  tall: { src: '/video/gymflow-launch-portrait.mp4', poster: '/video/gymflow-launch-portrait-poster.webp', w: 720, h: 1280 },
} as const;

/**
 * The product film plate: the film in a 20px-radius frame (hairline, layered shadow) with its caption
 * beneath, on the quiet band Hero.tsx puts it in. Its full size is capped two ways: by
 * width, and by height (the calc in the className), so the frame ends about where a laptop screen
 * does. The film is 16:9 and is not cropped: its headline sits near the top edge and the phone
 * near the bottom.
 */
export function HeroVideo() {
  const video = useRef<HTMLVideoElement>(null);
  const wide = useMediaQuery('(min-width: 768px)');
  const film = wide ? FILMS.wide : FILMS.tall;

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

  // Play only while the film is actually in view: at least 40 % of it on screen.
  // The source is not requested before that either (preload="none").
  useEffect(() => {
    const v = video.current;
    if (!v) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        inView.current = entry.isIntersecting;
        if (entry.isIntersecting) {
          // Show the controls for a moment each time the film comes into view and starts.
          // On a phone there is no cursor to hover with, so without this nobody would
          // learn that the film has a Pause button or a sound button until they tapped.
          if (auto && !heldByUser.current) v.play().then(() => wake(3000)).catch(() => { });
        } else {
          v.pause();
        }
      },
      { threshold: 0.4 }
    );
    io.observe(v);
    return () => io.disconnect();
  }, [auto, wide]);

  function togglePlay() {
    const v = video.current;
    if (!v) return;
    if (v.paused) {
      heldByUser.current = false;
      v.play().catch(() => { });
    } else {
      heldByUser.current = true;
      v.pause();
    }
  }

  function wake(ms = 2500) {
    setAwake(true);
    window.clearTimeout(idle.current);
    idle.current = window.setTimeout(() => setAwake(false), ms);
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
      if (v.paused) v.play().catch(() => { });
    }
    v.muted = next;
    setMuted(next);
  }

  // Keycaps (.btn), compact; they sit on the film, so they need no scrim.
  const control = 'btn btn-nav btn-outline';

  return (
    <figure
      className={`mx-auto w-full ${
        wide
          ? 'max-w-[min(1200px,calc((100svh-160px)*16/9))]'
          : 'max-w-[min(420px,calc((100svh-160px)*9/16))]'
      }`}
    >
      <div
        className="film-frame relative"
        onPointerMove={() => wake()}
        onPointerDown={() => wake()}
        onPointerLeave={sleep}
        onFocus={() => wake()}
      >
      <div className={`relative overflow-hidden bg-subtle ${wide ? 'aspect-video' : 'aspect-[9/16]'}`}>
      <video
        ref={video}
        className={`block h-full w-full object-cover ${playing && !awake ? 'cursor-none' : 'cursor-pointer'}`}
        onClick={toggleByUser}
        key={film.src}
        src={film.src}
        poster={film.poster}
        width={film.w}
        height={film.h}
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
          className="film-overlay absolute inset-0 grid place-items-center"
        >
          <span className="btn btn-primary btn-lg film-play">
            <Play className="h-7 w-7 translate-x-0.5 fill-current" />
          </span>
        </button>
      )}

      {started && flash && (
        <span
          key={flash.n}
          aria-hidden
          onAnimationEnd={() => setFlash(null)}
          className="pointer-events-none absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-border-strong bg-frame text-foreground shadow-card md:h-20 md:w-20 animate-[hero-video-flash_0.7s_ease-out_forwards]"
        >
          {flash.icon === 'play' ? <Play className="h-6 w-6 translate-x-0.5 fill-current md:h-7 md:w-7" /> : <Pause className="h-6 w-6 fill-current md:h-7 md:w-7" />}
        </span>
      )}

      {ended && (
        <button
          type="button"
          onClick={toggleByUser}
          className="btn btn-primary absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
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
          className={`absolute inset-x-0 bottom-0 flex items-center justify-between px-3 pb-3 transition-opacity duration-300 md:px-5 md:pb-5 ${playing && !awake ? 'pointer-events-none opacity-0' : 'opacity-100'
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
      </div>
      <figcaption className="pt-6 text-center font-display text-xl font-medium text-foreground">
        See GymFlow in one minute.
      </figcaption>
    </figure>
  );
}
