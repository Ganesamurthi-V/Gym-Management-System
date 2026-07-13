import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { Play } from 'lucide-react';

export function Hero() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline();
      
      tl.from('.hero-badge', { y: -20, opacity: 0, duration: 0.7, ease: 'power2.out' })
        .from('.hero-title', { y: 20, opacity: 0, duration: 0.7, ease: 'power2.out' }, '-=0.5')
        .from('.hero-subtitle', { y: 20, opacity: 0, duration: 0.7, ease: 'power2.out' }, '-=0.55')
        .from('.hero-desc', { y: 20, opacity: 0, duration: 0.7, ease: 'power2.out' }, '-=0.5')
        .from('.hero-ctas', { y: 20, opacity: 0, duration: 0.7, ease: 'power2.out' }, '-=0.5')
        .from('.hero-right', { x: 40, opacity: 0, duration: 0.9, ease: 'power2.out' }, '-=0.6')
        .from('.dc-bar', { scaleY: 0, transformOrigin: 'bottom', opacity: 0, duration: 1, stagger: 0.05, ease: 'power2.out' }, '-=0.2');
        
    }, containerRef);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={containerRef} className="pt-[140px] pb-[100px] px-6 md:px-20 min-h-screen grid grid-cols-1 lg:grid-cols-2 gap-20 items-center relative overflow-hidden">
      
      {/* Background elements */}
      <div className="absolute inset-0 z-0 bg-[linear-gradient(rgba(26,115,232,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(26,115,232,0.06)_1px,transparent_1px)] bg-[size:70px_70px] animate-[gridPulse_6s_ease-in-out_infinite]" />
      <div className="absolute -top-[200px] -right-[200px] z-0 w-[700px] h-[700px] bg-[radial-gradient(circle,rgba(26,115,232,0.18)_0%,transparent_70%)] animate-[glowPulse_5s_ease-in-out_infinite]" />
      <div className="absolute -bottom-[100px] left-[30%] z-0 w-[400px] h-[400px] bg-[radial-gradient(circle,rgba(11,31,232,0.08)_0%,transparent_70%)] animate-[glowPulse_7s_ease-in-out_infinite_reverse]" />

      <div className="relative z-10 hero-left">
        <div className="hero-badge inline-flex items-center gap-2 bg-blue-mid/10 border border-blue-mid/25 rounded-full px-3.5 py-1.5 mb-7">
          <div className="w-[7px] h-[7px] rounded-full bg-blue-mid animate-[dotBlink_2s_ease-in-out_infinite]" />
          <span className="text-[12px] font-semibold text-blue-mid tracking-wide">Built for Tamil Nadu & Puducherry gyms</span>
        </div>

        <h1 className="hero-title text-5xl md:text-[62px] font-black leading-[1.08] text-ink tracking-tight mb-4">
          Know Who Paid.<br />
          Who Didn't.<br />
          <span className="bg-gradient-to-br from-blue-dark to-blue-bright bg-clip-text text-transparent">Who's Expiring.</span>
        </h1>

        <p className="hero-subtitle text-xl md:text-[22px] font-bold text-blue-mid mb-5">
          —without the notebooks.
        </p>

        <p className="hero-desc text-base font-normal text-ink-muted leading-relaxed max-w-[520px] mb-10">
          GymFlow is the all-in-one gym management platform for independent gym owners.
          Members, payments, attendance, dues, and WhatsApp reminders — in one place.
        </p>

        <div className="hero-ctas flex flex-wrap items-center gap-4">
          <a href="#" className="bg-gradient-to-br from-blue-dark to-blue-bright text-white border-none rounded-lg py-3.5 px-7 text-[15px] font-semibold cursor-pointer shadow-lg shadow-blue-dark/30 transition-transform hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-dark/40">
            Start Free Trial — No card needed
          </a>
          <a href="#" className="flex items-center gap-2 bg-transparent border-[1.5px] border-blue-mid/15 rounded-lg py-[13px] px-5 text-[15px] font-semibold text-ink-mid cursor-pointer transition-colors hover:border-blue-mid hover:text-blue-mid group">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-dark to-blue-bright flex items-center justify-center">
              <Play className="w-3 h-3 text-white ml-0.5" fill="currentColor" />
            </div>
            Watch Demo
          </a>
        </div>
      </div>

      <div className="relative z-10 hero-right">
        <div className="bg-white border-[1.5px] border-blue-mid/15 rounded-[20px] shadow-2xl p-7 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-dark via-blue-bright to-blue-light" />
          
          <div className="flex items-center justify-between mb-6">
            <span className="text-[15px] font-bold text-ink">🏋️ GymFlow Dashboard</span>
            <span className="bg-blue-mid/10 text-blue-mid text-[11px] font-semibold px-2.5 py-1 rounded-full">● Live</span>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-6">
            {[
              { val: '284', label: 'Active Members' },
              { val: '₹12K', label: 'Today\'s Collection' },
              { val: '18', label: 'Expiring Soon' },
              { val: '₹46K', label: 'Total Dues' },
            ].map((stat, i) => (
              <div key={i} className="bg-blue-tint border border-blue-mid/15 rounded-xl p-3.5">
                <div className="text-[22px] font-extrabold text-blue-mid leading-none mb-1">{stat.val}</div>
                <div className="text-[11px] font-medium text-ink-muted">{stat.label}</div>
              </div>
            ))}
          </div>

          <div className="text-[12px] font-semibold text-ink-muted mb-2.5 uppercase tracking-wide">Monthly Revenue</div>
          <div className="flex items-end gap-2 h-20">
            {[45, 62, 50, 78, 58, 85, 70, 100].map((h, i) => (
              <div key={i} className="dc-bar flex-1 rounded-t-md bg-gradient-to-b from-blue-bright to-blue-dark" style={{ height: `${h}%` }} />
            ))}
          </div>

          <div className="mt-5 space-y-2">
            {[
              { init: 'KR', name: 'Karthik R.', amount: '₹1,200', paid: true },
              { init: 'PS', name: 'Priya S.', amount: '₹999', paid: false },
              { init: 'MT', name: 'Murugan T.', amount: '₹1,500', paid: true },
            ].map((m, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-blue-mid/5 last:border-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-dark to-blue-bright flex items-center justify-center text-[11px] font-bold text-white">
                    {m.init}
                  </div>
                  <span className="text-[13px] font-medium text-ink">{m.name}</span>
                </div>
                <span className={`text-[13px] font-bold flex items-center gap-1.5 ${m.paid ? 'text-blue-mid' : 'text-red-600'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${m.paid ? 'bg-green-500' : 'bg-red-500'}`} />
                  {m.amount}
                </span>
              </div>
            ))}
          </div>

          <div className="absolute -bottom-4 -right-4 bg-white border-[1.5px] border-blue-mid/15 rounded-xl p-3 shadow-xl flex items-center gap-2.5 min-w-[220px] animate-[floatNotif_4s_ease-in-out_infinite]">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-dark to-blue-bright flex items-center justify-center text-base">💬</div>
            <div className="text-xs">
              <strong className="block text-ink font-bold mb-0.5">WhatsApp Sent</strong>
              <span className="text-ink-muted">Priya S. — ₹999 due reminder</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
