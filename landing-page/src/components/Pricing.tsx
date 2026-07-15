// @ts-nocheck
import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Check, Shield, Zap, CreditCard, Clock, User } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const features = [
  'Member Management',
  'Payments & Dues',
  'Attendance Tracking',
  'AI Geo Intelligence',
  'Reports & Analytics',
  'WhatsApp Reminders',
  'CSV/Excel Import & Export',
  'Priority Support',
];

const steps = [
  {
    icon: User,
    title: '1. Make Payment',
    desc: 'Pay ₹3,000 using any UPI app, net banking, or card.',
  },
  {
    icon: CreditCard,
    title: '2. Upload Screenshot',
    desc: 'Go to the Payments page and upload your payment screenshot.',
  },
  {
    icon: Clock,
    title: '3. Get Activated',
    desc: "We'll verify your payment and activate your account shortly.",
  },
];

export function Pricing() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.price-reveal',
        { y: 28, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.6,
          stagger: 0.1,
          ease: 'power3.out',
          scrollTrigger: { trigger: containerRef.current, start: 'top 80%' },
        }
      );
    }, containerRef);
    return () => ctx.revert();
  }, []);

  return (
    <section
      id="pricing"
      ref={containerRef}
      className="relative overflow-hidden py-[60px] lg:py-[80px] px-6 md:px-16 lg:px-24 min-h-screen flex items-center"
      style={{ background: 'linear-gradient(155deg, #FFFFFF 0%, #F0F5FF 55%, #E8F0FF 100%)' }}
    >
      {/* Background radial glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px] z-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(37,99,235,0.07) 0%, transparent 70%)' }}
      />

      <div className="max-w-[1280px] mx-auto w-full relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-8 items-center">

        {/* ── Column 1: Left content ────────────────────────────────────── */}
        <div className="price-reveal flex flex-col lg:pr-4">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200 mb-6 w-fit">
            <Zap className="w-3.5 h-3.5 text-blue-600" fill="currentColor" />
            <span className="text-[12px] font-bold text-blue-700 tracking-wide">Simple Pricing. All Features. No Limits.</span>
          </div>

          {/* Heading */}
          <h2
            className="font-black text-slate-900 tracking-tight leading-[1.1] mb-4"
            style={{ fontSize: 'clamp(32px, 3.5vw, 48px)', fontFamily: 'Sora, sans-serif' }}
          >
            One Plan.<br />
            Everything You Need.<br />
            <span style={{
              background: 'linear-gradient(135deg, #1E40AF 0%, #2563EB 50%, #3B82F6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              Just ₹3,000 / month
            </span>
          </h2>

          <p className="text-slate-500 text-[14.5px] leading-relaxed mb-6">
            All features. Unlimited members. Powerful automation.<br />
            Built for independent gyms in Tamil Nadu &amp; Puducherry.
          </p>

          {/* Feature list */}
          <ul className="space-y-2.5 mb-8">
            {features.map((feat, i) => (
              <li key={i} className="flex items-center gap-3">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.18)' }}
                >
                  <Check className="w-3 h-3 text-blue-600" strokeWidth={3} />
                </div>
                <span className="text-slate-600 text-[14.5px]">{feat}</span>
              </li>
            ))}
          </ul>


        </div>

        {/* ── Column 2: Pricing card ────────────────────────────────────── */}
        <div className="price-reveal flex flex-col">
          <div
            className="rounded-[24px] overflow-hidden shadow-[0_24px_80px_rgba(37,99,235,0.16),0_8px_32px_rgba(37,99,235,0.10)]"
            style={{ border: '1px solid rgba(37,99,235,0.14)' }}
          >
            {/* Card header banner */}
            <div
              className="py-3 px-6 text-center text-[11px] font-bold uppercase tracking-[2px] text-white"
              style={{ background: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%)' }}
            >
              One Plan. All Features.
            </div>

            <div className="p-8 bg-white">
              {/* Plan name */}
              <p
                className="text-[16px] font-bold text-center mb-2"
                style={{
                  background: 'linear-gradient(135deg, #2563EB, #3B82F6)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                GymFlow Pro
              </p>

              {/* Price */}
              <div className="text-center mb-2">
                <span
                  className="font-black text-slate-900 leading-none"
                  style={{ fontSize: 'clamp(52px, 7vw, 76px)', fontFamily: 'Sora, sans-serif' }}
                >
                  ₹3,000
                </span>
              </div>
              <p className="text-slate-400 text-[14px] text-center mb-6">per month</p>

              {/* Badge */}
              <div
                className="flex items-center justify-center gap-1.5 py-2 px-4 rounded-full mx-auto w-fit mb-8 text-[13px] font-semibold"
                style={{
                  background: 'rgba(37,99,235,0.07)',
                  border: '1px solid rgba(37,99,235,0.15)',
                  color: '#2563EB',
                }}
              >
                <Check className="w-3.5 h-3.5" strokeWidth={3} />
                All Features Included
              </div>

              <div className="h-px mb-8" style={{ background: 'rgba(37,99,235,0.08)' }} />

              {/* Payment options */}
              <div className="space-y-3">
                {/* UPI Pay button */}
                <a
                  href="https://app.gymflow.sbs"
                  className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-white text-[14.5px] font-semibold transition-all duration-200"
                  style={{
                    background: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%)',
                    boxShadow: '0 6px 20px rgba(37,99,235,0.35)',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                    (e.currentTarget as HTMLElement).style.boxShadow = '0 12px 32px rgba(37,99,235,0.45)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                    (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 20px rgba(37,99,235,0.35)';
                  }}
                >
                  Pay ₹3,000 &amp; Get Started
                </a>

                {/* Alt pay option */}
                <div
                  className="flex items-center gap-3 p-4 rounded-xl cursor-pointer transition-all duration-200"
                  style={{ background: '#F8FAFF', border: '1px solid rgba(37,99,235,0.12)' }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(37,99,235,0.3)';
                    (e.currentTarget as HTMLElement).style.background = '#F0F5FF';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(37,99,235,0.12)';
                    (e.currentTarget as HTMLElement).style.background = '#F8FAFF';
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(37,99,235,0.08)' }}
                  >
                    <CreditCard className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-slate-700 text-[13px] font-semibold">Don't have UPI?</p>
                    <p className="text-slate-400 text-[12px]">Pay from any app and upload screenshot.</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 mt-6 text-slate-400 text-[12px]">
                <Shield className="w-3.5 h-3.5" />
                Secure. Fast. Verified.
              </div>
            </div>
          </div>
        </div>

        {/* ── Column 3: Activation steps ───────────────────────────────── */}
        <div className="price-reveal flex flex-col lg:pl-4">
          <div
            className="rounded-[24px] p-8 h-full"
            style={{
              background: '#FFFFFF',
              border: '1px solid rgba(37,99,235,0.10)',
              boxShadow: '0 4px 24px rgba(37,99,235,0.06)',
            }}
          >
            <h3 className="text-[20px] font-black text-slate-900 mb-8" style={{ fontFamily: 'Sora, sans-serif' }}>
              Simple 3-Step Activation
            </h3>

            <div className="space-y-7">
              {steps.map((step, i) => (
                <div key={i} className="flex items-start gap-4">
                  <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.12)' }}
                  >
                    <step.icon className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-[14.5px] font-bold text-slate-800 mb-1">{step.title}</p>
                    <p className="text-[13px] text-slate-500 leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="h-px my-8" style={{ background: 'rgba(37,99,235,0.08)' }} />

            {/* Activation note */}
            <div className="flex items-start gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(234,179,8,0.10)', border: '1px solid rgba(234,179,8,0.2)' }}
              >
                <Zap className="w-4 h-4 text-yellow-500" fill="currentColor" />
              </div>
              <p className="text-[13px] text-slate-500 leading-relaxed">
                Activation usually takes less than{' '}
                <strong className="text-slate-700">10 minutes</strong> during working hours.
              </p>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
