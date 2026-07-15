import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const TESTIMONIALS = [
  {
    quote: 'Before GymFlow I had 4 notebooks. Now I open one tab. Dues used to slip through — not anymore.',
    author: 'Karthik R.',
    gym: 'Iron Arena, Puducherry',
    initials: 'KR',
    gradFrom: '#1E3A8A',
    gradTo: '#3B82F6',
  },
  {
    quote: 'The WhatsApp reminder feature alone saves me 2 hours every week. Members actually pay on time now.',
    author: 'Priya S.',
    gym: 'FitZone, Chennai',
    initials: 'PS',
    gradFrom: '#059669',
    gradTo: '#34D399',
  },
  {
    quote: 'Imported 300 members from Excel in 10 minutes. GymFlow fixed all the messy area names automatically.',
    author: 'Murugan T.',
    gym: 'Strength Lab, Coimbatore',
    initials: 'MT',
    gradFrom: '#7c3aed',
    gradTo: '#A78BFA',
  },
];

export function Testimonials() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo('.testi-reveal',
        { y: 32, opacity: 0 },
        {
          y: 0, opacity: 1, duration: 0.65, stagger: 0.12, ease: 'power3.out',
          scrollTrigger: { trigger: containerRef.current, start: 'top 82%' },
        }
      );
    }, containerRef);
    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={containerRef}
      className="relative overflow-hidden py-[130px] px-6 md:px-20"
      style={{ background: '#F5F8FF' }}
    >
      {/* Background blob */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] z-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(37,99,235,0.07) 0%, transparent 70%)' }}
      />

      <div className="max-w-[1100px] mx-auto relative z-10">
        {/* Header */}
        <div className="text-center mb-20">
          <span className="testi-reveal section-badge mb-5">What Gym Owners Say</span>
          <h2
            className="testi-reveal font-black text-slate-900 tracking-tight leading-[1.08] mt-5"
            style={{ fontSize: 'clamp(36px, 4.5vw, 56px)' }}
          >
            Real gyms.{' '}
            <span style={{
              background: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 50%, #3B82F6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              Real results.
            </span>
          </h2>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t, i) => (
            <div
              key={i}
              className="testi-reveal rounded-[22px] p-8 relative transition-all duration-300"
              style={{
                background: '#FFFFFF',
                border: '1px solid rgba(37,99,235,0.08)',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.05)',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = 'translateY(-5px)';
                el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.04), 0 20px 48px rgba(0,0,0,0.10), 0 0 0 1px rgba(37,99,235,0.12)';
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = 'translateY(0)';
                el.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.05)';
              }}
            >
              {/* Star rating */}
              <div className="flex items-center gap-0.5 mb-5">
                {[...Array(5)].map((_, j) => (
                  <svg key={j} className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                ))}
              </div>

              {/* Decorative quote */}
              <div
                className="text-[56px] leading-none mb-2 font-serif select-none"
                style={{ color: 'rgba(37,99,235,0.10)', lineHeight: 1 }}
              >
                "
              </div>

              <p className="text-[15px] leading-[1.7] mb-7" style={{ color: '#475569' }}>
                {t.quote}
              </p>

              {/* Author */}
              <div className="flex items-center gap-3 pt-5" style={{ borderTop: '1px solid rgba(37,99,235,0.07)' }}>
                {/* Avatar */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-bold text-white shrink-0"
                  style={{ background: `linear-gradient(135deg, ${t.gradFrom}, ${t.gradTo})` }}
                >
                  {t.initials}
                </div>
                <div>
                  <div className="text-[14px] font-bold text-slate-900">{t.author}</div>
                  {/* Gym pill */}
                  <div
                    className="inline-flex items-center text-[11px] font-semibold px-2.5 py-0.5 rounded-full mt-0.5"
                    style={{
                      background: 'rgba(37,99,235,0.07)',
                      color: '#2563EB',
                    }}
                  >
                    {t.gym}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
