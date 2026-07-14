import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Check } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

export function Pricing() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo('.reveal-price', 
        { y: 30, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.6,
          stagger: 0.1,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: containerRef.current,
            start: 'top 85%',
          }
        }
      );
    }, containerRef);
    return () => ctx.revert();
  }, []);

  return (
    <section id="pricing" ref={containerRef} className="py-[100px] px-6 md:px-20 bg-white">
      <div className="text-center mb-[60px]">
        <span className="reveal-price inline-block text-[11px] font-bold tracking-[3px] uppercase text-blue-mid mb-3.5">Pricing</span>
        <h2 className="reveal-price text-[42px] font-black text-ink tracking-tight leading-[1.1] mb-3">
          Simple pricing for <span className="bg-gradient-to-br from-blue-dark to-blue-bright bg-clip-text text-transparent">serious gym owners.</span>
        </h2>
        <p className="reveal-price text-base text-ink-muted leading-relaxed max-w-[560px] mx-auto">
          One plan. All features. No hidden fees. Cancel anytime.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start max-w-5xl mx-auto">
        {/* Starter */}
        <div className="reveal-price bg-white border-[1.5px] border-blue-mid/15 rounded-[20px] p-8 transition-all duration-250 hover:-translate-y-1 hover:shadow-2xl">
          <div className="text-[11px] font-bold tracking-[2px] uppercase text-blue-mid mb-3">Starter</div>
          <div className="text-[42px] font-black text-ink tracking-tight leading-none mb-1">₹999</div>
          <div className="text-sm text-ink-muted mb-3">/month</div>
          <p className="text-[13px] text-ink-muted leading-relaxed mb-6">Perfect for a single-location gym getting started.</p>
          <div className="h-px bg-blue-mid/15 mb-5" />
          <ul className="mb-7 space-y-2.5">
            {['Up to 200 members', 'All core modules', 'WhatsApp reminders', 'CSV/Excel import', 'PDF reports', 'Email support'].map((feat, i) => (
              <li key={i} className="flex items-center gap-2 text-[13px] text-ink-mid">
                <Check className="w-3.5 h-3.5 text-blue-mid flex-shrink-0" strokeWidth={4} />
                {feat}
              </li>
            ))}
          </ul>
          <button className="w-full py-3 rounded-lg text-sm font-bold bg-transparent border-[1.5px] border-blue-mid/15 text-ink-mid hover:border-blue-mid hover:text-blue-mid transition-colors">
            Start Free Trial
          </button>
        </div>

        {/* Pro */}
        <div className="reveal-price bg-gradient-to-br from-blue-dark to-blue-bright rounded-[20px] p-8 shadow-[0_20px_60px_rgba(11,31,232,0.35)] md:scale-105 transition-all duration-250 hover:-translate-y-1 hover:md:scale-105">
          <div className="text-[11px] font-bold tracking-[2px] uppercase text-white/80 mb-3">Pro — Most Popular</div>
          <div className="text-[42px] font-black text-white tracking-tight leading-none mb-1">₹1,999</div>
          <div className="text-sm text-white/70 mb-3">/month</div>
          <p className="text-[13px] text-white/75 leading-relaxed mb-6">For growing gyms with advanced reporting needs.</p>
          <div className="h-px bg-white/20 mb-5" />
          <ul className="mb-7 space-y-2.5">
            {['Unlimited members', 'AI Geo Intelligence', 'Bulk import (up to 200)', 'Redis-cached reports', 'Priority support', 'Super Admin access'].map((feat, i) => (
              <li key={i} className="flex items-center gap-2 text-[13px] text-white/90">
                <Check className="w-3.5 h-3.5 text-white/90 flex-shrink-0" strokeWidth={4} />
                {feat}
              </li>
            ))}
          </ul>
          <button className="w-full py-3 rounded-lg text-sm font-bold bg-white text-blue-dark hover:-translate-y-px hover:shadow-lg transition-all">
            Get Started Now
          </button>
        </div>

        {/* Enterprise */}
        <div className="reveal-price bg-white border-[1.5px] border-blue-mid/15 rounded-[20px] p-8 transition-all duration-250 hover:-translate-y-1 hover:shadow-2xl">
          <div className="text-[11px] font-bold tracking-[2px] uppercase text-blue-mid mb-3">Enterprise</div>
          <div className="text-[32px] font-black text-ink tracking-tight leading-none mb-[23px]">Custom</div>
          <p className="text-[13px] text-ink-muted leading-relaxed mb-6">Multi-branch chains & franchise networks.</p>
          <div className="h-px bg-blue-mid/15 mb-5" />
          <ul className="mb-7 space-y-2.5">
            {['Multiple branches', 'Custom onboarding', 'Data migration', 'Dedicated support', 'SLA guarantee', 'API access'].map((feat, i) => (
              <li key={i} className="flex items-center gap-2 text-[13px] text-ink-mid">
                <Check className="w-3.5 h-3.5 text-blue-mid flex-shrink-0" strokeWidth={4} />
                {feat}
              </li>
            ))}
          </ul>
          <button className="w-full py-3 rounded-lg text-sm font-bold bg-transparent border-[1.5px] border-blue-mid/15 text-ink-mid hover:border-blue-mid hover:text-blue-mid transition-colors">
            Contact Us
          </button>
        </div>
      </div>
    </section>
  );
}
