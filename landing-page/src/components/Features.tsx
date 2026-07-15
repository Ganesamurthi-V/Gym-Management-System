// @ts-nocheck
import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { LayoutDashboard, Users, CreditCard, CheckCircle2, Map, FileUp } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const FEATURES = [
  {
    icon: LayoutDashboard,
    title: 'Dashboard & Live Stats',
    desc: 'Active members, today\'s collection, expiring soon, total dues.',
    iconColor: '#2563EB',
    iconBg: 'rgba(37,99,235,0.10)',
    glowColor: 'rgba(37,99,235,0.15)',
    accentColor: '#2563EB',
  },
  {
    icon: Users,
    title: 'Member Management',
    desc: 'Add, edit, search, and organize member details with fast and simple tools.',
    iconColor: '#059669',
    iconBg: 'rgba(5,150,105,0.10)',
    glowColor: 'rgba(5,150,105,0.12)',
    accentColor: '#059669',
  },
  {
    icon: CreditCard,
    title: 'Payments & Dues',
    desc: 'Record cash, UPI, or card payments, view pending dues, and send WhatsApp payment reminders instantly.',
    iconColor: '#d97706',
    iconBg: 'rgba(217,119,6,0.10)',
    glowColor: 'rgba(217,119,6,0.12)',
    accentColor: '#d97706',
  },
  {
    icon: CheckCircle2,
    title: 'One-Tap Attendance',
    desc: 'Record daily attendance with a single tap and view attendance history anytime.',
    iconColor: '#7c3aed',
    iconBg: 'rgba(124,58,237,0.10)',
    glowColor: 'rgba(124,58,237,0.12)',
    accentColor: '#7c3aed',
  },
  {
    icon: Map,
    title: 'Smart Area Detection',
    desc: 'Quickly find and select member areas with automatic suggestions and accurate matching.',
    iconColor: '#e11d48',
    iconBg: 'rgba(225,29,72,0.10)',
    glowColor: 'rgba(225,29,72,0.12)',
    accentColor: '#e11d48',
  },
  {
    icon: FileUp,
    title: 'Bulk CSV/Excel Import',
    desc: 'Upload your Excel or CSV file and GymFlow automatically maps and imports your members.',
    iconColor: '#0891b2',
    iconBg: 'rgba(8,145,178,0.10)',
    glowColor: 'rgba(8,145,178,0.12)',
    accentColor: '#0891b2',
  },
];

export function Features() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo('.feat-reveal',
        { y: 32, opacity: 0 },
        {
          y: 0, opacity: 1, duration: 0.65, stagger: 0.09, ease: 'power3.out',
          scrollTrigger: { trigger: containerRef.current, start: 'top 82%' },
        }
      );
    }, containerRef);
    return () => ctx.revert();
  }, []);

  return (
    <section
      id="features"
      ref={containerRef}
      className="relative overflow-hidden py-[130px] px-6 md:px-12"
      style={{ background: '#F5F8FF' }}
    >
      {/* Background radial blob */}
      <div
        className="absolute top-0 right-0 w-[700px] h-[700px] z-0 pointer-events-none"
        style={{ background: 'radial-gradient(circle at 70% 30%, rgba(37,99,235,0.07) 0%, transparent 65%)' }}
      />
      <div
        className="absolute bottom-0 left-0 w-[500px] h-[500px] z-0 pointer-events-none"
        style={{ background: 'radial-gradient(circle at 30% 70%, rgba(37,99,235,0.06) 0%, transparent 65%)' }}
      />

      <div className="max-w-[1250px] mx-auto relative z-10">
        {/* Section header — asymmetric */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-16 gap-8">
          <div className="max-w-[620px]">
            <span className="feat-reveal section-badge mb-5">Core Modules</span>
            <h2
              className="feat-reveal font-black text-slate-900 tracking-tight leading-[1.08] mt-4"
              style={{ fontSize: 'clamp(36px, 4.5vw, 56px)' }}
            >
              Everything your gym needs,<br />
              <span style={{
                background: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 50%, #3B82F6 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>
                nothing it doesn't.
              </span>
            </h2>
          </div>
          <p className="feat-reveal text-[15px] leading-relaxed max-w-[340px] lg:text-right" style={{ color: '#64748B' }}>
            Built specifically for the workflows of independent gyms in Tamil Nadu and Puducherry.
          </p>
        </div>

        {/* Card grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((feat, i) => {
            const Icon = feat.icon as any;
            return (
            <div
              key={i}
              className="feat-reveal group relative rounded-[20px] p-8 cursor-default transition-all duration-300"
              style={{
                background: '#FFFFFF',
                border: '1px solid rgba(37,99,235,0.08)',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.05)',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = 'translateY(-4px)';
                el.style.boxShadow = `0 2px 4px rgba(0,0,0,0.04), 0 16px 40px rgba(0,0,0,0.09), 0 0 0 1px ${feat.glowColor}, 0 0 32px ${feat.glowColor}`;
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = 'translateY(0)';
                el.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.05)';
              }}
            >
              {/* Accent line — left side */}
              <div
                className="absolute left-0 top-6 bottom-6 w-[3px] rounded-r-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{ background: feat.accentColor }}
              />

              {/* Icon */}
              <div
                className="w-12 h-12 rounded-[14px] flex items-center justify-center mb-6 transition-all duration-400 group-hover:scale-110 group-hover:-rotate-3"
                style={{ background: feat.iconBg, border: `1px solid ${feat.iconColor}25` }}
              >
                <Icon className="w-5 h-5" style={{ color: feat.iconColor }} strokeWidth={2} />
              </div>

              <h3 className="text-[17px] font-bold text-slate-900 mb-3 leading-snug">{feat.title}</h3>
              <p className="text-[14px] leading-[1.7]" style={{ color: '#64748B' }}>{feat.desc}</p>
            </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
