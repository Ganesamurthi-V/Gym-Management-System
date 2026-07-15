import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function StatsStrip() {
  const stripRef = useRef<HTMLElement>(null);
  const countersRef = useRef<HTMLSpanElement[]>([]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      countersRef.current.forEach(counter => {
        const target = parseInt(counter.dataset.target || '0', 10);
        const prefix = counter.dataset.prefix || '';
        const suffix = counter.dataset.suffix || '';
        ScrollTrigger.create({
          trigger: stripRef.current,
          start: 'top 80%',
          once: true,
          onEnter: () => {
            gsap.to(counter, {
              innerHTML: target,
              duration: 2,
              ease: 'power2.out',
              snap: { innerHTML: 1 },
              onUpdate() {
                counter.innerHTML = prefix + Math.floor(Number(this.targets()[0].innerHTML)) + suffix;
              },
            });
          }
        });
      });
    }, stripRef);
    return () => ctx.revert();
  }, []);

  const setRef = (el: HTMLSpanElement | null, i: number) => {
    if (el) countersRef.current[i] = el;
  };

  const stats = [
    { target: 500,  prefix: '',  suffix: '+',    label: 'Gyms Onboarded',  icon: '🏋️' },
    { target: 2,    prefix: '₹', suffix: 'Cr+',  label: 'Payments Tracked', icon: '💰' },
    { target: 50,   prefix: '',  suffix: 'K+',   label: 'Members Managed',  icon: '👥' },
    { target: 1200, prefix: '',  suffix: '+',    label: 'Area Aliases',     icon: '📍' },
  ];

  return (
    <section
      ref={stripRef}
      className="relative overflow-hidden py-14 px-6 md:px-20"
      style={{
        background: 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 45%, #1D4ED8 75%, #2563EB 100%)',
      }}
    >
      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0 z-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      {/* Glow orb */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[200px] z-0"
        style={{ background: 'radial-gradient(ellipse, rgba(255,255,255,0.06) 0%, transparent 70%)' }}
      />

      <div className="relative z-10 max-w-[1100px] mx-auto grid grid-cols-2 md:grid-cols-4 gap-y-10 md:gap-y-0">
        {stats.map((s, i) => (
          <div
            key={i}
            className="text-center px-6"
            style={{
              borderRight: i < 3 ? '1px solid rgba(255,255,255,0.10)' : 'none',
            }}
          >
            <div className="text-xl mb-2">{s.icon}</div>
            <span
              ref={el => setRef(el, i)}
              data-target={s.target}
              data-prefix={s.prefix}
              data-suffix={s.suffix}
              className="block font-black text-white leading-none mb-2"
              style={{ fontSize: 'clamp(32px, 4vw, 48px)', fontFamily: 'Sora, sans-serif' }}
            >
              0
            </span>
            <span
              className="text-[13px] font-medium tracking-wide"
              style={{ color: 'rgba(255,255,255,0.65)' }}
            >
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
