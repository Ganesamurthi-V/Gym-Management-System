// @ts-nocheck
import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowRight } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

export function Footer() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo('.reveal-cta',
        { y: 28, opacity: 0 },
        {
          y: 0, opacity: 1, duration: 0.65, stagger: 0.1, ease: 'power3.out',
          scrollTrigger: { trigger: containerRef.current, start: 'top 82%' },
        }
      );
    }, containerRef);
    return () => ctx.revert();
  }, []);

  return (
    <>
      {/* CTA Section */}
      <section
        ref={containerRef}
        className="relative overflow-hidden py-[120px] px-6 md:px-20 text-center"
        style={{ background: 'linear-gradient(135deg, #060D1A 0%, #0F1F3D 35%, #1E3A8A 70%, #1D4ED8 100%)' }}
      >
        {/* Radial orb center */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] z-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse, rgba(59,130,246,0.22) 0%, transparent 70%)' }}
        />
        {/* Top-right accent orb */}
        <div
          className="absolute -top-[80px] right-[15%] w-[300px] h-[300px] rounded-full z-0 pointer-events-none animate-[orbFloat_8s_ease-in-out_infinite]"
          style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)' }}
        />
        {/* Bottom-left accent orb */}
        <div
          className="absolute -bottom-[80px] left-[15%] w-[250px] h-[250px] rounded-full z-0 pointer-events-none animate-[orbFloat_11s_ease-in-out_infinite_reverse]"
          style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.12) 0%, transparent 70%)' }}
        />
        {/* Subtle grid */}
        <div
          className="absolute inset-0 z-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        <div className="relative z-10 max-w-[700px] mx-auto">
          <h2
            className="reveal-cta font-black text-white tracking-tight leading-[1.08] mb-6"
            style={{ fontSize: 'clamp(36px, 5vw, 56px)', fontFamily: 'Sora, sans-serif' }}
          >
            Stop managing members.<br />
            Start growing your gym.
          </h2>

          <p className="reveal-cta text-[16px] leading-relaxed mb-10" style={{ color: 'rgba(255,255,255,0.65)' }}>
            Join 500+ gym owners already using GymFlow across Tamil Nadu and Puducherry.
          </p>

          <div className="reveal-cta flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://app.gymflow.sbs"
              className="inline-flex items-center gap-2 text-slate-900 rounded-xl py-4 px-9 text-[15px] font-bold transition-all duration-200"
              style={{
                background: '#FFFFFF',
                boxShadow: '0 8px 32px rgba(0,0,0,0.2), 0 2px 8px rgba(0,0,0,0.1)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-2px)';
                (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 16px 48px rgba(0,0,0,0.28), 0 4px 12px rgba(0,0,0,0.15)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)';
                (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 8px 32px rgba(0,0,0,0.2), 0 2px 8px rgba(0,0,0,0.1)';
              }}
            >
              Start Free Trial — No credit card required
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>

          {/* Trust chips */}
          <div className="reveal-cta flex flex-wrap items-center justify-center gap-5 mt-10">
            {['500+ Gyms', '14-day free trial', 'No credit card', 'Cancel anytime'].map((t, i) => (
              <div
                key={i}
                className="inline-flex items-center gap-2 text-[12px] font-medium"
                style={{ color: 'rgba(255,255,255,0.55)' }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.35)' }}
                />
                {t}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer
        id="support"
        className="py-9 px-6 md:px-20 flex flex-col md:flex-row items-center justify-between gap-6"
        style={{
          background: '#040811',
          borderTop: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        <div className="text-center md:text-left">
          <img src="/logo_landspace_without_bg.webp" alt="GymFlow" width="400" height="178" loading="lazy" decoding="async" className="h-9 w-auto mb-1 opacity-80" />
          <div className="text-[12px]" style={{ color: 'rgba(255,255,255,0.28)' }}>
            Built for gym owners, by fitness enthusiasts. © 2026 GymFlow. Tamil Nadu &amp; Puducherry, India.
          </div>
        </div>

        <div className="flex items-center gap-7">
          {[
            { label: 'Privacy',  href: '#' },
            { label: 'Terms',    href: '#' },
            { label: 'Support',  href: '#support' },
            { label: 'Contact',  href: 'mailto:support@gymflow.sbs' },
          ].map(link => (
            <a
              key={link.label}
              href={link.href}
              className="text-[13px] transition-colors"
              style={{ color: 'rgba(255,255,255,0.35)' }}
              onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.color = 'rgba(255,255,255,0.75)')}
              onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.color = 'rgba(255,255,255,0.35)')}
            >
              {link.label}
            </a>
          ))}
        </div>
      </footer>
    </>
  );
}
