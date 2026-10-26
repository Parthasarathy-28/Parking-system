// ParkPulse Landing Page - Stunning first impression
import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useInView, useAnimation } from 'framer-motion';
import { MapPin, Zap, Clock, Shield, Users, BarChart2, ChevronRight, Car, Bike, Smartphone, ArrowRight, CheckCircle } from 'lucide-react';
import { publicApi } from '../lib/api';

// ---- SVG Illustrations ----
function HeroIllustration() {
  return (
    <svg viewBox="0 0 600 400" className="w-full h-full" aria-hidden="true">
      {/* Road background */}
      <rect width="600" height="400" fill="#f1f5f9" rx="24" />
      
      {/* Parking lot grid */}
      <rect x="40" y="40" width="520" height="320" fill="#e2e8f0" rx="12" />
      
      {/* Main road (horizontal) */}
      <rect x="40" y="175" width="520" height="50" fill="#cbd5e1" />
      <line x1="40" y1="200" x2="560" y2="200" stroke="#94a3b8" strokeWidth="2" strokeDasharray="20,15" />
      
      {/* Entrance arrow */}
      <text x="50" y="197" fill="#64748b" fontSize="10" fontFamily="system-ui">→ ENTRANCE</text>

      {/* Zone A - Green (bikes) */}
      <rect x="60" y="55" width="220" height="110" fill="#dcfce7" rx="8" />
      <text x="160" y="72" textAnchor="middle" fill="#15803d" fontSize="12" fontWeight="600">Zone A – Bikes</text>

      {/* Bike slots */}
      {[0,1,2,3,4,5,6,7].map(i => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        const colors = ['#10b981','#10b981','#f59e0b','#ef4444','#10b981','#10b981','#94a3b8','#10b981'];
        return (
          <g key={i}>
            <rect x={70 + col*52} y={80 + row*45} width="42" height="30" fill={colors[i]} rx="6" opacity="0.9"/>
            <text x={91 + col*52} y={100 + row*45} textAnchor="middle" fill="white" fontSize="9" fontWeight="700">A{i+1}</text>
          </g>
        );
      })}

      {/* Zone B - Blue (cars) */}
      <rect x="320" y="55" width="220" height="110" fill="#dbeafe" rx="8" />
      <text x="430" y="72" textAnchor="middle" fill="#1d4ed8" fontSize="12" fontWeight="600">Zone B – Cars</text>

      {/* Car slots */}
      {[0,1,2,3,4,5].map(i => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const colors = ['#3b82f6','#f59e0b','#3b82f6','#ef4444','#3b82f6','#3b82f6'];
        return (
          <g key={i}>
            <rect x={330 + col*68} y={80 + row*45} width="58" height="35" fill={colors[i]} rx="6" opacity="0.9"/>
            <text x={359 + col*68} y={102 + row*45} textAnchor="middle" fill="white" fontSize="9" fontWeight="700">B{i+1}</text>
          </g>
        );
      })}

      {/* Zone C - Purple (staff) */}
      <rect x="60" y="240" width="500" height="110" fill="#ede9fe" rx="8" />
      <text x="310" y="258" textAnchor="middle" fill="#6d28d9" fontSize="12" fontWeight="600">Zone C – Staff Reserved</text>
      {[0,1,2,3,4,5,6,7].map(i => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        return (
          <g key={i}>
            <rect x={70 + col*120} y={265 + row*50} width="100" height="38" fill="#8b5cf6" rx="6" opacity="0.85"/>
            <text x={120 + col*120} y={289 + row*50} textAnchor="middle" fill="white" fontSize="10" fontWeight="700">C{i+1}</text>
          </g>
        );
      })}

      {/* Animated GPS pin */}
      <motion.g
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.6 }}
      >
        {/* Pin shadow/ring */}
        <circle cx="91" cy="95" r="18" fill="#10b981" opacity="0.2" />
        <circle cx="91" cy="95" r="12" fill="#10b981" opacity="0.3" />
        {/* Pin */}
        <circle cx="91" cy="95" r="8" fill="#10b981" />
        <circle cx="91" cy="95" r="3" fill="white" />
      </motion.g>

      {/* Moving car animation */}
      <motion.g
        animate={{ x: [0, 280, 280] }}
        transition={{ duration: 4, repeat: Infinity, repeatDelay: 2 }}
      >
        <rect x="80" y="180" width="36" height="22" fill="#334155" rx="5" />
        <rect x="85" y="175" width="26" height="12" fill="#475569" rx="3" />
        <circle cx="88" cy="204" r="5" fill="#1e293b" />
        <circle cx="108" cy="204" r="5" fill="#1e293b" />
        <rect x="84" y="177" width="10" height="8" fill="#7dd3fc" rx="1" opacity="0.7" />
        <rect x="97" y="177" width="10" height="8" fill="#7dd3fc" rx="1" opacity="0.7" />
      </motion.g>

      {/* Live badge */}
      <g transform="translate(480, 35)">
        <rect width="60" height="22" fill="#10b981" rx="11" />
        <circle cx="14" cy="11" r="4" fill="white" />
        <motion.circle cx="14" cy="11" r="7" fill="white" opacity="0.4"
          animate={{ r: [4, 9, 4], opacity: [0.4, 0, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <text x="25" y="15" fill="white" fontSize="10" fontWeight="700">LIVE</text>
      </g>
    </svg>
  );
}

// ---- Count-up animation ----
function CountUp({ target, duration = 1500, suffix = '' }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start = Math.min(start + step, target);
      setCount(Math.round(start));
      if (start >= target) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [inView, target, duration]);

  return <span ref={ref} className="tabular-nums">{count}{suffix}</span>;
}

