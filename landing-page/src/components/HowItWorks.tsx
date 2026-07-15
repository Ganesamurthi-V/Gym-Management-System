// @ts-nocheck
import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const STEPS = [
  {
    num: '01',
    emoji: '🚀',
    title: 'Sign Up & Onboard',
    desc: 'Complete a 6-step wizard. Set your gym name, membership plans, pricing, and WhatsApp details. Autosaves as you go.',
  },
  {
    num: '02',
    emoji: '📊',
    title: 'Import Your Members',
    desc: 'Upload your existing CSV or Excel. GymFlow auto-detects columns, normalizes areas, and flags anything needing review.',
  },
  {
    num: '03',
    emoji: '⚡',
    title: 'Manage Daily Operations',
    desc: 'Mark attendance, record payments, send WhatsApp reminders for dues — all from a single, mobile-friendly dashboard.',
  },
  {
    num: '04',
    emoji: '📈',
    title: 'Analyse & Grow',
    desc: 'Monthly revenue charts, plan distribution, area heatmaps, and PDF reports. Know exactly where your gym stands.',
  },
];

export function HowItWorks() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Header fade-up
      gsap.fromTo('.how-reveal',
        { y: 30, opacity: 0 },
        {
          y: 0, opacity: 1, duration: 0.65, stagger: 0.1, ease: 'power3.out',
          scrollTrigger: { trigger: containerRef.current, start: 'top 82%' },
        }
      );

      // Per-card slide-in from alternating sides
      document.querySelectorAll('.how-card').forEach((card, i) => {
        const fromLeft = i % 2 === 0;
        gsap.fromTo(card,
          { x: fromLeft ? -60 : 60, opacity: 0 },
          {
            x: 0, opacity: 1, duration: 0.7, ease: 'power3.out',
            scrollTrigger: {
              trigger: card,
              start: 'top 85%',
            },
          }
        );
      });

      // Circle pop-in
      document.querySelectorAll('.how-node').forEach((node) => {
        gsap.fromTo(node,
          { scale: 0, opacity: 0 },
          {
            scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.7)',
            scrollTrigger: {
              trigger: node,
              start: 'top 88%',
            },
          }
        );
      });
    }, containerRef);
    return () => ctx.revert();
  }, []);

  return (
    <section
      id="how"
      ref={containerRef}
      className="relative overflow-hidden py-[130px] px-6 md:px-20"
      style={{ background: '#FFFFFF' }}
    >
      {/* Dot-grid background */}
      <div
        className="absolute inset-0 z-0 opacity-60"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(37,99,235,0.12) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />
      {/* Radial fade masks */}
      <div className="absolute inset-0 z-0" style={{
        background: 'radial-gradient(ellipse 80% 50% at 50% 50%, transparent 60%, #FFFFFF 100%)',
      }} />

      <div className="relative z-10 max-w-[1200px] mx-auto">
        {/* Header */}
        <div className="text-center mb-20">
          <span className="how-reveal section-badge mb-5">How It Works</span>
          <h2
            className="how-reveal font-black text-slate-900 tracking-tight leading-[1.08] mt-5"
            style={{ fontSize: 'clamp(36px, 4.5vw, 56px)' }}
          >
            Up and running{' '}
            <span style={{
              background: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 50%, #3B82F6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              in minutes.
            </span>
          </h2>
          <p className="how-reveal text-[16px] leading-relaxed max-w-[520px] mx-auto mt-5" style={{ color: '#64748B' }}>
            No IT team needed. No complex setup. Just sign up and go.
          </p>
        </div>

        {/* Steps — vertical stepper */}
        <div className="relative max-w-[800px] mx-auto">

          {/* Vertical connector line */}
          <div
            className="absolute left-1/2 top-0 bottom-0 w-[2px] -translate-x-1/2 z-0"
            style={{
              background: 'linear-gradient(180deg, #1E3A8A 0%, #2563EB 50%, #3B82F6 100%)',
              opacity: 0.25,
            }}
          />
          {/* Animated shimmer on connector */}
          <div
            className="absolute left-1/2 top-0 bottom-0 w-[2px] -translate-x-1/2 z-0"
            style={{
              background: 'linear-gradient(180deg, transparent, rgba(59,130,246,0.7), transparent)',
              backgroundSize: '100% 200%',
              animation: 'connectorFlow 3s linear infinite',
            }}
          />

          {STEPS.map((step, i) => {
            const isLeft = i % 2 === 0;
            return (
              <div
                key={i}
                className={`how-reveal relative z-10 flex items-center gap-8 mb-16 last:mb-0 ${isLeft ? 'flex-row' : 'flex-row-reverse'}`}
              >
                {/* Card */}
                <div
                  className={`how-card flex-1 group rounded-[18px] p-6 transition-all duration-300 hover:-translate-y-1 ${isLeft ? 'text-right' : 'text-left'}`}
                  style={{
                    background: '#FFFFFF',
                    border: '1px solid rgba(37,99,235,0.09)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.05), 0 0 0 1px rgba(37,99,235,0.05)',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 28px rgba(0,0,0,0.09), 0 0 0 1px rgba(37,99,235,0.12)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.05), 0 0 0 1px rgba(37,99,235,0.05)';
                  }}
                >
                  <div className={`text-2xl mb-3 ${isLeft ? 'text-right' : 'text-left'}`}>{step.emoji}</div>
                  <h3 className="text-[16px] font-bold text-slate-900 mb-2 leading-snug">{step.title}</h3>
                  <p className="text-[13px] leading-[1.65]" style={{ color: '#64748B' }}>{step.desc}</p>
                </div>

                {/* Centre circle node */}
                <div
                  className="how-node shrink-0 w-[36px] h-[36px] rounded-full flex items-center justify-center font-extrabold text-white text-[11px] transition-all duration-300 hover:scale-110 relative z-10"
                  style={{
                    background: 'linear-gradient(135deg, #1E3A8A, #2563EB, #3B82F6)',
                    boxShadow: '0 4px 14px rgba(30,58,138,0.38), 0 0 0 3px rgba(37,99,235,0.1)',
                    fontFamily: 'Sora, sans-serif',
                  }}
                >
                  {step.num}
                </div>

                {/* Spacer to balance opposite side */}
                <div className="flex-1" />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
