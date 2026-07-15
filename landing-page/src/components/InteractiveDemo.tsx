import { useState, useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { 
  LayoutDashboard, Users, List, AlertCircle, CalendarCheck, Package, 
  Activity, TrendingUp, ChevronLeft, Search, Filter, Download, Upload, 
  Edit3, Plus, MessageCircle, Clock, ChevronDown, Check, Sun, Moon,
  Banknote, Smartphone, MousePointer2
} from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const SIDEBAR_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'members', label: 'Members', icon: Users },
  { id: 'payments', label: 'Payments', icon: List },
  { id: 'dues', label: 'Dues', icon: AlertCircle },
  { id: 'attendance', label: 'Attendance', icon: CalendarCheck },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'programs', label: 'Programs', icon: Activity, soon: true },
  { id: 'reports', label: 'Reports', icon: TrendingUp, soon: true },
];

export function InteractiveDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const mainAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo('.reveal-demo', 
        { y: 30, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.8,
          stagger: 0.1,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: containerRef.current,
            start: 'top 75%',
          }
        }
      );
    }, containerRef);
    return () => ctx.revert();
  }, []);

  // Minimal entrance animation when tab changes
  useEffect(() => {
    if (mainAreaRef.current) {
      gsap.fromTo(
        mainAreaRef.current.children,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.4, stagger: 0.05, ease: 'power2.out' }
      );
    }
  }, [activeTab]);

  return (
    <section
      id="demo"
      ref={containerRef}
      className="relative overflow-hidden py-[130px] px-6 md:px-10"
      style={{ background: '#F5F8FF' }}
    >
      {/* Background radial */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] z-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(37,99,235,0.08) 0%, transparent 70%)' }}
      />
      <div className="text-center mb-16 relative z-10 flex flex-col items-center">
        <span className="reveal-demo section-badge mb-5">Live Preview</span>
        <h2
          className="reveal-demo font-black text-slate-900 tracking-tight leading-[1.08] mt-5 mb-6"
          style={{ fontSize: 'clamp(36px, 4.5vw, 58px)' }}
        >
          Don't just read about it.<br />
          <span style={{
            background: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 50%, #3B82F6 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>Try the real UI.</span>
        </h2>
        <p className="reveal-demo text-[17px] leading-relaxed max-w-[560px] mx-auto mb-8" style={{ color: '#64748B' }}>
          This is exactly what your dashboard will look like from day one.
        </p>
        <div
          className="reveal-demo inline-flex items-center gap-2.5 rounded-full px-5 py-2.5 text-[13px] font-semibold"
          style={{
            background: 'rgba(37,99,235,0.06)',
            border: '1px solid rgba(37,99,235,0.15)',
            color: '#2563EB',
          }}
        >
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-[dotBlink_2s_ease-in-out_infinite]" />
          <MousePointer2 className="w-4 h-4" />
          Interactive — click the sidebar tabs to explore every page
        </div>
      </div>

      <div
        className="reveal-demo max-w-[1250px] mx-auto relative z-10"
        style={{ filter: 'drop-shadow(0 24px 48px rgba(15,23,42,0.12)) drop-shadow(0 8px 16px rgba(37,99,235,0.08))' }}
      >
        {/* Browser Chrome */}
        <div
          className="rounded-t-xl px-4 py-3 flex items-center relative z-20"
          style={{
            background: 'linear-gradient(180deg, #E8EDF5 0%, #DDE3EF 100%)',
            border: '1px solid rgba(37,99,235,0.12)',
            borderBottom: 'none',
          }}
        >
          <div className="flex items-center gap-2">
            <div className="w-[13px] h-[13px] rounded-full" style={{ background: '#FF5F57', border: '1px solid #E0443E' }} />
            <div className="w-[13px] h-[13px] rounded-full" style={{ background: '#FFBD2E', border: '1px solid #DEA123' }} />
            <div className="w-[13px] h-[13px] rounded-full" style={{ background: '#28C840', border: '1px solid #1DAD2B' }} />
          </div>
          <div className="flex-1 flex justify-center">
            <div
              className="rounded-lg px-10 py-[5px] flex items-center justify-center text-[12px] font-medium min-w-[280px]"
              style={{
                background: 'rgba(255,255,255,0.85)',
                border: '1px solid rgba(37,99,235,0.10)',
                color: '#64748B',
              }}
            >
              <svg className="w-3 h-3 mr-1.5" style={{ color: '#94A3B8' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              app.gymflow.sbs/fit-zone-gym
            </div>
          </div>
          <div className="w-16" />
        </div>

        {/* App Frame */}
        <div
          className="overflow-hidden flex h-[760px] text-slate-800 font-sans rounded-b-xl"
          style={{ border: '1px solid rgba(37,99,235,0.10)', borderTop: 'none', background: '#FFFFFF' }}
        >
          
          {/* Sidebar */}
          <div className="w-[220px] bg-white border-r border-slate-100 flex flex-col flex-shrink-0 relative">
            <div className="h-[68px] flex items-center justify-between px-5 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 flex items-center justify-center">
                  <img src="/logo_only.png" alt="GymFlow Logo" className="w-7 h-7 object-contain" />
                </div>
                <span className="text-base font-extrabold tracking-tight text-slate-900">GymFlow</span>
              </div>
              <button className="w-6 h-6 rounded border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-50 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
            
            <div className="flex-1 py-4 flex flex-col justify-between">
              <div className="space-y-1.5 px-3">
                {SIDEBAR_ITEMS.map((item) => {
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => !item.soon && setActiveTab(item.id)}
                      className={`w-full flex items-center justify-between px-3 py-[9px] rounded-lg text-[14px] font-medium transition-colors relative ${
                        isActive 
                          ? 'bg-blue-50/70 text-blue-600' 
                          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                      } ${item.soon ? 'cursor-default opacity-80' : 'cursor-pointer'}`}
                    >
                      <div className="flex items-center gap-3.5">
                        <item.icon className={`w-[18px] h-[18px] ${isActive ? 'text-blue-600' : 'text-slate-400'}`} strokeWidth={isActive ? 2.5 : 2} />
                        {item.label}
                      </div>
                      
                      {item.soon && (
                        <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/50">SOON</span>
                      )}
                      
                      {isActive && (
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="px-4 pb-2">
                <button className="btn-primary py-2.5 rounded-lg text-sm">
                  <Plus className="w-4 h-4" />
                  Add Member
                </button>
              </div>
            </div>
          </div>

          {/* Main Area */}
          <div className="flex-1 flex flex-col overflow-hidden bg-white">
            {/* Topbar */}
            <div className="h-[68px] bg-white border-b border-slate-100 flex items-center justify-center relative flex-shrink-0 px-6">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 flex items-center justify-center">
                  <img src="/logo_only.png" alt="GymFlow Logo" className="w-7 h-7 object-contain" />
                </div>
                <span className="text-lg font-black tracking-tight text-blue-600 uppercase">Fit Zone Gym</span>
              </div>
              
              <div className="absolute right-6 top-1/2 -translate-y-1/2">
                <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center">
                  <img src="/logo_only.png" alt="User Avatar" className="w-5 h-5 object-contain" />
                </div>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <div ref={mainAreaRef} className="h-full">
                {activeTab === 'dashboard' && <DashboardView />}
                {activeTab === 'members' && <MembersView />}
                {activeTab === 'payments' && <PaymentsView />}
                {activeTab === 'dues' && <DuesView />}
                {activeTab === 'attendance' && <AttendanceView />}
                {activeTab === 'inventory' && <InventoryView />}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}



// ─── Dashboard View ─────────────────────────────────────────────────────────

function DashboardView() {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 mb-2 text-slate-400">
        <div className="w-4 h-4"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 22h20L12 2z"/></svg></div>
        <span className="text-xs font-semibold">Fit Zone Gym</span>
      </div>
      <h2 className="text-[26px] font-black text-slate-900 tracking-tight mb-6">Dashboard</h2>

      {/* Stats Cards */}
      <div className="grid grid-cols-6 gap-4 mb-8">
        {[
          { label: 'Active', val: '42', color: 'text-emerald-500', bg: 'bg-emerald-50' },
          { label: 'Attendance', val: '0', color: 'text-blue-500', bg: 'bg-blue-50' },
          { label: 'Expiring', val: '3', color: 'text-amber-500', bg: 'bg-amber-50' },
          { label: 'Expired', val: '39', color: 'text-rose-500', bg: 'bg-rose-50' },
          { label: 'Today\'s Collection', val: '₹0', color: 'text-teal-500', bg: 'bg-teal-50' },
          { label: 'Total Dues', val: '₹0', color: 'text-rose-500', bg: 'bg-rose-50' },
        ].map((stat, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between h-[104px]">
            <div className={`w-7 h-7 rounded-full ${stat.bg} ${stat.color} flex items-center justify-center mb-1`}>
              <Users className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="text-2xl font-black text-slate-900 leading-none">{stat.val}</div>
              <div className="text-[11px] text-slate-500 font-medium mt-1">{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-6">
        {/* Expiring This Week */}
        <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <h3 className="font-bold text-slate-900 text-sm">Expiring This Week</h3>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </div>
            <button className="text-sm font-bold text-blue-600 hover:text-blue-700">See all</button>
          </div>
          <div className="p-2">
            {[
              { n: 'Harini Raj', p: '919384886895', t: 'Today', c: 'text-amber-500' },
              { n: 'Vignesh Das', p: '919384886895', t: '2d left', c: 'text-amber-500' },
              { n: 'Naveen Verma', p: '919384886895', t: '5d left', c: 'text-amber-500' },
            ].map((usr, i) => (
              <div key={i} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                    {usr.n.split(' ').map(n=>n[0]).join('')}
                  </div>
                  <div>
                    <div className="text-[13px] font-bold text-slate-900 leading-tight">{usr.n}</div>
                    <div className="text-[11px] text-slate-400 font-medium">{usr.p}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`text-[11px] font-bold ${usr.c}`}>{usr.t}</span>
                  <button className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded text-[11px] font-bold flex items-center gap-1.5 transition-colors">
                    <MessageCircle className="w-3 h-3" />
                    Remind
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="w-[300px] bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-4 flex items-center gap-2 border-b border-slate-100">
            <TrendingUp className="w-4 h-4 text-slate-400" />
            <h3 className="font-bold text-slate-400 text-[11px] tracking-wider uppercase">Quick Actions</h3>
          </div>
          <div className="p-4 flex flex-col gap-3">
            <button className="btn-primary py-3 rounded-lg text-[13px] font-bold flex items-center justify-start px-4 transition-colors">
              <Plus className="w-4 h-4 mr-3 opacity-70" />
              Add New Member
            </button>
            <button className="w-full bg-[#0d9488] hover:bg-teal-700 text-white py-3 rounded-lg text-[13px] font-bold flex items-center px-4 transition-colors">
              <CalendarCheck className="w-4 h-4 mr-3 opacity-70" />
              Mark Attendance
            </button>
            <button className="w-full bg-[#6366f1] hover:bg-indigo-600 text-white py-3 rounded-lg text-[13px] font-bold flex items-center px-4 transition-colors">
              <List className="w-4 h-4 mr-3 opacity-70" />
              Attendance Log
            </button>
            <button className="w-full bg-[#059669] hover:bg-emerald-700 text-white py-3 rounded-lg text-[13px] font-bold flex items-center px-4 transition-colors">
              <Package className="w-4 h-4 mr-3 opacity-70" />
              Daily Report PDF
            </button>
            <button className="w-full bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 py-3 rounded-lg text-[13px] font-bold flex items-center px-4 transition-colors">
              <span className="w-4 h-4 mr-3 opacity-70 flex items-center justify-center font-bold">₹</span>
              View Fee Dues
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Members View ───────────────────────────────────────────────────────────

function MembersView() {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <h2 className="text-[26px] font-black text-slate-900 tracking-tight">Members</h2>
        <div className="flex items-center gap-2">
          <button className="h-9 px-3 border border-slate-200 rounded-lg text-[13px] font-medium text-slate-600 flex items-center gap-1.5 hover:bg-slate-50 transition-colors">
            <Filter className="w-3.5 h-3.5" /> Advanced
          </button>
          <button className="h-9 px-3 border border-slate-200 rounded-lg text-[13px] font-medium text-slate-600 flex items-center gap-1.5 hover:bg-slate-50 transition-colors">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
          <button className="h-9 px-3 border border-slate-200 rounded-lg text-[13px] font-medium text-slate-600 flex items-center gap-1.5 hover:bg-slate-50 transition-colors">
            <Upload className="w-3.5 h-3.5" /> Import
          </button>
          <button className="h-9 px-3 border border-slate-200 rounded-lg text-[13px] font-medium text-slate-600 flex items-center gap-1.5 hover:bg-slate-50 transition-colors">
            <Edit3 className="w-3.5 h-3.5" /> Edit Members
          </button>
          <button className="h-9 px-3 border border-slate-200 rounded-lg text-[13px] font-medium text-slate-600 flex items-center gap-1.5 hover:bg-slate-50 transition-colors">
            <CalendarCheck className="w-3.5 h-3.5" /> Attendance Log
          </button>
          <button className="h-9 px-4 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-[13px] font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm shadow-brand-200">
            <Plus className="w-3.5 h-3.5" /> Add Member
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6 shrink-0">
        <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[12px] text-slate-600 font-medium">Total Members</div>
            <div className="text-xl font-black text-slate-900"><span className="text-blue-600">81</span> <span className="text-sm font-medium text-slate-400">/ 81</span></div>
          </div>
        </div>
        <div className="bg-white border border-emerald-200 rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center">
            <Check className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[12px] text-slate-600 font-medium">Active</div>
            <div className="text-xl font-black text-emerald-600">39</div>
          </div>
        </div>
        <div className="bg-rose-50/30 border border-rose-200 rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[12px] text-slate-600 font-medium">Expired</div>
            <div className="text-xl font-black text-rose-600">39</div>
          </div>
        </div>
        <div className="bg-orange-50/30 border border-orange-200 rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[12px] text-slate-600 font-medium">Overdue Dues</div>
            <div className="text-xl font-black text-orange-600">0</div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-6 shrink-0">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input type="text" placeholder="Search by name or phone..." className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-[13px] focus:outline-none" />
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-[13px] text-slate-400 min-w-[120px]">
          # GF0001
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 shrink-0">
        <button className="bg-slate-900 text-white px-4 py-1.5 rounded-full text-[12px] font-bold">All (81)</button>
        <button className="bg-white border border-slate-200 text-slate-600 px-4 py-1.5 rounded-full text-[12px] font-bold">Active (39)</button>
        <button className="bg-white border border-slate-200 text-slate-600 px-4 py-1.5 rounded-full text-[12px] font-bold">Expiring (3)</button>
        <button className="bg-white border border-slate-200 text-slate-600 px-4 py-1.5 rounded-full text-[12px] font-bold">Expired (39)</button>
      </div>

      <div className="flex-1 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col min-h-0">
        <div className="overflow-x-auto overflow-y-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-200 text-[10px] uppercase tracking-widest text-slate-400 font-bold">
              <th className="px-5 py-3 font-bold">#</th>
              <th className="px-5 py-3 font-bold">MEMBER</th>
              <th className="px-5 py-3 font-bold">PHONE</th>
              <th className="px-5 py-3 font-bold">PLAN</th>
              <th className="px-5 py-3 font-bold">EXPIRES</th>
              <th className="px-5 py-3 font-bold">STATUS</th>
            </tr>
          </thead>
          <tbody className="text-[13px]">
            {[
              { id: 'GF0063', n: 'Harini Raj', p: '919384886895', plan: 'Quarterly', pl: 'Strength + Cardio', exp: '13 Jul 2026 (0d left)', s: 'Expiring', sColor: 'text-amber-500 border-amber-200', bg: 'bg-amber-400' },
              { id: 'GF0043', n: 'Naveen Verma', p: '919384886895', plan: 'Monthly', pl: 'Strength + Cardio', exp: '18 Jul 2026 (5d left)', s: 'Expiring', sColor: 'text-amber-500 border-amber-200', bg: 'bg-amber-400' },
              { id: 'GF0062', n: 'Vignesh Das', p: '919384886895', plan: 'Monthly', pl: 'Strength + Cardio', exp: '15 Jul 2026 (2d left)', s: 'Expiring', sColor: 'text-amber-500 border-amber-200', bg: 'bg-amber-400' },
              { id: 'GF0059', n: 'Aakash Das', p: '919384886895', plan: 'Annual', pl: 'Strength + Cardio', exp: '17 Apr 2027 (278d left)', s: 'Active', sColor: 'text-emerald-500 border-emerald-200', bg: 'bg-emerald-500' },
              { id: 'GF0024', n: 'Aakash Reddy', p: '919384886895', plan: 'Annual', pl: 'Strength + Cardio', exp: '17 May 2027 (308d left)', s: 'Active', sColor: 'text-emerald-500 border-emerald-200', bg: 'bg-emerald-500' },
            ].map((m, i) => (
              <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50">
                <td className="px-5 py-4 text-slate-400 font-medium text-[11px]">{m.id}</td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded ${m.bg} text-white flex items-center justify-center text-xs font-bold`}>
                      {m.n.split(' ').map(x=>x[0]).join('')}
                    </div>
                    <div className="font-bold text-slate-800">{m.n}</div>
                  </div>
                </td>
                <td className="px-5 py-4 text-slate-500">{m.p}</td>
                <td className="px-5 py-4">
                  <div className="font-bold text-slate-700">{m.plan}</div>
                  <div className="text-[11px] text-slate-400">{m.pl}</div>
                </td>
                <td className="px-5 py-4 text-slate-500">{m.exp}</td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${m.s === 'Active' ? 'status-active' : m.s === 'Expiring' ? 'status-expiring' : 'status-expired'}`}>
                      {m.s}
                    </span>
                    {m.s === 'Expiring' && (
                      <button className="bg-emerald-500 text-white px-2.5 py-1 rounded text-[10px] font-bold flex items-center gap-1">
                        <MessageCircle className="w-2.5 h-2.5" /> Remind
                      </button>
                    )}
                    <ChevronLeft className="w-4 h-4 text-slate-300 rotate-180 ml-auto" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

// ─── Payments View ──────────────────────────────────────────────────────────

function PaymentsView() {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <h2 className="text-[26px] font-black text-slate-900 tracking-tight">Payments</h2>
        <button className="px-4 py-2 border border-slate-200 rounded-lg text-[13px] font-medium text-slate-600 flex items-center gap-1.5 hover:bg-slate-50">
          <Download className="w-3.5 h-3.5" /> Export
        </button>
      </div>

      <div className="bg-brand-600 rounded-xl p-6 text-white mb-4 relative overflow-hidden shadow-md shrink-0">
        <div className="absolute inset-0 bg-blue-600/50 mix-blend-overlay" />
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold tracking-widest text-white/70 uppercase mb-2">This Month's Collection</div>
            <div className="text-[40px] font-black leading-none mb-3">₹34,500</div>
            <div className="flex items-center gap-4 text-[12px] font-medium text-white/90">
              <span>Cash <span className="font-bold text-white">₹22,000</span></span>
              <span>UPI <span className="font-bold text-white">₹12,500</span></span>
              <span>Card <span className="font-bold text-white">₹0</span></span>
              <span className="text-white/60 ml-2">5 transactions</span>
            </div>
          </div>
          <div className="text-[13px] text-right font-medium space-y-1.5">
            <div>Memberships: <span className="font-bold">₹34,500</span></div>
            <div>Inventory: <span className="font-bold">₹0</span></div>
            <div>Dues Collected: <span className="font-bold">₹0</span></div>
          </div>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between mb-6 shrink-0">
        <div className="flex items-center gap-3 text-amber-700">
          <AlertCircle className="w-5 h-5" />
          <span className="text-[13px] font-bold">Pending Dues — ₹12,500 from 4 members</span>
        </div>
        <button className="text-[13px] font-bold text-amber-700 hover:text-amber-800">Show</button>
      </div>

      <div className="flex items-center gap-2 mb-4 shrink-0">
        <button className="bg-white border border-slate-200 text-slate-600 px-4 py-1.5 rounded-lg text-[12px] font-bold">Today</button>
        <button className="bg-white border border-slate-200 text-slate-600 px-4 py-1.5 rounded-lg text-[12px] font-bold">Week</button>
        <button className="bg-slate-900 text-white px-4 py-1.5 rounded-lg text-[12px] font-bold">Month</button>
        <button className="bg-white border border-slate-200 text-slate-600 px-4 py-1.5 rounded-lg text-[12px] font-bold">All Time</button>
        <button className="bg-white border border-slate-200 text-slate-600 px-4 py-1.5 rounded-lg text-[12px] font-bold">Custom</button>
        
        <div className="w-px h-6 bg-slate-200 mx-2" />
        
        <button className="bg-slate-900 text-white px-4 py-1.5 rounded-lg text-[12px] font-bold">All Modes</button>
        <button className="bg-white border border-slate-200 text-slate-600 px-4 py-1.5 rounded-lg text-[12px] font-bold">CASH</button>
        <button className="bg-white border border-slate-200 text-slate-600 px-4 py-1.5 rounded-lg text-[12px] font-bold">UPI</button>
        <button className="bg-white border border-slate-200 text-slate-600 px-4 py-1.5 rounded-lg text-[12px] font-bold">CARD</button>
      </div>

      <div className="flex items-center gap-6 border-b border-slate-200 mb-6 shrink-0">
        <button className="pb-3 border-b-2 border-brand-600 text-brand-600 text-[13px] font-bold">Memberships (5)</button>
        <button className="pb-3 text-slate-500 text-[13px] font-semibold hover:text-slate-800">Inventory (0)</button>
        <button className="pb-3 text-slate-500 text-[13px] font-semibold hover:text-slate-800">Dues (0)</button>
      </div>

      <div className="flex items-center gap-3 mb-6 shrink-0">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input type="text" placeholder="Search by name or phone..." className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-[13px] focus:outline-none" />
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-[13px] text-slate-400 min-w-[120px]">
          # Member ID
        </div>
      </div>

      <div className="flex-1 bg-white border border-slate-200 rounded-xl flex flex-col min-h-0">
        <div className="bg-slate-50/80 border-b border-slate-200 text-[10px] uppercase tracking-widest text-slate-400 font-bold flex px-6 py-3">
          <div className="w-16">#</div>
          <div className="flex-1">MEMBER</div>
          <div className="w-32">PLAN</div>
          <div className="w-48">PERIOD</div>
          <div className="w-24">MODE</div>
          <div className="w-40 text-right">AMOUNT</div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {[
            { id: '#85', n: 'Arun Kumar', p: '9876543210', plan: 'Quarterly', date: '13 Jul 2026 - 13 Oct 2026', mode: 'UPI', amt: '₹5,000', sub: '₹6,000 + ₹500 adm - ₹1,500 due', modeColor: 'text-brand-600 bg-brand-50 border-brand-200' },
            { id: '#84', n: 'Priya', p: '9876543211', plan: 'Monthly', date: '13 Jul 2026 - 13 Aug 2026', mode: 'UPI', amt: '₹7,500', sub: '₹7,500 - ₹0 due', modeColor: 'text-brand-600 bg-brand-50 border-brand-200' },
            { id: '#83', n: 'Ragul', p: '9384886895', plan: 'Annual', date: '13 Jul 2026 - 13 Jul 2027', mode: 'CASH', amt: '₹7,500', sub: '₹12,000 + ₹500 adm - ₹5,000 due', modeColor: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
            { id: '#82', n: 'Ganesh', p: '9384886895', plan: 'Annual', date: '13 Jul 2026 - 13 Jul 2027', mode: 'CASH', amt: '₹9,500', sub: '₹12,000 + ₹500 adm - ₹3,000 due', modeColor: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
            { id: '#81', n: 'Vijay', p: '9384886895', plan: 'Monthly', date: '12 Jul 2026 - 12 Aug 2026', mode: 'CASH', amt: '₹5,000', sub: '₹8,000 - ₹3,000 due', modeColor: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
          ].map((item, i) => (
             <div key={i} className="flex px-6 py-4 border-b border-slate-100 hover:bg-slate-50/50 items-center">
               <div className="w-16 text-[11px] font-bold text-slate-400">{item.id}</div>
               <div className="flex-1">
                 <div className="font-bold text-slate-800 text-[13px]">{item.n}</div>
                 <div className="text-[11px] text-slate-400">{item.p}</div>
               </div>
               <div className="w-32 text-[13px] font-medium text-slate-600">{item.plan}</div>
               <div className="w-48 text-[12px] font-medium text-slate-500">{item.date}</div>
               <div className="w-24">
                 <span className={`inline-flex px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${item.modeColor} flex items-center gap-1 w-max`}>
                   {item.mode === 'CASH' ? <Banknote className="w-3 h-3" /> : <Smartphone className="w-3 h-3" />}
                   {item.mode}
                 </span>
               </div>
               <div className="w-40 text-right">
                 <div className="font-black text-slate-900 text-[14px]">{item.amt}</div>
                 <div className="text-[10px] text-slate-400 font-medium whitespace-nowrap">{item.sub}</div>
               </div>
             </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Dues View ──────────────────────────────────────────────────────────────

function DuesView() {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-8 shrink-0">
        <h2 className="text-[26px] font-black text-slate-900 tracking-tight">Fee Dues</h2>
        <div className="flex items-center gap-4">
          <input type="text" placeholder="Search name or phone..." className="w-64 px-4 py-2 bg-white border border-slate-200 rounded-lg text-[13px] focus:outline-none" />
          <div className="bg-white border border-rose-100 rounded-lg px-4 py-1.5 flex items-center gap-3 shadow-sm">
            <AlertCircle className="w-4 h-4 text-rose-500" />
            <div className="text-right">
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Total Pending</div>
              <div className="text-base font-black text-rose-600 leading-none">₹12,500</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-3 overflow-y-auto pr-2 custom-scrollbar min-h-0">
        {[
          { id: '#85', n: 'Arun Kumar', p: '9876543210', due: '₹1,500', initials: 'A', bg: 'bg-rose-50 text-rose-500' },
          { id: '#83', n: 'Ragul', p: '9384886895', due: '₹5,000', initials: 'R', bg: 'bg-rose-50 text-rose-500' },
          { id: '#82', n: 'Ganesh', p: '9384886895', due: '₹3,000', initials: 'G', bg: 'bg-rose-50 text-rose-500' },
          { id: '#81', n: 'Vijay', p: '9384886895', due: '₹3,000', initials: 'V', bg: 'bg-rose-50 text-rose-500' },
        ].map((item, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-sm hover:border-slate-300 transition-colors">
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-[14px] ${item.bg}`}>
                {item.initials}
              </div>
              <div>
                <div className="font-bold text-slate-800 text-[14px]">{item.n} <span className="text-slate-400 text-[11px] font-medium ml-1">{item.id}</span></div>
                <div className="text-[12px] text-slate-500">{item.p}</div>
              </div>
            </div>
            
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="font-black text-rose-600 text-[15px]">{item.due}</div>
                <div className="text-[11px] font-medium text-slate-400">pending</div>
              </div>
              
              <div className="flex items-center gap-2">
                <button className="w-8 h-8 rounded bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center shadow-sm">
                  <MessageCircle className="w-4 h-4" />
                </button>
                <button className="w-8 h-8 rounded bg-brand-600 hover:bg-brand-700 text-white flex items-center justify-center shadow-sm font-bold text-[13px]">
                  ₹
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Attendance View ────────────────────────────────────────────────────────

function AttendanceView() {
  return (
    <div className="h-full flex flex-col items-center pt-10">
      <div className="w-full max-w-[500px]">
        <div className="flex justify-end mb-10">
          <div className="bg-white border border-slate-200 p-1 rounded-full flex shadow-sm">
            <button className="px-4 py-1.5 rounded-full text-[13px] font-semibold text-slate-500 flex items-center gap-1.5 hover:bg-slate-50">
              <Sun className="w-3.5 h-3.5" /> Morning
            </button>
            <button className="px-4 py-1.5 rounded-full text-[13px] font-semibold text-blue-600 bg-blue-50 flex items-center gap-1.5">
              <Moon className="w-3.5 h-3.5" /> Evening
            </button>
          </div>
        </div>

        <div className="text-center mb-16">
          <h2 className="text-[42px] font-black text-slate-900 tracking-tight leading-none mb-2">Fit Zone Gym</h2>
          <div className="text-[13px] font-bold tracking-widest text-slate-500 uppercase mb-3">Self-Service Attendance</div>
          <div className="text-[13px] text-slate-400">Monday, 13 Jul 2026</div>
        </div>

        <div className="text-center mb-12">
          <div className="text-[11px] font-bold text-slate-400 tracking-widest uppercase mb-4">Enter Your Member ID</div>
          <input 
            type="text" 
            placeholder="1042" 
            className="w-full text-center text-[56px] font-black text-slate-200 focus:text-slate-800 placeholder:text-slate-100 focus:outline-none border-b-2 border-blue-500 pb-2 bg-transparent"
          />
        </div>

        <button className="w-full max-w-[300px] mx-auto block bg-slate-500 hover:bg-slate-600 text-white rounded-full py-4 text-lg font-bold shadow-lg transition-colors mb-12">
          Confirm
        </button>

        <div className="text-center flex items-center justify-center gap-3">
          <span className="text-[13px] font-bold text-slate-400">Total Checked-in Today:</span>
          <span className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-sm font-bold text-slate-600">0</span>
        </div>
      </div>
    </div>
  );
}

// ─── Inventory View ────────────────────────────────────────────────────────

function InventoryView() {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-start justify-between mb-8 shrink-0">
        <div>
          <h2 className="text-[26px] font-black text-slate-900 tracking-tight leading-tight mb-1.5">Inventory<br/>Management</h2>
          <p className="text-[13px] text-slate-400 max-w-[200px] leading-snug">Manage your products, stock, and pricing</p>
        </div>
        <button className="btn-primary flex-1 max-w-[650px] ml-12 mt-2 py-3.5 rounded-xl text-[14px] font-bold flex items-center justify-center transition-colors shadow-sm">
          <Plus className="w-4 h-4 mr-2" />
          Add New Product
        </button>
      </div>

      <div className="flex-1 bg-white border border-slate-200 rounded-xl flex flex-col min-h-0">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="relative w-[360px]">
            <Search className="w-4 h-4 text-slate-300 absolute left-4 top-1/2 -translate-y-1/2" />
            <input type="text" placeholder="Search products, SKUs..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[13px] focus:outline-none placeholder:text-slate-400" />
          </div>
          <button className="px-4 py-2.5 border border-slate-200 rounded-xl text-[13px] font-semibold text-slate-700 flex items-center gap-2 hover:bg-slate-50">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            All Categories
          </button>
        </div>
        
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-100 text-[10px] uppercase tracking-widest text-slate-400 font-bold bg-white">
              <th className="px-6 py-4 font-bold">PRODUCT</th>
              <th className="px-6 py-4 font-bold">SKU</th>
              <th className="px-6 py-4 font-bold">CATEGORY</th>
              <th className="px-6 py-4 font-bold">PRICE</th>
              <th className="px-6 py-4 font-bold text-right">STOCK</th>
            </tr>
          </thead>
          <tbody className="text-[13px]">
            {[
              { n: 'Muscle Blaze Whey', s: 'Banana', c: 'Supplements', p: '₹2500', st: '10IN STOCK' },
              { n: 'Nakpro whey', s: 'Chocolate', c: 'Supplements', p: '₹1200', st: '10IN STOCK' },
            ].map((item, i) => (
              <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-lg bg-slate-50 border border-slate-100 text-slate-300 flex items-center justify-center">
                      <Package className="w-5 h-5" strokeWidth={1.5} />
                    </div>
                    <div>
                      <div className="font-bold text-slate-800 text-[14px]">{item.n}</div>
                      <div className="text-[12px] text-slate-500 mt-0.5">{item.s}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-slate-300 font-medium">—</td>
                <td className="px-6 py-4 text-slate-500 font-medium text-[13px]">{item.c}</td>
                <td className="px-6 py-4 font-black text-slate-800 text-[14px]">{item.p}</td>
                <td className="px-6 py-4 text-right">
                  <span className="inline-flex px-3 py-1.5 rounded-full text-[10px] font-extrabold text-emerald-500 bg-[#ecfdf5] tracking-widest uppercase">
                    {item.st}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