// ---- How it works steps ----
const steps = [
  { icon: MapPin, color: 'bg-primary-100 text-primary-600', title: 'Enter Campus', desc: 'Drive to the parking entrance. ParkPulse detects your location automatically.' },
  { icon: Smartphone, color: 'bg-secondary-100 text-secondary-600', title: 'Request a Slot', desc: 'Tap "Get My Parking Slot" once inside the entry geofence.' },
  { icon: Zap, color: 'bg-amber-100 text-amber-600', title: 'Get Allocated', desc: 'The server assigns the highest-priority compatible slot in under a second.' },
  { icon: CheckCircle, color: 'bg-purple-100 text-purple-600', title: 'Park & Confirm', desc: 'Follow the route, park, confirm on your device, and exit when done.' },
];

// ---- Features ----
const features = [
  { icon: MapPin, title: 'Geofence Entry', desc: 'Only users physically at the parking entrance can request slots — no remote reservations.', color: 'text-primary-500' },
  { icon: Zap, title: 'Instant Allocation', desc: 'FCFA engine assigns the highest-priority slot atomically in milliseconds.', color: 'text-amber-500' },
  { icon: BarChart2, title: 'Real-time Twin', desc: 'Live digital twin shows every slot\'s status. Color + icon + text for accessibility.', color: 'text-secondary-500' },
  { icon: Clock, title: 'Smart Reallocation', desc: 'If your held slot becomes unavailable, ParkPulse instantly finds you a new one.', color: 'text-purple-500' },
  { icon: Users, title: 'Waiting Queue', desc: 'When full, join the queue and get notified the moment a slot opens up.', color: 'text-rose-500' },
  { icon: Shield, title: 'Priority Control', desc: 'Admins drag and drop slots by priority — closest to exit gets allocated first.', color: 'text-indigo-500' },
];

