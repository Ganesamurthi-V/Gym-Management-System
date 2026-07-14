import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function Footer() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo('.reveal-cta', 
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
    <>
      <section ref={containerRef} className="bg-gradient-to-br from-blue-dark to-blue-bright py-[100px] px-6 md:px-20 text-center relative overflow-hidden">
        <div className="absolute -top-[100px] left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(255,255,255,0.08)_0%,transparent_70%)] pointer-events-none" />
        
        <h2 className="reveal-cta text-[44px] font-black text-white tracking-tight leading-[1.1] mb-4 relative z-10">
          Stop managing members.<br />Start growing your gym.
        </h2>
        <p className="reveal-cta text-base text-white/80 mb-10 relative z-10 max-w-[600px] mx-auto">
          Join 500+ gym owners already using GymFlow across Tamil Nadu and Puducherry.
        </p>
        
        <a href="https://app.gymflow.sbs" className="reveal-cta inline-block bg-white text-blue-dark border-none rounded-lg py-4 px-9 text-base font-bold cursor-pointer shadow-[0_8px_30px_rgba(0,0,0,0.15)] transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_40px_rgba(0,0,0,0.2)] relative z-10">
          Start Free Trial — No credit card required
        </a>
      </section>

      <footer id="support" className="bg-ink py-9 px-6 md:px-20 flex flex-col md:flex-row items-center justify-between gap-6 md:gap-0">
        <div className="text-center md:text-left">
          <div className="text-base font-extrabold text-white">
            Gym<span className="text-blue-light">Flow</span>
          </div>
          <div className="text-[12px] text-white/40 mt-1">
            Built for gym owners, by fitness enthusiasts. © 2026 GymFlow. Tamil Nadu & Puducherry, India.
          </div>
        </div>
        
        <div className="flex items-center gap-7">
          <a href="#" className="text-[13px] text-white/50 hover:text-blue-light transition-colors">Privacy</a>
          <a href="#" className="text-[13px] text-white/50 hover:text-blue-light transition-colors">Terms</a>
          <a href="#support" className="text-[13px] text-white/50 hover:text-blue-light transition-colors">Support</a>
          <a href="mailto:support@gymflow.sbs" className="text-[13px] text-white/50 hover:text-blue-light transition-colors">Contact</a>
        </div>
      </footer>
    </>
  );
}
