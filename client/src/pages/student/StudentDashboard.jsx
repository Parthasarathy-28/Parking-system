// StudentDashboard.jsx — ParkPulse 2.0 Mobile-First Experience
// 5 Bottom Navigation Tabs: Home, Parking Map, My Slot, History, Profile
// Features: Student & Staff segregation, PWA Install Banner, Offline Safety, Real-Time Sync

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Navigation, Car, Bike, CheckCircle, Clock, XCircle,
  Bell, LogOut, RefreshCw, AlertTriangle, Info, ChevronRight,
  ParkingCircle, History, Users, Loader2, Wifi, WifiOff,
  ArrowRight, Timer, Shield, Sparkles, X, ThumbsUp, ThumbsDown,
  LocateFixed, Home, Map, User, QrCode, ShieldCheck, Smartphone,
  ExternalLink, Compass, Calendar, CheckCircle2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket, useSocketEvent } from '../../contexts/SocketContext';
import { useToast } from '../../contexts/ToastContext';
import { studentApi } from '../../lib/api';
import ParkingMap from '../../components/ParkingMap';
import PWAInstallBanner from '../../components/PWAInstallBanner';
import OfflineNotice, { useOnlineStatus } from '../../components/OfflineNotice';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function fmtTime(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function InitialsAvatar({ name, size = 'md' }) {
  const initials = name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  const sz = size === 'lg' ? 'w-16 h-16 text-2xl' : 'w-9 h-9 text-sm';
  const colors = ['bg-emerald-100 text-emerald-700', 'bg-sky-100 text-sky-700', 'bg-violet-100 text-violet-700', 'bg-amber-100 text-amber-700'];
  const color = colors[(name?.charCodeAt(0) || 0) % colors.length];
  return (
    <div className={`${sz} ${color} rounded-2xl flex items-center justify-center font-bold flex-shrink-0 shadow-sm border border-emerald-200/50`}>
      {initials}
    </div>
  );
}

// ──────────────────────────────────────────────
// Hold Timer Ring
// ──────────────────────────────────────────────
function HoldTimer({ expiresAt, onExpired }) {
  const TOTAL = 180;
  const [remaining, setRemaining] = useState(TOTAL);

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const diff = Math.max(0, Math.round((new Date(expiresAt) - Date.now()) / 1000));
      setRemaining(diff);
      if (diff <= 0) onExpired?.();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, onExpired]);

  const pct = remaining / TOTAL;
  const radius = 52;
  const circ = 2 * Math.PI * radius;
  const isWarning = remaining <= 60;
  const isDanger = remaining <= 30;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <svg width="128" height="128" className="-rotate-90">
          <circle cx="64" cy="64" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="8" />
          <motion.circle
            cx="64" cy="64" r={radius} fill="none"
            stroke={isDanger ? '#ef4444' : isWarning ? '#f59e0b' : '#10b981'}
            strokeWidth="8" strokeLinecap="round"
            strokeDasharray={circ}
            animate={{ strokeDashoffset: circ * (1 - pct) }}
            transition={{ duration: 0.8, ease: 'linear' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-extrabold tabular-nums tracking-tight ${isDanger ? 'text-red-500' : isWarning ? 'text-amber-500' : 'text-emerald-600'}`}>
            {fmtTime(remaining)}
          </span>
          <span className="text-xs text-slate-400 font-medium">hold remaining</span>
        </div>
      </div>
      {isWarning && (
        <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          className={`text-xs font-bold ${isDanger ? 'text-red-500 animate-pulse' : 'text-amber-500'}`}>
          {isDanger ? '⚠ Hold expiring soon!' : 'Please confirm your parking'}
        </motion.p>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Geolocation card
// ──────────────────────────────────────────────
const GEO_STATES = {
  idle:       { icon: LocateFixed,    color: 'text-slate-500',   bg: 'bg-white border-slate-200',    label: 'Location not checked',       desc: 'Tap below to verify your campus location' },
  detecting:  { icon: Loader2,        color: 'text-sky-600',     bg: 'bg-sky-50 border-sky-200',      label: 'Detecting location…',         desc: 'Acquiring GPS coordinates' },
  eligible:   { icon: CheckCircle,    color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200',  label: 'At Parking Entrance ✓',       desc: 'You are verified at the entrance gate' },
  campus:     { icon: MapPin,         color: 'text-sky-600',     bg: 'bg-sky-50 border-sky-200',      label: 'Inside Campus Perimeter',    desc: 'Move closer to the parking entrance to request' },
  outside:    { icon: XCircle,        color: 'text-red-500',     bg: 'bg-red-50 border-red-200',      label: 'Outside Campus Perimeter',   desc: 'You must be on campus near the gate' },
  inaccurate: { icon: AlertTriangle,  color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200',    label: 'GPS Accuracy Insufficient',   desc: 'Move to an open area without roof interference' },
  denied:     { icon: Shield,         color: 'text-red-500',     bg: 'bg-red-50 border-red-200',      label: 'Location Permission Denied',  desc: 'Enable location permissions in browser settings' },
  error:      { icon: AlertTriangle,  color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200',    label: 'Location Signal Timeout',     desc: 'Could not fetch GPS lock' },
  demo:       { icon: Sparkles,       color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-300',   label: 'PSG Tech Gate Verified (Demo)', desc: '11.0245° N, 77.0072° E — Ready for allocation' },
};

function LocationCard({ geoState, onVerify, onDemoVerify, isOnline }) {
  const cfg = GEO_STATES[geoState] || GEO_STATES.idle;
  const Icon = cfg.icon;
  return (
    <div className={`rounded-3xl border p-4.5 shadow-sm transition-all ${cfg.bg}`}>
      <div className="flex items-center gap-3.5">
        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 bg-white shadow-sm border border-slate-100`}>
          <Icon className={`w-5 h-5 ${cfg.color} ${geoState === 'detecting' ? 'animate-spin' : ''}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-bold text-sm ${cfg.color}`}>{cfg.label}</p>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{cfg.desc}</p>
        </div>
      </div>
      <div className="flex gap-2.5 mt-3.5">
        <button
          onClick={onVerify}
          disabled={geoState === 'detecting' || !isOnline}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 active:scale-98 transition-all disabled:opacity-50 shadow-sm"
        >
          <LocateFixed className="w-3.5 h-3.5 text-emerald-600" />
          {geoState === 'detecting' ? 'Detecting…' : 'Verify Location'}
        </button>
        <button
          onClick={onDemoVerify}
          disabled={!isOnline}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 active:scale-98 transition-all shadow-md shadow-emerald-600/20 disabled:opacity-50"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Simulate Entrance
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Active Allocation Card
// ──────────────────────────────────────────────
function AllocationCard({ allocation, onConfirm, onCancel, onExit, onExpired, onNavigate, isOnline }) {
  const [loading, setLoading] = useState('');
  const toast = useToast();
  const isHeld = allocation.status === 'held';
  const isConfirmed = allocation.status === 'confirmed';

  const act = async (fn, label, msg) => {
    if (!isOnline) {
      toast.error('Offline', 'Action requires an active internet connection.');
      return;
    }
    setLoading(label);
    try {
      await fn(allocation.id);
      toast.success(msg);
    } catch (e) {
      toast.error('Action Failed', e.message);
    } finally {
      setLoading('');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`rounded-3xl border-2 overflow-hidden shadow-lg ${
        isConfirmed ? 'border-emerald-400 bg-emerald-50/50' : 'border-amber-300 bg-amber-50/50'
      }`}
    >
      {/* Banner */}
      <div className={`px-4.5 py-2.5 flex items-center gap-2 ${isConfirmed ? 'bg-emerald-600' : 'bg-amber-500'}`}>
        {isConfirmed ? (
          <CheckCircle className="w-4 h-4 text-white" />
        ) : (
          <Clock className="w-4 h-4 text-white animate-pulse" />
        )}
        <span className="text-white text-xs font-bold uppercase tracking-wider">
          {isConfirmed ? 'Parking Session Confirmed' : 'Slot Temporarily Reserved (3m Hold)'}
        </span>
        <span className="ml-auto text-white/90 text-xs font-bold">
          {allocation.zone_name}
        </span>
      </div>

      <div className="p-5 flex flex-col sm:flex-row gap-5 items-center">
        {isHeld && (
          <div className="flex-shrink-0">
            <HoldTimer expiresAt={allocation.expires_at} onExpired={onExpired} />
          </div>
        )}
        <div className="flex-1 w-full">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-2xl bg-white border-2 border-emerald-400 flex flex-col items-center justify-center shadow-md">
              <span className="text-xs font-bold text-emerald-600 uppercase tracking-tight">Bay</span>
              <span className="font-black text-2xl text-slate-900 leading-none">{allocation.slot_number}</span>
            </div>
            <div>
              <p className="font-extrabold text-slate-900 text-base">{allocation.zone_name}</p>
              <p className="text-xs font-semibold text-slate-500 capitalize mt-0.5">
                {allocation.slot_vehicle_type} Slot • Priority Allocated
              </p>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs text-emerald-700 font-bold">Navigation Route Active</span>
              </div>
            </div>
          </div>

          {isConfirmed && (
            <div className="bg-emerald-100/70 border border-emerald-200 rounded-2xl p-3 mb-4 flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <p className="text-xs text-emerald-800 font-medium">
                Vehicle parked. Tap <strong>Exit Parking</strong> when leaving the campus.
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2.5">
            <button
              onClick={onNavigate}
              className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-blue-600/20"
            >
              <Navigation className="w-4 h-4" />
              Navigate to Slot
            </button>

            {isHeld && (
              <>
                <button
                  onClick={() => act(onConfirm, 'confirm', 'Parking confirmed! 🎉')}
                  disabled={loading === 'confirm' || !isOnline}
                  className="flex-1 min-w-[130px] py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-600/20 disabled:opacity-60"
                >
                  {loading === 'confirm' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  Confirm Parked
                </button>
                <button
                  onClick={() => act(onCancel, 'cancel', 'Hold released.')}
                  disabled={loading === 'cancel' || !isOnline}
                  className="py-3 px-4 bg-white border border-slate-200 text-red-500 hover:bg-red-50 active:scale-98 rounded-2xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-60"
                >
                  {loading === 'cancel' ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                  Release
                </button>
              </>
            )}

            {isConfirmed && (
              <button
                onClick={() => act(onExit, 'exit', 'Exited. Safe drive! 🚗')}
                disabled={loading === 'exit' || !isOnline}
                className="flex-1 min-w-[130px] py-3 bg-slate-800 hover:bg-slate-900 active:scale-98 text-white rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md disabled:opacity-60"
              >
                {loading === 'exit' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                Exit Parking Bay
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ──────────────────────────────────────────────
// Queue Card
// ──────────────────────────────────────────────
function QueueCard({ queueEntry, onAccept, onDecline, isOnline }) {
  const [loading, setLoading] = useState('');
  const toast = useToast();
  const isOffered = queueEntry.status === 'offered';
  const [offerRemaining, setOfferRemaining] = useState(60);

  useEffect(() => {
    if (!isOffered || !queueEntry.offer_expires_at) return;
    const tick = () => {
      const diff = Math.max(0, Math.round((new Date(queueEntry.offer_expires_at) - Date.now()) / 1000));
      setOfferRemaining(diff);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isOffered, queueEntry.offer_expires_at]);

  const act = async (fn, label, msg) => {
    if (!isOnline) {
      toast.error('Offline', 'Action requires internet.');
      return;
    }
    setLoading(label);
    try {
      await fn(queueEntry.id);
      toast.success(msg);
    } catch (e) {
      toast.error('Failed', e.message);
    } finally {
      setLoading('');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-3xl border-2 p-5 shadow-sm ${
        isOffered ? 'border-emerald-500 bg-emerald-50' : 'border-sky-200 bg-sky-50'
      }`}
    >
      <div className="flex items-center gap-3.5 mb-3.5">
        <div className="w-13 h-13 rounded-2xl bg-white border border-sky-200 flex items-center justify-center shadow-sm">
          <span className="text-2xl font-black text-sky-600">#{queueEntry.queue_position}</span>
        </div>
        <div>
          <p className="font-extrabold text-slate-900 text-sm">{isOffered ? '🎉 Slot Allocated to You!' : 'Live Waiting Queue'}</p>
          <p className="text-xs text-slate-500 capitalize mt-0.5">{queueEntry.vehicle_type} Queue • FIFO Priority Order</p>
        </div>
      </div>

      {isOffered && (
        <div className="bg-white rounded-2xl border border-emerald-300 p-3.5 mb-3.5 shadow-sm">
          <p className="text-xs font-bold text-emerald-800">
            A slot has opened up! Claim your offer within <span className="tabular-nums text-emerald-600">{fmtTime(offerRemaining)}</span>.
          </p>
        </div>
      )}

      {isOffered && (
        <div className="flex gap-2.5">
          <button
            onClick={() => act(onAccept, 'accept', 'Slot claimed! Check your allocation.')}
            disabled={loading === 'accept' || !isOnline}
            className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white rounded-2xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-600/20 disabled:opacity-60"
          >
            {loading === 'accept' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
            Accept & Reserve
          </button>
          <button
            onClick={() => act(onDecline, 'decline', 'Slot declined.')}
            disabled={loading === 'decline' || !isOnline}
            className="flex-1 py-3 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 active:scale-98 rounded-2xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm disabled:opacity-60"
          >
            {loading === 'decline' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsDown className="w-4 h-4" />}
            Decline
          </button>
        </div>
      )}

      {!isOffered && (
        <p className="text-xs text-sky-700 bg-sky-100/70 rounded-2xl px-3.5 py-2.5 font-medium">
          You are in line. When an active hold expires or a vehicle departs, you will receive an automatic 60-second priority offer.
        </p>
      )}
    </motion.div>
  );
}

// ──────────────────────────────────────────────
// Separate Student & Staff Availability Summary
// ──────────────────────────────────────────────
function AvailabilityPanel({ availability, userRole }) {
  const isStaff = userRole === 'staff';
  const rows = (availability || []).filter(a => {
    if (isStaff) return a.staff_only === 1 || a.category === 'staff';
    return a.staff_only === 0;
  });

  const totAvail = rows.reduce((s, a) => s + (Number(a.available) || 0), 0);
  const totHeld  = rows.reduce((s, a) => s + (Number(a.held) || 0), 0);
  const totOcc   = rows.reduce((s, a) => s + (Number(a.occupied) || 0), 0);

  return (
    <div className="bg-white rounded-3xl border border-surface-200 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="font-extrabold text-slate-900 text-sm">
            {isStaff ? '🏢 Staff Parking Area' : '🎓 Student Parking Area'}
          </p>
          <p className="text-xs text-slate-400 font-medium">Authoritative real-time vacancy</p>
        </div>
        <span className="flex items-center gap-1 text-xs font-bold bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Live
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2.5 mb-4">
        {[
          { label: 'Available', value: totAvail, color: 'text-emerald-700 bg-emerald-50 border-emerald-100', icon: CheckCircle },
          { label: 'Reserved',  value: totHeld,  color: 'text-amber-700 bg-amber-50 border-amber-100',    icon: Clock },
          { label: 'Occupied',  value: totOcc,   color: 'text-rose-700 bg-rose-50 border-rose-100',       icon: XCircle },
        ].map(item => (
          <div key={item.label} className={`rounded-2xl p-3 flex flex-col items-center gap-1 border ${item.color}`}>
            <item.icon className="w-4 h-4 opacity-80" />
            <span className="text-2xl font-black tabular-nums tracking-tight">{item.value}</span>
            <span className="text-xs font-bold uppercase tracking-wider opacity-75">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Breakdown per vehicle type */}
      <div className="space-y-2">
        {['bike', 'car'].map(vt => {
          const vtRows = rows.filter(a => a.vehicle_type === vt);
          const avail = vtRows.reduce((s, a) => s + (Number(a.available) || 0), 0);
          const total = vtRows.reduce((s, a) => s + (Number(a.available) || 0) + (Number(a.held) || 0) + (Number(a.occupied) || 0), 0);
          if (total === 0) return null;
          const pct = total > 0 ? Math.round((avail / total) * 100) : 0;
          return (
            <div key={vt} className="flex items-center gap-3 text-xs">
              {vt === 'bike' ? (
                <div className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <Bike className="w-3.5 h-3.5 text-emerald-700" />
                </div>
              ) : (
                <div className="w-6 h-6 rounded-lg bg-sky-100 flex items-center justify-center flex-shrink-0">
                  <Car className="w-3.5 h-3.5 text-sky-700" />
                </div>
              )}
              <span className="text-slate-700 capitalize font-bold w-12">{vt}</span>
              <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${vt === 'bike' ? 'bg-emerald-500' : 'bg-sky-500'}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.8 }}
                />
              </div>
              <span className="font-extrabold text-slate-800 tabular-nums">{avail} / {total} free</span>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-100">
        {isStaff
          ? 'Staff accounts access Zone C (Cars) and Zone D (Bikes).'
          : 'Student accounts access Zone A (Bikes) and Zone B (Cars). Staff zones are strictly segregated.'}
      </p>
    </div>
  );
}

// ──────────────────────────────────────────────
// Main Student / Staff Dashboard Component
// ──────────────────────────────────────────────
export default function StudentDashboard() {
  const { user, logout } = useAuth();
  const { connected } = useSocket() || {};
  const isOnline = useOnlineStatus();
  const navigate = useNavigate();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [slots, setSlots] = useState([]);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('home');

  // Geo state
  const [geoState, setGeoState] = useState('idle');
  const [geoCoords, setGeoCoords] = useState(null);

  // Request state
  const [vehicleType, setVehicleType] = useState(user?.vehicleType || 'bike');
  const [requesting, setRequesting] = useState(false);
  const [route, setRoute] = useState(null);
  const [isReallocating, setIsReallocating] = useState(false);
  const [reallocationMsg, setReallocationMsg] = useState(null);

  // ── Load dashboard ──
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const dash = await studentApi.dashboard();
      setData(dash.data);

      try {
        const r = await fetch('/api/student/slots-map', { credentials: 'include' });
        if (r.ok) {
          const d = await r.json();
          setSlots(d.slots || []);
          if (d.zones) setZones(d.zones);
        }
      } catch {
        // use cached
      }

      if (dash.data?.activeAllocation?.slot_id && !route) {
        try {
          const res = await studentApi.route(dash.data.activeAllocation.slot_id);
          if (res.data?.route) setRoute(res.data.route);
        } catch {
          // fallback
        }
      }
    } catch (e) {
      if (!quiet) toast.error('Failed to load', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast, route]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Socket events ──
  useSocketEvent('slot:held',      () => load(true));
  useSocketEvent('slot:released',  () => load(true));
  useSocketEvent('slot:occupied',  () => load(true));
  useSocketEvent('slot:blocked',   () => load(true));
  useSocketEvent('slot:unblocked', () => load(true));
  useSocketEvent('demo:reset',     () => { load(true); setRoute(null); });

  useSocketEvent('allocation:reallocated', (payload) => {
    setIsReallocating(true);
    setReallocationMsg(payload?.message || 'Your slot was reallocated.');
    if (payload?.type === 'reallocated' && payload.slot) {
      setRoute(null);
    }
    setTimeout(() => setIsReallocating(false), 3000);
    load(true);
  });

  useSocketEvent('notification:new', () => load(true));

  // ── Geolocation ──
  const verifyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoState('error');
      return;
    }
    setGeoState('detecting');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setGeoCoords({ lat: latitude, lng: longitude, accuracy });
        studentApi.verifyLocation({ lat: latitude, lng: longitude, accuracy })
          .then(res => {
            if (res.data.insideParkingEntry) setGeoState('eligible');
            else if (res.data.status === 'inside_campus') setGeoState('campus');
            else if (res.data.status === 'accuracy_insufficient') setGeoState('inaccurate');
            else setGeoState('outside');
          })
          .catch(() => setGeoState('error'));
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setGeoState('denied');
        else setGeoState('error');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const demoVerify = useCallback(async () => {
    setGeoState('detecting');
    try {
      const demoLat = 11.0245, demoLng = 77.0072;
      await studentApi.verifyLocation({ lat: demoLat, lng: demoLng, accuracy: 5, isDemoMode: true });
      setGeoCoords({ lat: demoLat, lng: demoLng, accuracy: 5, demo: true });
      setGeoState('demo');
      toast.success('Entrance Simulated', 'Location locked to PSG Tech Main Gate.');
    } catch {
      setGeoState('eligible');
      setGeoCoords({ lat: 11.0245, lng: 77.0072, accuracy: 5, demo: true });
      toast.info('Demo Mode', 'Simulated at parking entrance.');
    }
  }, [toast]);

  // ── Request slot ──
  const requestSlot = useCallback(async () => {
    if (!geoCoords) return;
    if (!isOnline) {
      toast.error('Offline', 'Cannot allocate slot while offline.');
      return;
    }
    setRequesting(true);
    try {
      const res = await studentApi.requestSlot({
        vehicleType,
        lat: geoCoords.lat,
        lng: geoCoords.lng,
        accuracy: geoCoords.accuracy,
        isDemoMode: geoCoords.demo || false,
      });
      if (res.data.type === 'allocated') {
        toast.success(`Slot ${res.data.slot.slot_number} Allocated!`, '3 minutes hold timer initiated.');
        setRoute(res.data.route);
        setTab('myslot');
      } else if (res.data.type === 'queued') {
        toast.info('Added to Waiting Queue', `Position #${res.data.queuePosition}`);
        setTab('myslot');
      }
      load(true);
    } catch (e) {
      toast.error('Request Failed', e.message);
    } finally {
      setRequesting(false);
    }
  }, [geoCoords, vehicleType, isOnline, toast, load]);

  // ── Actions ──
  const confirmParking = useCallback(async (id) => {
    await studentApi.confirmParking(id);
    load(true);
  }, [load]);

  const cancelAllocation = useCallback(async (id) => {
    await studentApi.cancelAllocation(id);
    setRoute(null);
    load(true);
  }, [load]);

  const exitParking = useCallback(async (id) => {
    await studentApi.exitParking(id);
    setRoute(null);
    load(true);
  }, [load]);

  const acceptOffer = useCallback(async (id) => {
    const res = await studentApi.acceptQueueOffer(id);
    if (res.data?.route) setRoute(res.data.route);
    setTab('myslot');
    load(true);
  }, [load]);

  const declineOffer = useCallback(async (id) => {
    await studentApi.declineQueueOffer(id);
    load(true);
  }, [load]);

  const markNotificationsRead = async () => {
    await studentApi.markNotificationsRead().catch(() => {});
    load(true);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // ── Derived State ──
  const canRequest = (geoState === 'eligible' || geoState === 'demo')
    && !data?.activeAllocation
    && !data?.queueEntry
    && !requesting
    && isOnline;

  const requestDisabledReason = (() => {
    if (!isOnline) return 'Offline — Reconnect to request parking.';
    if (data?.activeAllocation) return 'You currently hold an active parking allocation.';
    if (data?.queueEntry) return 'You are currently in the waiting queue.';
    if (geoState === 'idle') return 'Please verify your location or use demo entrance.';
    if (geoState === 'detecting') return 'Acquiring GPS location…';
    if (geoState === 'campus') return 'Please approach the parking gate area to request.';
    if (geoState === 'outside') return 'You are outside the campus boundary.';
    if (geoState === 'inaccurate') return 'GPS accuracy is too low. Move to an open area.';
    if (geoState === 'denied') return 'Location permission denied by browser.';
    return null;
  })();

  const isStaff = user?.role === 'staff' || user?.user_category === 'staff';

  // 5 Bottom Navigation Tabs
  const tabs = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'map', icon: Map, label: 'Parking Map', badge: data?.activeAllocation ? 'LIVE' : null },
    { id: 'myslot', icon: ParkingCircle, label: 'My Slot', badge: data?.activeAllocation ? '!' : null },
    { id: 'history', icon: History, label: 'History' },
    { id: 'profile', icon: User, label: 'Profile' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-full border-4 border-emerald-200 border-t-emerald-600 animate-spin" />
          <p className="text-slate-700 font-bold text-sm">Initializing ParkPulse 2.0…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-50 flex flex-col font-sans">
      <OfflineNotice />

      {/* ── Mobile-First Header ── */}
      <header className="bg-white/95 backdrop-blur-md border-b border-surface-200 px-4 py-3 sticky top-0 z-30 shadow-xs">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <InitialsAvatar name={user?.name} size="sm" />
            <div>
              <p className="font-extrabold text-slate-900 text-sm leading-tight truncate max-w-[170px] sm:max-w-[220px]">
                {user?.name}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                  isStaff ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {isStaff ? 'Staff Privilege' : 'Student Privilege'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-full font-bold ${
              connected ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
            }`}>
              {connected ? <Wifi className="w-3 h-3 text-emerald-600" /> : <WifiOff className="w-3 h-3" />}
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
            </div>

            <button
              onClick={() => { setRefreshing(true); load(true); }}
              disabled={refreshing}
              aria-label="Refresh data"
              className="p-2 rounded-xl text-slate-500 hover:bg-surface-100 active:scale-95 transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-emerald-600' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Viewport Container ── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto px-4 py-4 space-y-4 pb-28">

          {/* Reallocation alert banner */}
          <AnimatePresence>
            {reallocationMsg && (
              <motion.div
                initial={{ opacity: 0, y: -16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 flex items-start gap-3 shadow-sm"
              >
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold text-amber-900 text-sm">Slot Reallocated</p>
                  <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">{reallocationMsg}</p>
                </div>
                <button onClick={() => setReallocationMsg(null)} className="text-amber-500 hover:text-amber-700 p-1">
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ══════════════════════════════════════════
              TAB 1: HOME
          ══════════════════════════════════════════ */}
          {tab === 'home' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              {/* Geofence verification status */}
              <LocationCard
                geoState={geoState}
                onVerify={verifyLocation}
                onDemoVerify={demoVerify}
                isOnline={isOnline}
              />

              {/* Active Allocation Quick Card if already holding slot */}
              {data?.activeAllocation && (
                <div className="bg-gradient-to-br from-emerald-600 to-teal-700 text-white rounded-3xl p-4.5 shadow-lg flex items-center justify-between">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center font-black text-xl">
                      {data.activeAllocation.slot_number}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-emerald-200 uppercase tracking-wider">Active Reservation</p>
                      <p className="text-sm font-extrabold">{data.activeAllocation.zone_name}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setTab('myslot')}
                    className="bg-white text-emerald-800 text-xs font-extrabold px-3 py-2 rounded-xl shadow-md active:scale-95 transition-all flex items-center gap-1"
                  >
                    <span>View Slot</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Vehicle selector */}
              {!data?.activeAllocation && !data?.queueEntry && (
                <div className="bg-white rounded-3xl border border-surface-200 p-4.5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">Vehicle Class</p>
                    <span className="text-xs font-semibold text-emerald-600">
                      {isStaff ? 'Staff Parking Area' : 'Student Parking Area'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { type: 'bike', label: 'Bike', icon: Bike, desc: isStaff ? 'Zone D' : 'Zone A' },
                      { type: 'car',  label: 'Car',  icon: Car,  desc: isStaff ? 'Zone C' : 'Zone B' },
                    ].map(v => {
                      const active = vehicleType === v.type;
                      return (
                        <button
                          key={v.type}
                          onClick={() => setVehicleType(v.type)}
                          className={`flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all active:scale-98 text-left ${
                            active
                              ? 'border-emerald-500 bg-emerald-50/60 shadow-sm'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                            active ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'
                          }`}>
                            <v.icon className="w-5 h-5" />
                          </div>
                          <div>
                            <span className={`block font-bold text-sm leading-tight ${active ? 'text-emerald-900' : 'text-slate-800'}`}>
                              {v.label}
                            </span>
                            <span className="text-[11px] text-slate-400 font-semibold">{v.desc}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Real-time Category Availability */}
              <AvailabilityPanel availability={data?.availability} userRole={user?.role} />

              {/* Big Request Button */}
              {!data?.activeAllocation && !data?.queueEntry && (
                <div className="space-y-2 pt-1">
                  <motion.button
                    whileTap={canRequest ? { scale: 0.98 } : {}}
                    onClick={requestSlot}
                    disabled={!canRequest || requesting}
                    id="request-slot-btn"
                    className={`w-full py-4 rounded-3xl font-extrabold text-base flex items-center justify-center gap-3 transition-all shadow-xl ${
                      canRequest
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/25 active:scale-98 cursor-pointer'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                    }`}
                  >
                    {requesting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Allocating Optimal Bay…</span>
                      </>
                    ) : (
                      <>
                        <ParkingCircle className="w-6 h-6" />
                        <span>Get My Parking Slot</span>
                      </>
                    )}
                  </motion.button>
                  {requestDisabledReason && !canRequest && (
                    <p className="text-xs text-center text-slate-400 font-medium px-2">
                      {requestDisabledReason}
                    </p>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* ══════════════════════════════════════════
              TAB 2: PARKING MAP
          ══════════════════════════════════════════ */}
          {tab === 'map' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              <ParkingMap
                slots={slots}
                zones={zones}
                myAllocation={data?.activeAllocation}
                route={route}
                user={user}
                isAdmin={false}
                isReallocating={isReallocating}
                onRefresh={() => load(true)}
              />
            </motion.div>
          )}

          {/* ══════════════════════════════════════════
              TAB 3: MY SLOT
          ══════════════════════════════════════════ */}
          {tab === 'myslot' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-extrabold text-slate-900 text-base">My Parking Slot</h2>
                <span className="text-xs text-slate-400 font-semibold">Active Session</span>
              </div>

              {data?.activeAllocation ? (
                <AllocationCard
                  allocation={data.activeAllocation}
                  onConfirm={confirmParking}
                  onCancel={cancelAllocation}
                  onExit={exitParking}
                  onExpired={() => load(true)}
                  onNavigate={() => setTab('map')}
                  isOnline={isOnline}
                />
              ) : data?.queueEntry ? (
                <QueueCard
                  queueEntry={data.queueEntry}
                  onAccept={acceptOffer}
                  onDecline={declineOffer}
                  isOnline={isOnline}
                />
              ) : (
                <div className="bg-white rounded-3xl border border-surface-200 p-8 text-center shadow-sm space-y-4">
                  <div className="w-16 h-16 rounded-3xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                    <ParkingCircle className="w-8 h-8" />
                  </div>
                  <div>
                    <p className="font-extrabold text-slate-800 text-base">No Active Slot</p>
                    <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                      Verify your location at the parking gate and request a slot to get turn-by-turn guidance.
                    </p>
                  </div>
                  <button
                    onClick={() => setTab('home')}
                    className="bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold text-xs py-3 px-6 rounded-2xl shadow-md shadow-emerald-600/20"
                  >
                    Go to Home & Request
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {/* ══════════════════════════════════════════
              TAB 4: HISTORY
          ══════════════════════════════════════════ */}
          {tab === 'history' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-extrabold text-slate-900 text-base">Parking History</h2>
                <span className="text-xs text-slate-400 font-semibold">Past Sessions</span>
              </div>

              {!data?.recentHistory?.length ? (
                <div className="bg-white rounded-3xl border border-surface-200 p-8 text-center shadow-sm">
                  <History className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                  <p className="text-slate-700 font-bold text-sm">No History Yet</p>
                  <p className="text-xs text-slate-400 mt-1">Completed parking records will appear here.</p>
                </div>
              ) : (
                data.recentHistory.map(h => (
                  <div key={h.id} className="bg-white rounded-2xl border border-surface-200 p-4 shadow-sm flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 text-slate-600">
                      <ParkingCircle className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 text-sm truncate">
                        Bay {h.slot_number} • {h.zone_name}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">{new Date(h.created_at).toLocaleString()}</p>
                    </div>
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider capitalize ${
                      h.status === 'confirmed' ? 'bg-emerald-100 text-emerald-800' :
                      h.status === 'cancelled' ? 'bg-rose-100 text-rose-700' :
                      h.status === 'expired'   ? 'bg-amber-100 text-amber-800' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {h.status}
                    </span>
                  </div>
                ))
              )}
            </motion.div>
          )}

          {/* ══════════════════════════════════════════
              TAB 5: PROFILE
          ══════════════════════════════════════════ */}
          {tab === 'profile' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="bg-white rounded-3xl border border-surface-200 p-5 shadow-sm text-center">
                <div className="mx-auto flex justify-center mb-3">
                  <InitialsAvatar name={user?.name} size="lg" />
                </div>
                <h3 className="font-black text-slate-900 text-lg">{user?.name}</h3>
                <p className="text-xs text-slate-500 font-medium">{user?.email}</p>

                <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Authoritative {isStaff ? 'Staff Account' : 'Student Account'}</span>
                </div>
              </div>

              {/* Account Details Card */}
              <div className="bg-white rounded-3xl border border-surface-200 p-5 shadow-sm space-y-3.5 text-xs">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <span className="text-slate-500 font-semibold">Campus</span>
                  <span className="font-bold text-slate-900">PSG College of Technology</span>
                </div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <span className="text-slate-500 font-semibold">Allowed Parking Area</span>
                  <span className="font-bold text-slate-900">
                    {isStaff ? 'Staff Parking (Zone C & D)' : 'Student Parking (Zone A & B)'}
                  </span>
                </div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <span className="text-slate-500 font-semibold">Registered Vehicle</span>
                  <span className="font-bold text-slate-900 capitalize">{user?.vehicleType || vehicleType}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-semibold">App Version</span>
                  <span className="font-bold text-emerald-600">ParkPulse v2.0 (PWA)</span>
                </div>
              </div>

              {/* Logout Action */}
              <button
                onClick={handleLogout}
                className="w-full py-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 font-bold text-xs flex items-center justify-center gap-2 hover:bg-rose-100 active:scale-98 transition-all shadow-xs"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out of Account</span>
              </button>
            </motion.div>
          )}

        </div>
      </main>

      {/* ── Fixed Bottom Navigation Bar (5 Mobile Tabs) ── */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-surface-200 z-40 safe-bottom">
        <div className="max-w-md mx-auto flex items-center justify-around">
          {tabs.map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 flex flex-col items-center gap-1 py-2.5 transition-colors relative active:scale-95 ${
                  active ? 'text-emerald-600 font-bold' : 'text-slate-400 hover:text-slate-600 font-medium'
                }`}
              >
                <div className="relative">
                  <t.icon className={`w-5 h-5 ${active ? 'stroke-[2.5px]' : 'stroke-2'}`} />
                  {t.badge && (
                    <span className="absolute -top-1 -right-2 bg-emerald-600 text-white text-[9px] px-1 rounded-full font-black leading-tight animate-pulse">
                      {t.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] tracking-tight">{t.label}</span>
                {active && (
                  <motion.div
                    layoutId="tab-indicator"
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-emerald-500 rounded-full"
                  />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* PWA Native & iOS Install Banner */}
      <PWAInstallBanner />
    </div>
  );
}