// ---- FAQ ----
const faqs = [
  { q: 'How accurate is the location detection?', a: 'The Geolocation API reports accuracy in meters. ParkPulse only accepts requests when accuracy ≤50m (configurable). On busy campuses, we recommend standing outdoors for a better GPS fix.' },
  { q: 'Can the system be spoofed?', a: 'GPS spoofing is a real limitation of browser-based geolocation. ParkPulse documents this honestly — it uses coordinates as a deterrent, not a cryptographic proof. Security admins can enable manual verification as a fallback.' },
  { q: 'What happens if the app is offline?', a: 'The backend holds your allocation with a server-side timer. Reconnecting re-fetches your current status from the database — the source of truth.' },
  { q: 'Can I reserve a spot in advance?', a: 'No — ParkPulse uses First-Come-First-Allocated inside the geofence. This prevents no-shows and ensures fair access during peak hours.' },
];

export default function LandingPage() {
  const [stats, setStats] = useState(null);
  const [faqOpen, setFaqOpen] = useState(null);

  useEffect(() => {
    publicApi.stats().then(r => setStats(r.data.stats)).catch(() => {
      setStats({ total_slots: 36, available: 28, held: 3, occupied: 5 });
    });
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* ---- NAVBAR ---- */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-surface-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary-500 rounded-xl flex items-center justify-center">
              <Car className="w-4 h-4 text-white" />
            </div>
            <span className="text-xl font-800 text-slate-800">Park<span className="text-primary-500">Pulse</span></span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-block bg-amber-100 text-amber-700 text-xs font-600 px-3 py-1 rounded-full">
              🔬 Demo Mode
            </span>
            <Link to="/login"
              className="bg-primary-500 hover:bg-primary-600 text-white px-5 py-2 rounded-xl text-sm font-600 transition-colors flex items-center gap-1.5"
            >
              Sign In <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </nav>

      {/* ---- HERO ---- */}
      <section className="relative overflow-hidden bg-gradient-to-br from-white via-primary-50/30 to-secondary-50/20 pt-16 pb-24">
        {/* Background blob */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-gradient-to-b from-primary-100/40 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-12 items-center">
          {/* Left: Copy */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="relative z-10"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              className="inline-flex items-center gap-2 bg-primary-50 border border-primary-200 text-primary-700 px-3 py-1.5 rounded-full text-sm font-600 mb-6"
            >
              <span className="w-2 h-2 bg-primary-500 rounded-full animate-pulse" />
              Geofence-Enabled FCFA Parking
            </motion.div>

            <h1 className="text-5xl sm:text-6xl font-800 text-slate-900 leading-tight mb-4">
              Park Smarter.<br />
              <span className="text-primary-500">Save Time.</span><br />
              Move Better.
            </h1>

            <p className="text-lg text-slate-500 mb-8 max-w-lg">
              ParkPulse eliminates parking searches using real-time geofence verification and instant slot allocation — designed for busy campuses.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link to="/login?role=student"
                className="bg-primary-500 hover:bg-primary-600 active:bg-primary-700 text-white px-6 py-3 rounded-xl font-700 text-base transition-all shadow-glow hover:shadow-glow flex items-center gap-2"
              >
                <Smartphone className="w-5 h-5" />
                Student Login
              </Link>
              <Link to="/login?role=admin"
                className="bg-white hover:bg-slate-50 text-slate-700 border border-surface-300 px-6 py-3 rounded-xl font-700 text-base transition-all flex items-center gap-2"
              >
                <BarChart2 className="w-5 h-5" />
                Admin Dashboard
              </Link>
            </div>

            {/* Live stats */}
            {stats && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="mt-10 grid grid-cols-3 gap-4"
              >
                {[
                  { label: 'Total Slots', value: stats.total_slots, color: 'text-slate-700' },
                  { label: 'Available', value: stats.available, color: 'text-primary-600' },
                  { label: 'In Use', value: Number(stats.held || 0) + Number(stats.occupied || 0), color: 'text-amber-600' },
                ].map(s => (
                  <div key={s.label} className="bg-white/70 backdrop-blur rounded-2xl p-3 border border-surface-200 text-center">
                    <p className={`text-2xl font-800 ${s.color} tabular-nums`}><CountUp target={Number(s.value)} /></p>
                    <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </motion.div>
            )}
          </motion.div>

          {/* Right: Illustration */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="relative"
          >
            <div className="relative rounded-3xl overflow-hidden shadow-card-lg bg-white border border-surface-200 p-4">
              <HeroIllustration />
            </div>
            {/* Floating badge */}
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute -bottom-4 -left-4 bg-white rounded-2xl shadow-card-lg border border-surface-200 px-4 py-3 flex items-center gap-3"
            >
              <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center">
                <Zap className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <p className="text-sm font-700 text-slate-800">Slot allocated!</p>
                <p className="text-xs text-slate-500">A3 • 3:00 hold timer</p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ---- FEATURES ---- */}
      <section className="py-20 bg-surface-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-800 text-slate-900">Everything a smart campus needs</h2>
            <p className="text-slate-500 mt-3 max-w-xl mx-auto">From geofence entry to automatic reallocation — every feature works end to end.</p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="bg-white rounded-3xl p-6 border border-surface-200 shadow-card card-hover"
              >
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 bg-surface-50`}>
                  <f.icon className={`w-6 h-6 ${f.color}`} />
                </div>
                <h3 className="font-700 text-slate-800 text-base mb-2">{f.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- HOW IT WORKS ---- */}
      <section className="py-20 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-800 text-slate-900">Four steps, zero hassle</h2>
            <p className="text-slate-500 mt-3">The entire flow from campus gate to parked vehicle.</p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((step, i) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12 }}
                className="flex flex-col items-center text-center"
              >
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${step.color}`}>
                  <step.icon className="w-7 h-7" />
                </div>
                <div className="w-8 h-8 rounded-full bg-surface-100 border-2 border-surface-300 text-slate-500 text-sm font-700 flex items-center justify-center mb-3">
                  {i + 1}
                </div>
                <h3 className="font-700 text-slate-800 mb-2">{step.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- CTA ---- */}
      <section className="py-16 bg-gradient-to-r from-primary-500 to-primary-600">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl font-800 text-white mb-4">Ready to try ParkPulse?</h2>
            <p className="text-primary-100 mb-8 text-lg">Live demo with real slot allocation, reallocation, and queue.</p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link to="/login?role=student"
                className="bg-white text-primary-600 hover:bg-primary-50 px-6 py-3 rounded-xl font-700 transition-colors flex items-center gap-2"
              >
                <Car className="w-5 h-5" /> Try as Student
              </Link>
              <Link to="/login?role=admin"
                className="bg-primary-700 hover:bg-primary-800 text-white border border-primary-400 px-6 py-3 rounded-xl font-700 transition-colors flex items-center gap-2"
              >
                <BarChart2 className="w-5 h-5" /> Open Admin Panel
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ---- FAQ ---- */}
      <section className="py-20 bg-surface-50">
        <div className="max-w-3xl mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-800 text-slate-900">Location & Privacy FAQ</h2>
          </motion.div>

          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="bg-white rounded-2xl border border-surface-200 overflow-hidden"
              >
                <button
                  className="w-full px-6 py-4 text-left flex items-center justify-between gap-4"
                  onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                  aria-expanded={faqOpen === i}
                >
                  <span className="font-600 text-slate-800">{faq.q}</span>
                  <ChevronRight className={`w-5 h-5 text-slate-400 transition-transform flex-shrink-0 ${faqOpen === i ? 'rotate-90' : ''}`} />
                </button>
                {faqOpen === i && (
                  <div className="px-6 pb-4 text-sm text-slate-600 leading-relaxed border-t border-surface-100 pt-3">
                    {faq.a}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- FOOTER ---- */}
      <footer className="bg-slate-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary-500 rounded-xl flex items-center justify-center">
              <Car className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-800">Park<span className="text-primary-400">Pulse</span></span>
          </div>
          <p className="text-slate-400 text-sm text-center">
            Built for a campus hackathon demo • Uses browser geolocation • Not for production use without proper security review
          </p>
          <Link to="/login" className="text-primary-400 hover:text-primary-300 text-sm font-600 flex items-center gap-1">
            Sign In <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </footer>
    </div>
  );
}
