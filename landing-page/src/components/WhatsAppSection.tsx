// @ts-nocheck
import { useRef, useEffect } from 'react';
import { MessageSquare, Check, Zap, Ban } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function WhatsAppSection() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Fade up animation for the left content
      gsap.fromTo(
        '.wa-left > *',
        { y: 30, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.6,
          stagger: 0.1,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: containerRef.current,
            start: 'top 80%',
          },
        }
      );

      // Slide in animation for the cards
      gsap.fromTo(
        '.wa-card',
        { x: 40, opacity: 0 },
        {
          x: 0,
          opacity: 1,
          duration: 0.6,
          stagger: 0.15,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: containerRef.current,
            start: 'top 75%',
          },
        }
      );
    }, containerRef);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={containerRef} className="py-24 px-6 md:px-16 lg:px-24 bg-white relative overflow-hidden">
      {/* Background soft glow */}
      <div 
        className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full z-0 opacity-40 pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(34,197,94,0.08) 0%, rgba(255,255,255,0) 70%)', transform: 'translate(30%, -30%)' }}
      />

      <div className="max-w-[1280px] mx-auto relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
        
        {/* ── Left Column: Content ────────────────────────────────────────── */}
        <div className="wa-left flex flex-col items-start max-w-[560px]">
          
          {/* Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 border border-green-200 text-green-600 font-semibold text-[11px] uppercase tracking-wider mb-8">
            <MessageSquare className="w-3.5 h-3.5" />
            WhatsApp Automation
          </div>

          {/* Heading */}
          <h2 className="text-[40px] md:text-[52px] font-black text-slate-900 leading-[1.1] mb-8 tracking-tight" style={{ fontFamily: 'Sora, sans-serif' }}>
            WhatsApp automation.<br />
            <span className="text-green-500">Unlimited. Built in.</span>
          </h2>

          {/* Body Text */}
          <p className="text-slate-500 text-[18px] leading-relaxed mb-6">
            Every plan includes fully automated WhatsApp messaging: welcome messages when a member joins, renewal reminders before their plan expires, and payment due alerts.
          </p>
          <p className="text-slate-500 text-[18px] leading-relaxed mb-10">
            No per-message fees. No monthly caps. No third-party integrations to set up.
          </p>

          {/* Highlight Box */}
          <div className="inline-flex items-center gap-3 px-5 py-3 rounded-xl bg-green-50 border border-green-200 mb-8">
            <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
            <span className="text-green-600 font-semibold text-[15px]">Unlimited WhatsApp messages included</span>
          </div>

          {/* Subtext */}
          <div className="flex items-start gap-3 text-slate-400 text-[14px] leading-relaxed">
            <Zap className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" fill="currentColor" />
            <p>
              Every other gym platform charges <strong className="text-slate-500 font-semibold">₹0.30–₹1 per message</strong>. With 200 members that's thousands spent monthly, just on notifications. We include it at zero extra cost.
            </p>
          </div>

        </div>

        {/* ── Right Column: Cards ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-6 relative">
          
          {/* Starter Plan Card */}
          <div className="wa-card bg-[#F8FDF9] border border-[#E0F2E5] rounded-[24px] p-8 shadow-[0_8px_30px_rgba(34,197,94,0.04)] relative">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-2xl bg-[#E5F6EB] flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Starter Plan</div>
                <div className="text-[18px] font-bold text-slate-900">WhatsApp Automation</div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-[#E5F6EB] flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3 h-3 text-green-600" strokeWidth={3} />
                </div>
                <span className="text-slate-600 text-[15px]">Welcome message on member join</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-[#E5F6EB] flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3 h-3 text-green-600" strokeWidth={3} />
                </div>
                <span className="text-slate-600 text-[15px]">Renewal reminders before expiry</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-[#E5F6EB] flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3 h-3 text-green-600" strokeWidth={3} />
                </div>
                <span className="text-slate-600 text-[15px]">Payment due alerts</span>
              </div>
              <div className="flex items-start gap-3 pt-2 opacity-50">
                <div className="w-5 h-5 flex items-center justify-center shrink-0 mt-0.5">
                  <Ban className="w-4 h-4 text-slate-400" />
                </div>
                <span className="text-slate-400 text-[15px] line-through">Bulk announcements not included</span>
              </div>
            </div>
          </div>

          {/* Growth Plan Card */}
          <div className="wa-card bg-[#F5F8FF] border border-[#DCE6FB] rounded-[24px] p-8 shadow-[0_8px_30px_rgba(59,130,246,0.06)] relative overflow-hidden">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-2xl bg-[#E0EBFF] flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Growth Plan</div>
                <div className="text-[18px] font-bold text-slate-900">Advanced WhatsApp Automation</div>
              </div>
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-100/50 text-blue-600 text-[12px] font-bold border border-blue-200/50">
                <Zap className="w-3.5 h-3.5" fill="currentColor" />
                Growth
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-[#E0EBFF] flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3 h-3 text-blue-600" strokeWidth={3} />
                </div>
                <span className="text-slate-600 text-[15px]">Everything in Starter</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-[#E0EBFF] flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3 h-3 text-blue-600" strokeWidth={3} />
                </div>
                <span className="text-slate-600 text-[15px]">Bulk announcements to all members</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-[#E0EBFF] flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3 h-3 text-blue-600" strokeWidth={3} />
                </div>
                <span className="text-slate-600 text-[15px]">Gym notices, offers & updates</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-[#E0EBFF] flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3 h-3 text-blue-600" strokeWidth={3} />
                </div>
                <span className="text-slate-600 text-[15px] font-medium">One-tap broadcast to your entire gym</span>
              </div>
            </div>
          </div>

          {/* Small footer note */}
          <div className="wa-card flex items-center justify-between border border-slate-100 rounded-xl p-3 bg-white shadow-sm mt-2">
            <p className="text-[12px] text-slate-500 pl-2">
              All plans include <strong className="text-slate-700">unlimited automated messages</strong> with no monthly limits or hidden charges.
            </p>
            <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center shrink-0 ml-4 border border-green-100">
              <MessageSquare className="w-4 h-4 text-green-500" />
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
