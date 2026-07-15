import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Check, Zap } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

export function Pricing() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo('.price-reveal',
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
      id="pricing"
      ref={containerRef}
      className="relative overflow-hidden py-[130px] px-6 md:px-20"
      style={{ background: '#FAFBFF' }}
    >
      {/* Background radial */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px] z-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(37,99,235,0.06) 0%, transparent 70%)' }}
      />

      <div className="max-w-[1100px] mx-auto relative z-10">
        {/* Header */}
        <div className="text-center mb-20">
          <span className="price-reveal section-badge mb-5">Pricing</span>
          <h2
            className="price-reveal font-black text-slate-900 tracking-tight leading-[1.08] mt-5 mb-4"
            style={{ fontSize: 'clamp(36px, 4.5vw, 56px)' }}
          >
            Simple pricing for{' '}
            <span style={{
              background: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 50%, #3B82F6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              serious gym owners.
            </span>
          </h2>
          <p className="price-reveal text-[16px] leading-relaxed max-w-[520px] mx-auto" style={{ color: '#64748B' }}>
            One plan. All features. No hidden fees. Cancel anytime.
          </p>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">

          {/* Starter */}
          <div
            className="price-reveal rounded-[22px] p-8 transition-all duration-300"
            style={{
              background: '#FFFFFF',
              border: '1px solid rgba(37,99,235,0.10)',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.05)',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)';
              (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 4px rgba(0,0,0,0.04), 0 16px 40px rgba(0,0,0,0.09), 0 0 0 1px rgba(37,99,235,0.15)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
              (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.05)';
            }}
          >
            <div className="text-[11px] font-bold tracking-[2.5px] uppercase text-slate-400 mb-4">Starter</div>
            <div className="flex items-baseline gap-1 mb-1">
              <span className="font-black text-slate-900 leading-none" style={{ fontSize: '44px', fontFamily: 'Sora, sans-serif' }}>₹999</span>
            </div>
            <div className="text-sm text-slate-400 mb-4">per month</div>
            <p className="text-[13px] leading-relaxed mb-6" style={{ color: '#64748B' }}>
              Perfect for a single-location gym getting started.
            </p>
            <div className="h-px mb-6" style={{ background: 'rgba(37,99,235,0.08)' }} />
            <ul className="mb-8 space-y-3">
              {['Up to 200 members', 'All core modules', 'WhatsApp reminders', 'CSV/Excel import', 'PDF reports', 'Email support'].map((feat, i) => (
                <li key={i} className="flex items-center gap-2.5 text-[13.5px] text-slate-600">
                  <div className="w-4 h-4 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                    <Check className="w-2.5 h-2.5 text-blue-500" strokeWidth={3} />
                  </div>
                  {feat}
                </li>
              ))}
            </ul>
            <a
              href="https://app.gymflow.sbs"
              className="block text-center w-full py-3 rounded-xl text-sm font-bold transition-all duration-200"
              style={{
                border: '1.5px solid rgba(37,99,235,0.2)',
                color: '#334155',
                background: 'transparent',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(37,99,235,0.5)';
                (e.currentTarget as HTMLAnchorElement).style.color = '#2563EB';
                (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(37,99,235,0.03)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(37,99,235,0.2)';
                (e.currentTarget as HTMLAnchorElement).style.color = '#334155';
                (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
              }}
            >
              Start Free Trial
            </a>
          </div>

          {/* Pro — featured */}
          <div
            className="price-reveal rounded-[22px] p-8 relative overflow-hidden transition-all duration-300 md:-translate-y-4"
            style={{
              background: 'linear-gradient(145deg, #1E3A8A 0%, #1D4ED8 50%, #2563EB 100%)',
              boxShadow: '0 24px 64px rgba(30,58,138,0.45), 0 8px 24px rgba(30,58,138,0.25)',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.transform = 'translateY(calc(-1rem - 4px))';
              (e.currentTarget as HTMLElement).style.boxShadow = '0 32px 80px rgba(30,58,138,0.55), 0 12px 32px rgba(30,58,138,0.3)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.transform = 'translateY(-1rem)';
              (e.currentTarget as HTMLElement).style.boxShadow = '0 24px 64px rgba(30,58,138,0.45), 0 8px 24px rgba(30,58,138,0.25)';
            }}
          >
            {/* Inner glow */}
            <div
              className="absolute -top-[60px] -right-[60px] w-[200px] h-[200px] rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.10) 0%, transparent 70%)' }}
            />

            {/* Badge */}
            <div
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 mb-4 text-[11px] font-bold"
              style={{ background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.95)' }}
            >
              <Zap className="w-3 h-3" fill="currentColor" />
              Most Popular
            </div>

            <div className="text-[11px] font-bold tracking-[2.5px] uppercase mb-4" style={{ color: 'rgba(255,255,255,0.7)' }}>Pro</div>
            <div className="flex items-baseline gap-1 mb-1">
              <span className="font-black text-white leading-none" style={{ fontSize: '44px', fontFamily: 'Sora, sans-serif' }}>₹1,999</span>
            </div>
            <div className="text-sm mb-4" style={{ color: 'rgba(255,255,255,0.6)' }}>per month</div>
            <p className="text-[13px] leading-relaxed mb-6" style={{ color: 'rgba(255,255,255,0.7)' }}>
              For growing gyms with advanced reporting needs.
            </p>
            <div className="h-px mb-6" style={{ background: 'rgba(255,255,255,0.15)' }} />
            <ul className="mb-8 space-y-3">
              {['Unlimited members', 'AI Geo Intelligence', 'Bulk import (up to 200)', 'Redis-cached reports', 'Priority support', 'Super Admin access'].map((feat, i) => (
                <li key={i} className="flex items-center gap-2.5 text-[13.5px] text-white/90">
                  <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.2)' }}>
                    <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                  </div>
                  {feat}
                </li>
              ))}
            </ul>
            <a
              href="https://app.gymflow.sbs"
              className="block text-center w-full py-3.5 rounded-xl text-sm font-bold transition-all duration-200 relative"
              style={{
                background: '#FFFFFF',
                color: '#1E3A8A',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-1px)';
                (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 8px 20px rgba(0,0,0,0.2)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)';
                (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
              }}
            >
              Get Started Now
            </a>
          </div>

          {/* Enterprise */}
          <div
            className="price-reveal rounded-[22px] p-8 transition-all duration-300"
            style={{
              background: '#FFFFFF',
              border: '1px solid rgba(37,99,235,0.10)',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.05)',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)';
              (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 4px rgba(0,0,0,0.04), 0 16px 40px rgba(0,0,0,0.09), 0 0 0 1px rgba(37,99,235,0.15)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
              (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.05)';
            }}
          >
            <div className="text-[11px] font-bold tracking-[2.5px] uppercase text-slate-400 mb-4">Enterprise</div>
            <div className="flex items-baseline gap-1 mb-1">
              <span className="font-black text-slate-900 leading-none" style={{ fontSize: '36px', fontFamily: 'Sora, sans-serif' }}>Custom</span>
            </div>
            <div className="text-sm text-transparent mb-4 select-none">placeholder</div>
            <p className="text-[13px] leading-relaxed mb-6" style={{ color: '#64748B' }}>
              Multi-branch chains &amp; franchise networks.
            </p>
            <div className="h-px mb-6" style={{ background: 'rgba(37,99,235,0.08)' }} />
            <ul className="mb-8 space-y-3">
              {['Multiple branches', 'Custom onboarding', 'Data migration', 'Dedicated support', 'SLA guarantee', 'API access'].map((feat, i) => (
                <li key={i} className="flex items-center gap-2.5 text-[13.5px] text-slate-600">
                  <div className="w-4 h-4 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                    <Check className="w-2.5 h-2.5 text-blue-500" strokeWidth={3} />
                  </div>
                  {feat}
                </li>
              ))}
            </ul>
            <a
              href="#support"
              className="block text-center w-full py-3 rounded-xl text-sm font-bold transition-all duration-200"
              style={{
                border: '1.5px solid rgba(37,99,235,0.2)',
                color: '#334155',
                background: 'transparent',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(37,99,235,0.5)';
                (e.currentTarget as HTMLAnchorElement).style.color = '#2563EB';
                (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(37,99,235,0.03)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(37,99,235,0.2)';
                (e.currentTarget as HTMLAnchorElement).style.color = '#334155';
                (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
              }}
            >
              Contact Us
            </a>
          </div>

        </div>
      </div>
    </section>
  );
}
