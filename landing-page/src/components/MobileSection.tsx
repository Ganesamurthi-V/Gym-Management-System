// @ts-nocheck
import { 
  Smartphone, ArrowRight, Clock, ChevronDown, 
  Users, Check, AlertTriangle, Menu, LayoutGrid, Banknote,
  Globe, RefreshCw, Shield, Zap
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function MobileSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo('.reveal-mobile',
        { y: 32, opacity: 0 },
        {
          y: 0, opacity: 1, duration: 0.8, stagger: 0.1, ease: 'power3.out',
          scrollTrigger: { trigger: containerRef.current, start: 'top 75%' },
        }
      );

      const phoneEl = phoneRef.current;
      if (phoneEl) {
        gsap.set(phoneEl, { transformPerspective: 1400 });
        
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: phoneEl,
            start: 'top 90%',
            end: 'bottom 10%',
            scrub: 1.5,
          }
        });

        tl.fromTo(phoneEl,
          { rotationY: -55, rotationX: 0, rotationZ: 0, scale: 0.85 },
          { rotationY: 0, scale: 1, ease: 'power1.out' }
        )
        .to(phoneEl, {
          rotationY: 55, 
          scale: 0.85, 
          ease: 'power1.in'
        });
      }
    }, containerRef);
    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={containerRef}
      className="relative overflow-hidden py-[120px] px-6 md:px-10"
      style={{ background: 'linear-gradient(135deg, #060D1A 0%, #0A1628 40%, #0F1F3D 70%, #0D1A35 100%)' }}
    >
      {/* Decorative orbs */}
      <div
        className="absolute -top-[100px] right-[15%] w-[500px] h-[500px] rounded-full z-0 pointer-events-none animate-[orbFloat_10s_ease-in-out_infinite]"
        style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.18) 0%, transparent 70%)' }}
      />
      <div
        className="absolute -bottom-[100px] left-[10%] w-[400px] h-[400px] rounded-full z-0 pointer-events-none animate-[orbFloat_13s_ease-in-out_infinite_reverse]"
        style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 70%)' }}
      />
      {/* Grid overlay */}
      <div
        className="absolute inset-0 z-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="max-w-[1250px] mx-auto relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-8 items-center">

        {/* Left Text Content */}
        <div className="max-w-[560px]">
          {/* Badge */}
          <div
            className="reveal-mobile inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-8"
            style={{
              background: 'rgba(59,130,246,0.12)',
              border: '1px solid rgba(59,130,246,0.25)',
            }}
          >
            <Smartphone className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[11px] font-bold tracking-widest uppercase text-blue-400">Mobile Access</span>
          </div>

          <h2
            className="reveal-mobile font-black text-white tracking-tight leading-[1.08] mb-5"
            style={{ fontSize: 'clamp(36px, 4.5vw, 56px)', fontFamily: 'Sora, sans-serif' }}
          >
            Your business,<br />
            always{' '}
            <span style={{
              background: 'linear-gradient(135deg, #60A5FA 0%, #93C5FD 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>within reach.</span>
          </h2>

          {/* Accent line */}
          <div
            className="reveal-mobile w-12 h-[3px] rounded-full mb-7"
            style={{ background: 'linear-gradient(90deg, #3B82F6, #60A5FA)' }}
          />

          <p className="reveal-mobile text-[16px] leading-relaxed mb-10" style={{ color: 'rgba(255,255,255,0.6)' }}>
            Spend less time at the desk. Manage memberships, payments,
            and daily operations from anywhere using any device with
            an internet connection.
          </p>

          {/* Feature Grid 2x2 */}
          <div className="reveal-mobile grid grid-cols-2 gap-4 mb-8">
            {[
              { icon: Globe,     color: '#60A5FA', bg: 'rgba(59,130,246,0.12)',  title: 'Works Everywhere',     desc: 'Access your gym from any device with a browser.' },
              { icon: RefreshCw, color: '#34D399', bg: 'rgba(52,211,153,0.10)',  title: 'Real-time Updates',    desc: 'Instant sync across all your devices.' },
              { icon: Shield,    color: '#A78BFA', bg: 'rgba(167,139,250,0.10)', title: 'Secure & Reliable',    desc: 'Enterprise-grade security keeps your data safe.' },
              { icon: Zap,       color: '#FCD34D', bg: 'rgba(252,211,77,0.10)',  title: 'Always Accessible',    desc: 'Manage your gym anytime, anywhere.' },
            ].map((f, i) => {
              const Icon = f.icon as any;
              return (
              <div
                key={i}
                className="flex items-start gap-3 rounded-[14px] p-4 transition-all duration-250"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)';
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.12)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)';
                }}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: f.bg }}
                >
                  <Icon className="w-4 h-4" style={{ color: f.color }} />
                </div>
                <div>
                  <div className="text-[13px] font-bold text-white mb-1">{f.title}</div>
                  <div className="text-[12px] leading-snug" style={{ color: 'rgba(255,255,255,0.5)' }}>{f.desc}</div>
                </div>
              </div>
              );
            })}
          </div>

          {/* No install banner */}
          <div
            className="reveal-mobile flex items-start gap-3 rounded-xl px-5 py-4 mb-6"
            style={{
              background: 'rgba(37,99,235,0.12)',
              border: '1px solid rgba(59,130,246,0.22)',
            }}
          >
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5"
              style={{ background: '#2563EB' }}
            >
              <Check className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="text-[14px] font-bold text-blue-300">No app install required. Works in any browser.</p>
              <p className="text-[13px] mt-0.5" style={{ color: 'rgba(147,197,253,0.7)' }}>Just log in and you're ready to go.</p>
            </div>
          </div>

          <div className="reveal-mobile flex items-start gap-3 text-[14px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
            <ArrowRight className="w-4 h-4 text-blue-400 mt-1 shrink-0" />
            <p>
              Most gym software is <strong className="text-white font-bold">desktop-only</strong>. GymFlow was designed mobile-first from day one. The same full power, in the palm of your hand.
            </p>
          </div>
        </div>

        {/* Right Mobile Mockup */}
        <div
          className="reveal-mobile relative w-full h-[700px] flex items-center justify-center lg:justify-end lg:pr-10"
          style={{ perspective: '1400px' }}
        >
          {/* Phone outer glow */}
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ filter: 'blur(48px)' }}
          >
            <div
              className="w-[260px] h-[500px] rounded-[40px]"
              style={{ background: 'radial-gradient(ellipse, rgba(59,130,246,0.35) 0%, transparent 70%)' }}
            />
          </div>

          <div
            ref={phoneRef}
            className="relative z-10"
            style={{
              transformStyle: 'preserve-3d',
              willChange: 'transform',
            }}
          >
            {/* 3D depth layer */}
            <div
              className="absolute inset-0 rounded-[2.5rem]"
              style={{
                background: 'linear-gradient(135deg, #1E293B, #0F172A)',
                boxShadow: '30px 40px 70px -10px rgba(0,0,0,0.7)',
                transform: 'translateZ(-14px) translateX(10px) translateY(10px)',
              }}
            />

            {/* Hardware buttons */}
            <div className="absolute right-[-4px] top-[120px] w-3 h-10 rounded-r-md" style={{ background: '#1E293B', transform: 'translateZ(-6px)' }} />
            <div className="absolute right-[-4px] top-[180px] w-3 h-16 rounded-r-md" style={{ background: '#1E293B', transform: 'translateZ(-6px)' }} />

            {/* Phone body */}
            <div
              className="relative w-[280px] sm:w-[320px] h-[620px] rounded-[2.5rem] overflow-hidden"
              style={{
                background: '#F8FAFC',
                border: '10px solid #0F172A',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.08)',
              }}
            >
              {/* Notch */}
              <div className="absolute top-0 inset-x-0 h-4 bg-slate-900 rounded-b-xl w-28 mx-auto z-20" />

              {/* Screen */}
              <div className="h-full overflow-hidden pb-[54px] bg-slate-50">

                {/* Header */}
                <div className="bg-white px-3 py-2 border-b border-slate-100 flex items-center justify-between sticky top-0 z-10 pt-6">
                  <div className="flex items-center gap-2">
                    <img src="/logo_only.png" loading="lazy" decoding="async" className="w-5 h-5 object-contain" alt="Logo" />
                  </div>
                  <span className="font-black text-blue-700 text-[12px] tracking-wider uppercase">FITZONE GYM</span>
                  <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-[10px] font-bold">FG</div>
                </div>

                {/* Subheader */}
                <div className="px-4 py-2.5">
                  <div className="flex items-center gap-2 text-slate-500 mb-0.5">
                    <img src="/logo_only.png" loading="lazy" decoding="async" className="w-3 h-3 grayscale opacity-60" alt="" />
                    <span className="text-[10px] font-medium">Fitzone Gym</span>
                  </div>
                  <h3 className="text-[18px] font-black text-slate-900">Dashboard</h3>
                </div>

                {/* Stats Grid */}
                <div className="px-4 grid grid-cols-2 gap-2 mb-3">
                  {[
                    { val: '43',     label: 'Active',          icon: Users,         bgClass: 'bg-emerald-50 text-emerald-500' },
                    { val: '0',      label: 'Attendance',      icon: Check,         bgClass: 'bg-blue-50 text-blue-500' },
                    { val: '3',      label: 'Expiring',        icon: Clock,         bgClass: 'bg-amber-50 text-amber-500' },
                    { val: '40',     label: 'Expired',         icon: AlertTriangle, bgClass: 'bg-rose-50 text-rose-500' },
                    { val: '₹0',     label: "Today's Collect", icon: Banknote,      bgClass: 'bg-cyan-50 text-cyan-500' },
                    { val: '₹8,000', label: 'Total Dues',      icon: AlertTriangle, bgClass: 'bg-rose-50 text-rose-500', valColor: 'text-rose-600' },
                  ].map((stat, i) => {
                    const StatIcon = stat.icon as any;
                    return (
                    <div key={i} className="bg-white border border-slate-100 rounded-xl p-2.5 shadow-sm flex flex-col justify-between h-[72px]">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center ${stat.bgClass}`}>
                        <StatIcon className="w-2.5 h-2.5" />
                      </div>
                      <div>
                        <div className={`text-[18px] font-black leading-none ${stat.valColor || 'text-slate-900'}`}>{stat.val}</div>
                        <div className="text-[9px] text-slate-500 font-medium mt-1">{stat.label}</div>
                      </div>
                    </div>
                    );
                  })}
                </div>

                {/* Expiring List */}
                <div className="px-4 mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-amber-500" />
                      <span className="font-bold text-slate-900 text-[12px]">Expiring This Week</span>
                      <ChevronDown className="w-3 h-3 text-slate-400" />
                    </div>
                    <button className="text-blue-600 font-bold text-[11px]">See all</button>
                  </div>

                  <div className="space-y-2">
                    {[
                      { init: 'VD', name: 'Vignesh Das',  phone: '919384886895', left: '1d left' },
                      { init: 'NV', name: 'Naveen Verma', phone: '919384886895', left: '4d left' },
                      { init: 'DN', name: 'Deepa Nair',   phone: '919384886895', left: '7d left' },
                    ].map((m, i) => (
                      <div key={i} className="bg-white border border-slate-100 rounded-lg p-2 flex items-center justify-between shadow-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-[10px] font-bold shrink-0">
                            {m.init}
                          </div>
                          <div>
                            <div className="text-[12px] font-bold text-slate-900 leading-tight">{m.name}</div>
                            <div className="text-[9px] text-slate-400 font-medium mt-0.5">{m.phone}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-amber-500">{m.left}</span>
                          <button className="w-6 h-6 rounded-md bg-emerald-500 text-white flex items-center justify-center shadow-sm hover:bg-emerald-600 transition-colors">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984a9.964 9.964 0 001.333 4.993L2 22l5.233-1.337a10.024 10.024 0 004.779 1.204c5.505 0 9.988-4.477 9.989-9.985 0-5.506-4.484-9.982-9.989-9.982zm.01 17.962c-1.636 0-3.235-.436-4.636-1.26l-.333-.197-3.447.88.922-3.355-.216-.343A8.136 8.136 0 013.824 11.98c0-4.512 3.676-8.183 8.199-8.183 4.514 0 8.188 3.676 8.189 8.188 0 4.51-3.675 8.18-8.19 8.18zm4.498-6.145c-.247-.123-1.46-.721-1.688-.804-.226-.082-.393-.123-.557.123-.166.246-.638.804-.783.968-.145.164-.291.185-.538.062-1.23-.623-2.314-1.296-3.197-2.736-.094-.152-.008-.247.114-.37.108-.109.245-.286.368-.43.123-.143.164-.245.247-.41.082-.164.041-.307-.02-.43-.062-.123-.558-1.344-.764-1.84-.201-.484-.406-.418-.557-.426h-.474c-.164 0-.431.061-.657.307-.226.246-.863.841-.863 2.051 0 1.21.884 2.378 1.007 2.542.123.164 1.733 2.645 4.195 3.712.585.253 1.042.404 1.398.517.587.186 1.121.16 1.543.097.472-.071 1.46-.595 1.666-1.17.205-.574.205-1.066.144-1.17-.061-.103-.226-.164-.473-.287z"/></svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bottom Nav */}
              <div className="absolute bottom-0 inset-x-0 h-[54px] bg-white border-t border-slate-100 flex items-center justify-between px-5 z-20">
                <div className="flex items-center gap-2 text-slate-900">
                  <LayoutGrid className="w-4 h-4 text-blue-600" />
                  <span className="font-bold text-[13px]">Dashboard</span>
                </div>
                <button className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-500">
                  <Menu className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
