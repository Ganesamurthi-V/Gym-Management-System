import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { Play, ArrowRight } from 'lucide-react';

export function Hero() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.from('.hero-badge',    { y: -16, opacity: 0, duration: 0.6 })
        .from('.hero-title',    { y: 24,  opacity: 0, duration: 0.7 }, '-=0.45')
        .from('.hero-sub',      { y: 20,  opacity: 0, duration: 0.6 }, '-=0.5')
        .from('.hero-desc',     { y: 18,  opacity: 0, duration: 0.6 }, '-=0.45')
        .from('.hero-ctas',     { y: 16,  opacity: 0, duration: 0.6 }, '-=0.45')
        .from('.hero-trust',    { y: 12,  opacity: 0, duration: 0.5 }, '-=0.35')
        .from('.hero-right',    { x: 48,  opacity: 0, duration: 0.9 }, '-=0.7')
        .from('.dc-bar',        { scaleY: 0, transformOrigin: 'bottom', opacity: 0, duration: 0.9, stagger: 0.055 }, '-=0.3');
    }, containerRef);
    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={containerRef}
      className="relative overflow-hidden pt-[140px] pb-[100px] px-6 md:px-20"
      style={{ background: 'linear-gradient(160deg, #FFFFFF 0%, #F5F8FF 50%, #EFF4FF 100%)' }}
    >
      {/* ── Decorative background ──────────────────────────────────────────── */}
      {/* Grid */}
      <div
        className="absolute inset-0 z-0 animate-[gridPulse_7s_ease-in-out_infinite]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(37,99,235,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(37,99,235,0.05) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
        }}
      />
      {/* Primary orb */}
      <div
        className="absolute -top-[220px] -right-[180px] z-0 w-[800px] h-[800px] rounded-full animate-[orbFloat_9s_ease-in-out_infinite]"
        style={{
          background: 'radial-gradient(circle, rgba(37,99,235,0.16) 0%, rgba(59,130,246,0.08) 40%, transparent 70%)',
        }}
      />
      {/* Secondary orb */}
      <div
        className="absolute -bottom-[80px] left-[20%] z-0 w-[500px] h-[500px] rounded-full animate-[orbFloat_11s_ease-in-out_infinite_reverse]"
        style={{
          background: 'radial-gradient(circle, rgba(30,58,138,0.10) 0%, transparent 70%)',
        }}
      />

      {/* ── Content grid ──────────────────────────────────────────────────── */}
      <div className="relative z-10 max-w-[1280px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-12 items-center">

        {/* Left */}
        <div className="max-w-[580px]">
          {/* Badge */}
          <div className="hero-badge inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-8" style={{
            background: 'rgba(37,99,235,0.07)',
            border: '1px solid rgba(37,99,235,0.2)',
          }}>
            <span className="w-[7px] h-[7px] rounded-full bg-blue-500 animate-[dotBlink_2s_ease-in-out_infinite]" />
            <span className="text-[11.5px] font-semibold text-blue-700 tracking-wide">
              Built for Tamil Nadu &amp; Puducherry gyms
            </span>
          </div>

          {/* H1 */}
          <h1 className="hero-title font-black tracking-tight text-slate-900 mb-5 leading-[1.06]"
            style={{ fontSize: 'clamp(46px, 6vw, 72px)' }}>
            Know Who Paid.<br />
            Who Didn't.<br />
            <span style={{
              background: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 50%, #3B82F6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              Who's Expiring.
            </span>
          </h1>

          {/* Subtitle */}
          <p className="hero-sub text-xl md:text-[22px] font-bold text-blue-700 mb-5">
            — without the notebooks.
          </p>

          {/* Desc */}
          <p className="hero-desc text-[16px] font-normal leading-[1.75] max-w-[520px] mb-10" style={{ color: '#475569' }}>
            GymFlow is the all-in-one gym management platform for independent gym owners.
            Members, payments, attendance, dues, and WhatsApp reminders — in one place.
          </p>

          {/* CTAs */}
          <div className="hero-ctas flex flex-wrap items-center gap-4 mb-8">
            <a
              href="https://app.gymflow.sbs"
              className="inline-flex items-center gap-2 text-white rounded-xl py-3.5 px-7 text-[15px] font-semibold transition-all duration-200"
              style={{
                background: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 55%, #3B82F6 100%)',
                boxShadow: '0 6px 20px rgba(30,58,138,0.42), 0 2px 6px rgba(30,58,138,0.2), inset 0 1px 0 rgba(255,255,255,0.15)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-2px)';
                (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 12px 32px rgba(30,58,138,0.5), 0 4px 12px rgba(30,58,138,0.25), inset 0 1px 0 rgba(255,255,255,0.15)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)';
                (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 6px 20px rgba(30,58,138,0.42), 0 2px 6px rgba(30,58,138,0.2), inset 0 1px 0 rgba(255,255,255,0.15)';
              }}
            >
              Start Free Trial
              <ArrowRight className="w-4 h-4" />
            </a>
            <a
              href="#demo"
              className="inline-flex items-center gap-2.5 rounded-xl py-[13px] px-5 text-[15px] font-semibold text-slate-600 transition-all duration-200 group"
              style={{
                border: '1.5px solid rgba(37,99,235,0.18)',
                background: 'rgba(255,255,255,0.8)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(37,99,235,0.45)';
                (e.currentTarget as HTMLAnchorElement).style.color = '#1E3A8A';
                (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(37,99,235,0.18)';
                (e.currentTarget as HTMLAnchorElement).style.color = '#475569';
                (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)';
              }}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #1E3A8A, #3B82F6)' }}
              >
                <Play className="w-3 h-3 text-white ml-0.5" fill="currentColor" />
              </div>
              Watch Demo
            </a>
          </div>

          {/* Trust line */}
          <div className="hero-trust flex items-center gap-2 text-[13px] text-slate-400">
            <span className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <svg key={i} className="w-3.5 h-3.5 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              ))}
            </span>
            <span>No credit card · 14-day free trial · 500+ gym owners</span>
          </div>
        </div>

        {/* Right — Dashboard mockup */}
        <div className="hero-right relative">
          {/* Dashboard card */}
          <div
            className="relative rounded-[24px] overflow-hidden"
            style={{
              background: '#FFFFFF',
              border: '1px solid rgba(37,99,235,0.12)',
              boxShadow: '0 2px 4px rgba(0,0,0,0.04), 0 20px 60px rgba(15,23,42,0.12), 0 8px 24px rgba(37,99,235,0.08)',
            }}
          >
            {/* Top accent stripe */}
            <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #1E3A8A, #2563EB, #3B82F6, #60A5FA)' }} />

            {/* Card header */}
            <div className="flex items-center justify-between px-7 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(37,99,235,0.07)' }}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #1E3A8A, #3B82F6)' }}>
                  <span className="text-sm">🏋️</span>
                </div>
                <span className="text-[15px] font-bold text-slate-900">GymFlow Dashboard</span>
              </div>
              <div
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold"
                style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.2)' }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Live
              </div>
            </div>

            <div className="p-6">
              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                {[
                  { val: '284', label: 'Active Members',      color: '#2563EB', bg: 'rgba(37,99,235,0.07)', icon: '👥' },
                  { val: '₹12K', label: "Today's Collection", color: '#16a34a', bg: 'rgba(34,197,94,0.07)', icon: '💰' },
                  { val: '18',  label: 'Expiring Soon',       color: '#d97706', bg: 'rgba(245,158,11,0.08)', icon: '⚠️' },
                  { val: '₹46K', label: 'Total Dues',         color: '#dc2626', bg: 'rgba(220,38,38,0.07)', icon: '📋' },
                ].map((stat, i) => (
                  <div
                    key={i}
                    className="rounded-[14px] p-3.5"
                    style={{ background: stat.bg, border: `1px solid ${stat.color}20` }}
                  >
                    <div className="text-base mb-1">{stat.icon}</div>
                    <div className="text-[22px] font-extrabold leading-none mb-1" style={{ color: stat.color }}>{stat.val}</div>
                    <div className="text-[11px] font-medium text-slate-500">{stat.label}</div>
                  </div>
                ))}
              </div>

              {/* Chart */}
              <div className="mb-5">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.1em] mb-3">Monthly Revenue</div>
                <div className="flex items-end gap-1.5 h-[72px]">
                  {[42, 58, 48, 72, 55, 80, 68, 100].map((h, i) => (
                    <div
                      key={i}
                      className="dc-bar flex-1 rounded-t-[5px]"
                      style={{
                        height: `${h}%`,
                        background: i === 7
                          ? 'linear-gradient(180deg, #3B82F6, #1E3A8A)'
                          : `linear-gradient(180deg, rgba(59,130,246,${0.3 + h / 200}), rgba(30,58,138,${0.25 + h / 200}))`,
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Member list */}
              <div className="space-y-1.5">
                {[
                  { init: 'KR', name: 'Karthik R.', amount: '₹1,200', paid: true },
                  { init: 'PS', name: 'Priya S.', amount: '₹999', paid: false },
                  { init: 'MT', name: 'Murugan T.', amount: '₹1,500', paid: true },
                ].map((m, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-2 px-2 rounded-xl transition-colors hover:bg-slate-50"
                    style={{ borderBottom: i < 2 ? '1px solid rgba(37,99,235,0.05)' : 'none' }}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                        style={{ background: 'linear-gradient(135deg, #1E3A8A, #3B82F6)' }}
                      >
                        {m.init}
                      </div>
                      <span className="text-[13px] font-medium text-slate-700">{m.name}</span>
                    </div>
                    <span className={`text-[12px] font-bold flex items-center gap-1.5 ${m.paid ? 'text-blue-600' : 'text-red-500'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${m.paid ? 'bg-green-500' : 'bg-red-500'}`} />
                      {m.amount}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Floating WhatsApp notification */}
          <div
            className="absolute -bottom-5 -left-6 rounded-2xl px-4 py-3 flex items-center gap-3 min-w-[230px] animate-[floatNotif_4s_ease-in-out_infinite]"
            style={{
              background: 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(37,99,235,0.12)',
              boxShadow: '0 8px 32px rgba(15,23,42,0.12), 0 2px 8px rgba(15,23,42,0.06)',
            }}
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0"
              style={{ background: 'linear-gradient(135deg, #1E3A8A, #3B82F6)' }}
            >💬</div>
            <div className="text-xs">
              <strong className="block text-slate-900 font-bold mb-0.5">WhatsApp Sent</strong>
              <span className="text-slate-500">Priya S. — ₹999 due reminder</span>
            </div>
          </div>

          {/* Floating renewal card */}
          <div
            className="absolute -top-4 -right-4 rounded-2xl px-4 py-3 flex items-center gap-2.5 min-w-[190px] animate-[floatCard_5s_ease-in-out_infinite]"
            style={{
              background: 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(34,197,94,0.2)',
              boxShadow: '0 8px 28px rgba(15,23,42,0.10), 0 2px 6px rgba(15,23,42,0.05)',
            }}
          >
            <div className="w-8 h-8 rounded-xl bg-green-50 border border-green-100 flex items-center justify-center text-sm shrink-0">🔄</div>
            <div className="text-xs">
              <strong className="block text-slate-900 font-bold mb-0.5">12 Renewals Today</strong>
              <span className="text-green-600 font-medium">+₹18,000 collected</span>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
