import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function HowItWorks() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo('.reveal-how', 
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
    <section id="how" ref={containerRef} className="py-[100px] px-6 md:px-20 bg-blue-tint">
      <div className="text-center mb-[60px]">
        <span className="reveal-how inline-block text-[11px] font-bold tracking-[3px] uppercase text-blue-mid mb-3.5">How It Works</span>
        <h2 className="reveal-how text-[42px] font-black text-ink tracking-tight leading-[1.1] mb-4">
          Up and running <span className="bg-gradient-to-br from-blue-dark to-blue-bright bg-clip-text text-transparent">in minutes.</span>
        </h2>
        <p className="reveal-how text-base text-ink-muted leading-relaxed max-w-[560px] mx-auto">
          No IT team needed. No complex setup. Just sign up and go.
        </p>
      </div>

      <div className="relative grid grid-cols-1 md:grid-cols-4 gap-10 md:gap-0">
        <div className="hidden md:block absolute top-[28px] left-[calc(12.5%+24px)] right-[calc(12.5%+24px)] h-0.5 bg-gradient-to-r from-blue-dark to-blue-bright z-0" />
        
        {[
          { num: '01', title: 'Sign Up & Onboard', desc: 'Complete a 6-step wizard. Set your gym name, membership plans, pricing, and WhatsApp details. Autosaves as you go.' },
          { num: '02', title: 'Import Your Members', desc: 'Upload your existing CSV or Excel. GymFlow auto-detects columns, normalizes areas, and flags anything needing review.' },
          { num: '03', title: 'Manage Daily Operations', desc: 'Mark attendance, record payments, send WhatsApp reminders for dues — all from a single, mobile-friendly dashboard.' },
          { num: '04', title: 'Analyse & Grow', desc: 'Monthly revenue charts, plan distribution, area heatmaps, and PDF reports. Know exactly where your gym stands.' },
        ].map((step, i) => (
          <div key={i} className="reveal-how text-center px-6 relative z-10 group">
            <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-gradient-to-br from-blue-dark to-blue-bright text-white text-lg font-extrabold flex items-center justify-center shadow-lg shadow-blue-dark/30 transition-transform duration-300 group-hover:scale-110">
              {step.num}
            </div>
            <h3 className="text-base font-bold text-ink mb-2.5">{step.title}</h3>
            <p className="text-[13px] text-ink-muted leading-[1.6]">{step.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
