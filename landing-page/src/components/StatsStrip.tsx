import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function StatsStrip() {
  const stripRef = useRef<HTMLElement>(null);
  const countersRef = useRef<HTMLSpanElement[]>([]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      countersRef.current.forEach(counter => {
        const target = parseInt(counter.dataset.target || '0', 10);
        const prefix = counter.dataset.prefix || '';
        const suffix = counter.dataset.suffix || '';
        
        ScrollTrigger.create({
          trigger: stripRef.current,
          start: 'top 80%',
          once: true,
          onEnter: () => {
            gsap.to(counter, {
              innerHTML: target,
              duration: 1.8,
              ease: 'power2.out',
              snap: { innerHTML: 1 },
              onUpdate: function() {
                counter.innerHTML = prefix + Math.floor(Number(this.targets()[0].innerHTML)) + suffix;
              },
            });
          }
        });
      });
    }, stripRef);

    return () => ctx.revert();
  }, []);

  const setRef = (el: HTMLSpanElement | null, i: number) => {
    if (el) countersRef.current[i] = el;
  };

  return (
    <section ref={stripRef} className="bg-gradient-to-br from-blue-dark to-blue-bright py-10 px-6 md:px-20 grid grid-cols-2 md:grid-cols-4 gap-y-8 md:gap-y-0">
      <div className="text-center md:border-r border-white/15 px-5">
        <span ref={el => setRef(el, 0)} data-target="500" data-suffix="+" className="block text-4xl font-black text-white leading-none mb-1.5">0</span>
        <span className="text-[13px] font-medium text-white/75">Gyms Onboarded</span>
      </div>
      <div className="text-center md:border-r border-white/15 px-5">
        <span ref={el => setRef(el, 1)} data-target="2" data-prefix="₹" data-suffix="Cr+" className="block text-4xl font-black text-white leading-none mb-1.5">0</span>
        <span className="text-[13px] font-medium text-white/75">Payments Tracked</span>
      </div>
      <div className="text-center md:border-r border-white/15 px-5">
        <span ref={el => setRef(el, 2)} data-target="50" data-suffix="K+" className="block text-4xl font-black text-white leading-none mb-1.5">0</span>
        <span className="text-[13px] font-medium text-white/75">Members Managed</span>
      </div>
      <div className="text-center px-5">
        <span ref={el => setRef(el, 3)} data-target="1200" data-suffix="+" className="block text-4xl font-black text-white leading-none mb-1.5">0</span>
        <span className="text-[13px] font-medium text-white/75">Area Aliases</span>
      </div>
    </section>
  );
}
