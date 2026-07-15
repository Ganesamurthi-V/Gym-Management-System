// @ts-nocheck
import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { MapPin, Play, Sparkles } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

export function Hero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const wordRef = useRef<HTMLSpanElement>(null);

  const WORDS = ['Paid.', 'Due.', 'Next.'];
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // ── Entry animations ────────────────────────────────────────────────
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.from('.hero-badge',  { y: -14, opacity: 0, duration: 0.55 })
        .from('.hero-title',  { y: 22,  opacity: 0, duration: 0.65 }, '-=0.4')
        .from('.hero-sub',    { y: 18,  opacity: 0, duration: 0.55 }, '-=0.45')
        .from('.hero-desc',   { y: 16,  opacity: 0, duration: 0.55 }, '-=0.4')
        .from('.hero-ctas',   { y: 14,  opacity: 0, duration: 0.55 }, '-=0.4')
        .from('.hero-mockup', { x: 60,  opacity: 0, duration: 1.0  }, '-=0.6');

      // ── Scroll-driven tilt → straight animation ──────────────────────────
      const cardEl = cardRef.current;
      if (!cardEl) return;

      // Set perspective explicitly for GSAP
      gsap.set(cardEl, { transformPerspective: 1400 });

      // Using fromTo directly on the element ensures it never breaks on backward scroll
      gsap.fromTo(cardEl,
        { rotationY: -12, rotationX: 5, rotationZ: 1.5, scale: 1.20 },
        {
          rotationY: 0,
          rotationX: 0,
          rotationZ: 0,
          scale: 1.20,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: containerRef.current,
            start: 'top top',
            end: '+=500', 
            scrub: 2.5,
          }
        }
      );
    }, containerRef);

    return () => ctx.revert();
  }, []);

  // Cycle the last word every 2s with a GSAP slide-up transition
  useEffect(() => {
    const el = wordRef.current;
    if (!el) return;
    const interval = setInterval(() => {
      gsap.to(el, {
        y: -24, opacity: 0, duration: 0.28, ease: 'power2.in',
        onComplete: () => {
          setWordIndex(i => (i + 1) % WORDS.length);
          gsap.fromTo(el,
            { y: 24, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.32, ease: 'power2.out' }
          );
        }
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section
      ref={containerRef}
      className="relative overflow-hidden pt-[100px] pb-0 min-h-screen"
      style={{ background: 'linear-gradient(155deg, #FFFFFF 0%, #F0F5FF 55%, #E8F0FF 100%)' }}
    >
      {/* Dot-grid pattern — right half */}
      <div
        className="absolute right-0 top-0 w-[60%] h-full z-0"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(37,99,235,0.13) 1px, transparent 1px)',
          backgroundSize: '26px 26px',
          maskImage: 'linear-gradient(to left, rgba(0,0,0,0.5) 0%, transparent 70%)',
          WebkitMaskImage: 'linear-gradient(to left, rgba(0,0,0,0.5) 0%, transparent 70%)',
        }}
      />
      {/* Soft blue orb top-right */}
      <div
        className="absolute -top-[80px] right-[-80px] w-[520px] h-[520px] rounded-full z-0 pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.10) 0%, transparent 65%)' }}
      />

      {/* ── Main grid ─────────────────────────────────────────────────────── */}
      <div className="relative z-10 max-w-[1400px] mx-auto px-8 md:px-16 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-4 items-center pb-0">

        {/* ── Left ──────────────────────────────────────────────────────── */}
        <div className="pt-12 pb-16 flex flex-col justify-center min-h-[calc(100vh-100px)] max-w-[540px]">

          {/* Badge */}
          <div
            className="hero-badge inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-9 w-fit"
            style={{
              background: 'rgba(37,99,235,0.07)',
              border: '1px solid rgba(37,99,235,0.18)',
            }}
          >
            <MapPin className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-[12px] font-semibold text-blue-700 tracking-wide">
              Built for Tamil Nadu &amp; Puducherry gyms
            </span>
          </div>

          {/* Heading */}
          <h1
            className="hero-title font-black text-slate-900 tracking-tight mb-5"
            style={{ fontSize: 'clamp(44px, 5.5vw, 72px)', lineHeight: 1.05, fontFamily: 'Sora, sans-serif' }}
          >
            Know What's{' '}
            <span
              ref={wordRef}
              style={{
                display: 'inline-block',
                background: 'linear-gradient(135deg, #1E40AF 0%, #2563EB 50%, #3B82F6 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              {WORDS[wordIndex]}
            </span>
          </h1>

          {/* Blue subtitle */}
          <p
            className="hero-sub font-bold mb-6"
            style={{ fontSize: '20px', color: '#2563EB' }}
          >
             &nbsp;— without the notebooks.
          </p>

          {/* Description */}
          <p
            className="hero-desc leading-relaxed mb-10"
            style={{ fontSize: '15px', color: '#64748B', maxWidth: '460px', lineHeight: 1.75 }}
          >
            GymFlow is the all-in-one gym management platform for independent gym owners.
            Members, payments, attendance, dues, and WhatsApp reminders — in one place.
          </p>

          {/* CTAs */}
          <div className="hero-ctas flex flex-wrap items-center gap-4">
            <a
              href="https://app.gymflow.sbs"
              className="inline-flex items-center gap-2.5 text-white rounded-xl py-3.5 px-7 text-[14.5px] font-semibold transition-all duration-200"
              style={{
                background: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 55%, #3B82F6 100%)',
                boxShadow: '0 6px 20px rgba(30,58,138,0.42), 0 2px 6px rgba(30,58,138,0.2)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                (e.currentTarget as HTMLElement).style.boxShadow = '0 12px 32px rgba(30,58,138,0.52), 0 4px 10px rgba(30,58,138,0.25)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 20px rgba(30,58,138,0.42), 0 2px 6px rgba(30,58,138,0.2)';
              }}
            >
              <Sparkles className="w-4 h-4" />
              Start Free Trial
            </a>

            <a
              href="#demo"
              className="inline-flex items-center gap-2.5 rounded-xl py-3.5 px-6 text-[14.5px] font-semibold text-slate-600 transition-all duration-200"
              style={{
                background: 'rgba(255,255,255,0.9)',
                border: '1.5px solid rgba(37,99,235,0.18)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(37,99,235,0.45)';
                (e.currentTarget as HTMLElement).style.color = '#1E3A8A';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(37,99,235,0.18)';
                (e.currentTarget as HTMLElement).style.color = '#475569';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
              }}
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #1E3A8A, #3B82F6)' }}
              >
                <Play className="w-2.5 h-2.5 text-white ml-0.5" fill="currentColor" />
              </div>
              Watch Demo
            </a>
          </div>
        </div>

        {/* ── Right — 3D Tilted Dashboard Image ─────────────────────────── */}
        <div
          className="hero-mockup relative flex items-center justify-center lg:justify-end lg:-mt-24 lg:-translate-x-12 xl:-translate-x-20"
          style={{ perspective: '1400px', paddingTop: '10px', paddingBottom: '0px' }}
        >
          {/* Outer glow behind the card */}
          <div
            className="absolute inset-0 z-0"
            style={{
              background: 'radial-gradient(ellipse 60% 50% at 65% 50%, rgba(37,99,235,0.12) 0%, transparent 70%)',
              filter: 'blur(24px)',
            }}
          />

          {/* 3D Tilted card — ref for scroll animation */}
          <div
            ref={cardRef}
            className="relative z-10 w-full max-w-[1040px] xl:max-w-[1200px]"
            style={{
              transformStyle: 'preserve-3d',
              willChange: 'transform',
              transition: 'box-shadow 0.3s ease',
            }}
          >
            {/* Drop shadow layer (3D depth illusion) */}
            <div
              className="absolute inset-0 rounded-[16px]"
              style={{
                background: 'linear-gradient(135deg, #CBD5E1, #94A3B8)',
                transform: 'translateZ(-20px) translateX(16px) translateY(16px)',
                borderRadius: '16px',
                opacity: 0.35,
                filter: 'blur(2px)',
              }}
            />

            {/* Browser chrome */}
            <div
              className="rounded-t-[16px] flex items-center px-4 py-3 relative z-10"
              style={{
                background: 'linear-gradient(180deg, #E8EDF5 0%, #DDE3EF 100%)',
                border: '1px solid rgba(37,99,235,0.12)',
                borderBottom: 'none',
              }}
            >
              <div className="flex items-center gap-1.5">
                <div className="w-[12px] h-[12px] rounded-full" style={{ background: '#FF5F57', border: '0.5px solid #E0443E' }} />
                <div className="w-[12px] h-[12px] rounded-full" style={{ background: '#FFBD2E', border: '0.5px solid #DEA123' }} />
                <div className="w-[12px] h-[12px] rounded-full" style={{ background: '#28C840', border: '0.5px solid #1DAD2B' }} />
              </div>
              <div className="flex-1 flex justify-center">
                <div
                  className="rounded-md px-8 py-[4px] flex items-center gap-1.5 text-[11px] font-medium min-w-[200px] justify-center"
                  style={{ background: 'rgba(255,255,255,0.88)', border: '1px solid rgba(37,99,235,0.09)', color: '#64748B' }}
                >
                  <svg className="w-2.5 h-2.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  app.gymflow.sbs
                </div>
              </div>
              <div className="w-16" />
            </div>

            {/* Dashboard image */}
            <div
              className="relative overflow-hidden rounded-b-[16px]"
              style={{
                border: '1px solid rgba(37,99,235,0.12)',
                borderTop: 'none',
                boxShadow: '0 32px 80px rgba(15,23,42,0.18), 0 8px 24px rgba(37,99,235,0.12)',
                background: '#F1F5F9',
              }}
            >
              <img src="/hero.png" alt="GymFlow Dashboard" width="2880" height="1532" fetchPriority="high" decoding="async" className="w-full h-auto block rounded-b-[16px]" />
            </div>
          </div>
        </div>

      </div>

      {/* ── Bottom WhatsApp accent bar ─────────────────────────────────────── */}
      <div
        className="relative z-10 w-full py-4 px-8 md:px-16 flex flex-wrap items-center gap-6 mt-0"
        style={{
          background: 'linear-gradient(135deg, #1E3A8A 0%, #1D4ED8 50%, #2563EB 100%)',
        }}
      >
        <div className="flex items-center gap-2.5 text-white/80 text-sm">
          <svg className="w-5 h-5 text-green-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984a9.964 9.964 0 001.333 4.993L2 22l5.233-1.337a10.024 10.024 0 004.779 1.204c5.505 0 9.988-4.477 9.989-9.985 0-5.506-4.484-9.982-9.989-9.982z"/>
          </svg>
          <span className="font-semibold">WhatsApp reminders that actually get paid.</span>
          <span className="text-white/50 text-[13px]">Automatic alerts for dues, renewals, and updates.</span>
        </div>
        <div className="ml-auto flex items-center gap-8">
          {[
            { icon: '⏱️', label: 'Save Time' },
            { icon: '💳', label: 'Get Paid Faster' },
            { icon: '📈', label: 'Grow Your Gym' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-white/65 text-[13px] font-medium">
              <span>{item.icon}</span>
              {item.label}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
