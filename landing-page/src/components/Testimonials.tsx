import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function Testimonials() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo('.reveal-testi', 
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
    <section ref={containerRef} className="py-[100px] px-6 md:px-20 bg-blue-tint">
      <div className="text-center mb-12">
        <span className="reveal-testi inline-block text-[11px] font-bold tracking-[3px] uppercase text-blue-mid mb-3.5">What Gym Owners Say</span>
        <h2 className="reveal-testi text-[42px] font-black text-ink tracking-tight leading-[1.1]">
          Real gyms. <span className="bg-gradient-to-br from-blue-dark to-blue-bright bg-clip-text text-transparent">Real results.</span>
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
        {[
          { quote: '"Before GymFlow I had 4 notebooks. Now I open one tab. Dues used to slip through — not anymore."', author: 'Karthik R.', gym: 'Iron Arena, Puducherry' },
          { quote: '"The WhatsApp reminder feature alone saves me 2 hours every week. Members actually pay on time now."', author: 'Priya S.', gym: 'FitZone, Chennai' },
          { quote: '"Imported 300 members from Excel in 10 minutes. GymFlow fixed all the messy area names automatically."', author: 'Murugan T.', gym: 'Strength Lab, Coimbatore' },
        ].map((t, i) => (
          <div key={i} className="reveal-testi bg-white border-[1.5px] border-blue-mid/15 rounded-2xl p-7 transition-all duration-250 hover:-translate-y-1 hover:shadow-2xl relative">
            <span className="block text-[48px] text-blue-mid/10 leading-none mb-3 font-serif">❝</span>
            <p className="text-sm text-ink-mid leading-[1.65] mb-5">{t.quote}</p>
            <div className="text-sm font-bold text-ink">{t.author}</div>
            <div className="text-[12px] font-medium text-blue-mid mt-0.5">{t.gym}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
