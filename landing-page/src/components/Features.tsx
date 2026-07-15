import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { LayoutDashboard, Users, CreditCard, CheckCircle2, Map, FileUp } from 'lucide-react';

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
    <section id="features" ref={containerRef} className="py-[120px] px-6 md:px-12 bg-white relative overflow-hidden">

      <div className="max-w-[1250px] mx-auto relative z-10">
        <div className="max-w-[700px] mb-[60px]">
          <span className="reveal inline-block text-[11px] font-bold tracking-[3px] uppercase text-blue-600 mb-3.5">Core Modules</span>
          <h2 className="reveal text-[42px] font-black text-slate-900 tracking-tight leading-[1.1] mb-4">
            Everything your gym needs,<br />
            <span className="bg-gradient-to-br from-blue-700 to-blue-400 bg-clip-text text-transparent">nothing it doesn't.</span>
          </h2>
          <p className="reveal text-base text-slate-500 leading-relaxed max-w-[560px]">
            Built specifically for the workflows of independent gyms in Tamil Nadu and Puducherry.
          </p>
        </div>

        <div className="reveal rounded-[1.5rem] overflow-hidden bg-slate-200 border border-slate-200 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[1px]">
            {[
              { icon: LayoutDashboard, title: 'Dashboard & Live Stats', desc: 'Active members, today\'s collection, expiring soon, total dues — updated live. One glance tells the full story.', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', lineColor: 'bg-blue-500' },
              { icon: Users, title: 'Member Management', desc: 'Full CRUD with auto-generated GF-prefixed IDs, area autocomplete, plan price auto-fill, and bulk editing.', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', lineColor: 'bg-emerald-500' },
              { icon: CreditCard, title: 'Payments & Dues', desc: 'Record cash, UPI, or card. Filter by period. Export to Excel. WhatsApp reminder deep-links for pending dues.', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', lineColor: 'bg-amber-500' },
              { icon: CheckCircle2, title: 'One-Tap Attendance', desc: 'Mark daily attendance in a single tap. Duplicate prevention via DB constraint. Monthly calendar view included.', color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200', lineColor: 'bg-purple-500' },
              { icon: Map, title: 'AI Geo Intelligence', desc: '11-step area normalization pipeline with Gemini 2.0 Flash fallback. 1200+ static aliases for TN & Puducherry.', color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200', lineColor: 'bg-rose-500' },
              { icon: FileUp, title: 'Bulk CSV/Excel Import', desc: 'Smart column detection with 40+ aliases per field. 5-stage import pipeline with area review and confidence dots.', color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200', lineColor: 'bg-indigo-500' },
            ].map((feat, i) => (
              <div key={i} className="bg-white p-10 group relative overflow-hidden z-0 cursor-default">
                {/* Background tint on hover */}
                <div className={`absolute inset-0 opacity-0 group-hover:opacity-40 transition-opacity duration-300 ${feat.bg} -z-10`} />
                
                {/* Icon Container with pop/rotate effect */}
                <div className={`w-12 h-12 rounded-full border ${feat.border} ${feat.bg} flex items-center justify-center mb-6 transition-all duration-500 group-hover:scale-110 group-hover:-rotate-6 group-hover:shadow-md`}>
                  <feat.icon className={`w-5 h-5 ${feat.color}`} />
                </div>
                
                <h3 className="text-[18px] font-bold text-slate-900 mb-2">{feat.title}</h3>
                <p className="text-[14px] text-slate-500 leading-[1.6] relative z-10">{feat.desc}</p>
                
                {/* Animated bottom border line */}
                <div className={`absolute bottom-0 left-0 right-0 h-1 ${feat.lineColor} scale-x-0 origin-left transition-transform duration-500 ease-out group-hover:scale-x-100`} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
