import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function Features() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo('.reveal', 
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
    <section id="features" ref={containerRef} className="py-[100px] px-6 md:px-20 bg-white">
      <div className="max-w-[700px] mb-[60px]">
        <span className="reveal inline-block text-[11px] font-bold tracking-[3px] uppercase text-blue-mid mb-3.5">Core Modules</span>
        <h2 className="reveal text-[42px] font-black text-ink tracking-tight leading-[1.1] mb-4">
          Everything your gym needs,<br /><span className="bg-gradient-to-br from-blue-dark to-blue-bright bg-clip-text text-transparent">nothing it doesn't.</span>
        </h2>
        <p className="reveal text-base text-ink-muted leading-relaxed max-w-[560px]">
          Built specifically for the workflows of independent gyms in Tamil Nadu and Puducherry.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[
          { icon: '📊', title: 'Dashboard & Live Stats', desc: 'Active members, today\'s collection, expiring soon, total dues — updated live. One glance tells the full story.' },
          { icon: '👥', title: 'Member Management', desc: 'Full CRUD with auto-generated GF-prefixed IDs, area autocomplete, plan price auto-fill, and bulk editing.' },
          { icon: '💳', title: 'Payments & Dues', desc: 'Record cash, UPI, or card. Filter by period. Export to Excel. WhatsApp reminder deep-links for pending dues.' },
          { icon: '✅', title: 'One-Tap Attendance', desc: 'Mark daily attendance in a single tap. Duplicate prevention via DB constraint. Monthly calendar view included.' },
          { icon: '🗺️', title: 'AI Geo Intelligence', desc: '11-step area normalization pipeline with Gemini 2.0 Flash fallback. 1200+ static aliases for TN & Puducherry.' },
          { icon: '📂', title: 'Bulk CSV/Excel Import', desc: 'Smart column detection with 40+ aliases per field. 5-stage import pipeline with area review and confidence dots.' },
        ].map((feat, i) => (
          <div key={i} className="reveal bg-white border-[1.5px] border-blue-mid/15 rounded-2xl p-7 relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:border-blue-mid/30 group">
            <div className="w-12 h-12 rounded-xl mb-4.5 bg-gradient-to-br from-blue-pale to-blue-mid/15 border border-blue-mid/20 flex items-center justify-center text-[22px]">
              {feat.icon}
            </div>
            <h3 className="text-base font-bold text-ink mb-2">{feat.title}</h3>
            <p className="text-[13px] text-ink-muted leading-[1.6]">{feat.desc}</p>
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-gradient-to-r from-blue-dark to-blue-bright scale-x-0 origin-left transition-transform duration-300 group-hover:scale-x-100" />
          </div>
        ))}
      </div>
    </section>
  );
}
