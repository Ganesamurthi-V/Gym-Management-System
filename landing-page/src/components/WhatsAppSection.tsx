// @ts-nocheck
import { useRef, useEffect } from 'react';
import { MessageSquare, Check, Zap, Ban } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function WhatsAppSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLImageElement>(null);

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
      // Repeating vibrate/shake on the phone — feels like a notification buzz
      const phone = phoneRef.current;
      if (phone) {
        const shake = () => {
          gsap.timeline()
            .to(phone, { x: -5, rotation: -2, duration: 0.06, ease: 'power1.inOut' })
            .to(phone, { x:  5, rotation:  2, duration: 0.06, ease: 'power1.inOut' })
            .to(phone, { x: -4, rotation: -1.5, duration: 0.06, ease: 'power1.inOut' })
            .to(phone, { x:  4, rotation:  1.5, duration: 0.06, ease: 'power1.inOut' })
            .to(phone, { x: -2, rotation: -1, duration: 0.05, ease: 'power1.inOut' })
            .to(phone, { x:  2, rotation:  1, duration: 0.05, ease: 'power1.inOut' })
            .to(phone, { x:  0, rotation:  0, duration: 0.05, ease: 'power1.out' });
        };

        // Fire immediately once visible, then repeat every 2.5s
        ScrollTrigger.create({
          trigger: containerRef.current,
          start: 'top 75%',
          onEnter: () => {
            shake();
            const interval = setInterval(shake, 2500);
            // Clean up interval when section leaves view
            ScrollTrigger.create({
              trigger: containerRef.current,
              start: 'bottom top',
              onEnter: () => clearInterval(interval),
            });
          },
        });
      }
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

        {/* ── Right Column: Image Mockup ─────────────────────────────────────────── */}
        <div className="wa-card relative flex items-center justify-center lg:justify-end w-full">
          <div className="relative w-full max-w-[380px] lg:max-w-[440px] flex justify-center">
            {/* Soft mint blob background */}
            <div
              className="absolute inset-0 z-0 pointer-events-none"
              style={{
                background: 'radial-gradient(circle at 50% 50%, rgba(134,239,172,0.25) 0%, rgba(187,247,208,0.15) 45%, transparent 70%)',
                transform: 'scale(1.4)',
              }}
            />
            
            {/* Decorative dashes top-left */}
            <div className="absolute top-[12%] left-[15%] md:top-[14%] md:left-[18%] z-0 opacity-80">
              <svg width="50" height="50" viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M25 18 L20 4 M18 25 L4 20 M34 14 L44 4" stroke="#22c55e" strokeWidth="3.5" strokeLinecap="round"/>
              </svg>
            </div>
            
            {/* Decorative curl bottom-right */}
            <div className="absolute bottom-[10%] right-[12%] md:bottom-[12%] md:right-[15%] z-0 opacity-70">
              <svg width="70" height="70" viewBox="0 0 70 70" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M15 25 C 20 60, 60 60, 55 15" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="6 6" fill="none"/>
                <path d="M45 20 L55 15 L60 25" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            </div>

            <img 
              ref={phoneRef}
              src="/Whatsapp_phone.png" 
              alt="WhatsApp Automation on Phone" 
              className="relative z-10 w-full object-contain drop-shadow-2xl" 
            />
          </div>
        </div>

      </div>
    </section>
  );
}
