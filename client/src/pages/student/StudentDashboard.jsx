// Student Dashboard — ParkPulse (v2 with Navigation Map + Role-based parking)
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Navigation, Car, Bike, CheckCircle, Clock, XCircle,
  Bell, LogOut, RefreshCw, AlertTriangle, Info, ChevronRight,
  ParkingCircle, History, Users, Loader2, Wifi, WifiOff,
  ArrowRight, Timer, Shield, Sparkles, X, ThumbsUp, ThumbsDown,
  LocateFixed, Home, Map
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket, useSocketEvent } from '../../contexts/SocketContext';
import { useToast } from '../../contexts/ToastContext';
import { studentApi } from '../../lib/api';
import ParkingMap from '../../components/ParkingMap';

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
  const sz = size === 'lg' ? 'w-14 h-14 text-xl' : 'w-9 h-9 text-sm';
  const colors = ['bg-emerald-100 text-emerald-700', 'bg-sky-100 text-sky-700', 'bg-violet-100 text-violet-700', 'bg-amber-100 text-amber-700'];
  const color = colors[(name?.charCodeAt(0) || 0) % colors.length];
  return (
    <div className={`${sz} ${color} rounded-full flex items-center justify-center font-bold flex-shrink-0`}>
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
          <span className={`text-3xl font-bold tabular-nums ${isDanger ? 'text-red-500' : isWarning ? 'text-amber-500' : 'text-emerald-600'}`}>
            {fmtTime(remaining)}
          </span>
          <span className="text-xs text-slate-400 font-medium">remaining</span>
        </div>
      </div>
      {isWarning && (
        <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          className={`text-xs font-semibold ${isDanger ? 'text-red-500' : 'text-amber-500'}`}>
          {isDanger ? '⚠ Slot expiring soon!' : 'Please confirm your parking'}
        </motion.p>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Geolocation card
// ──────────────────────────────────────────────
const GEO_STATES = {
  idle:       { icon: LocateFixed,    color: 'text-slate-400',   bg: 'bg-slate-50',    label: 'Location not checked',       desc: 'Tap to verify your location' },
  detecting:  { icon: Loader2,        color: 'text-sky-500',     bg: 'bg-sky-50',      label: 'Detecting location…',         desc: 'Using GPS, please wait' },
  eligible:   { icon: CheckCircle,    color: 'text-emerald-600', bg: 'bg-emerald-50',  label: 'At Parking Entrance ✓',       desc: 'You can request a slot now' },
  campus:     { icon: MapPin,         color: 'text-sky-500',     bg: 'bg-sky-50',      label: 'On Campus',                   desc: 'Move to the parking entrance to request' },
  outside:    { icon: XCircle,        color: 'text-red-500',     bg: 'bg-red-50',      label: 'Outside Campus',              desc: 'You must be near the parking entrance to request' },
  inaccurate: { icon: AlertTriangle,  color: 'text-amber-500',   bg: 'bg-amber-50',    label: 'GPS Accuracy Low',            desc: 'Move to open area and try again' },
  denied:     { icon: Shield,         color: 'text-red-500',     bg: 'bg-red-50',      label: 'Location Permission Denied',  desc: 'Allow location access in your browser settings' },
  error:      { icon: AlertTriangle,  color: 'text-amber-500',   bg: 'bg-amber-50',    label: 'Location Error',              desc: 'Could not get your location' },
  demo:       { icon: Sparkles,       color: 'text-violet-500',  bg: 'bg-violet-50',   label: 'Demo Location Active',        desc: 'Simulated parking-entry location used' },
};

function LocationCard({ geoState, onVerify, onDemoVerify }) {
  const cfg = GEO_STATES[geoState] || GEO_STATES.idle;
  const Icon = cfg.icon;
  return (
    <div className={`rounded-2xl border p-4 ${cfg.bg}`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cfg.bg}`}>
          <Icon className={`w-5 h-5 ${cfg.color} ${geoState === 'detecting' ? 'animate-spin' : ''}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-sm ${cfg.color}`}>{cfg.label}</p>
          <p className="text-xs text-slate-500 mt-0.5">{cfg.desc}</p>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={onVerify} disabled={geoState === 'detecting'}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50">
          <LocateFixed className="w-4 h-4" />
          {geoState === 'detecting' ? 'Detecting…' : 'Verify Location'}
        </button>
        <button onClick={onDemoVerify}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-violet-500 text-white text-sm font-semibold hover:bg-violet-600 transition-colors">
          <Sparkles className="w-4 h-4" />
          Demo Location
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Active Allocation Card
// ──────────────────────────────────────────────
function AllocationCard({ allocation, onConfirm, onCancel, onExit, onExpired, onNavigate }) {
  const [loading, setLoading] = useState('');
  const toast = useToast();
  const isHeld = allocation.status === 'held';
  const isConfirmed = allocation.status === 'confirmed';

  const act = async (fn, label, msg) => {
    setLoading(label);
    try { await fn(allocation.id); toast.success(msg); }
    catch (e) { toast.error('Action Failed', e.message); }
    finally { setLoading(''); }
  };

  return (
    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
      className={`rounded-2xl border-2 overflow-hidden ${isConfirmed ? 'border-emerald-400 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}>
      {/* Banner */}
      <div className={`px-4 py-2 flex items-center gap-2 ${isConfirmed ? 'bg-emerald-500' : 'bg-amber-500'}`}>
        {isConfirmed ? <CheckCircle className="w-4 h-4 text-white" /> : <Clock className="w-4 h-4 text-white animate-pulse" />}
        <span className="text-white text-sm font-bold">{isConfirmed ? 'Parking Confirmed' : 'Slot Temporarily Held'}</span>
        <span className="ml-auto text-white/80 text-xs">{allocation.zone_name} · {allocation.slot_number}</span>
      </div>

      <div className="p-4 flex flex-col sm:flex-row gap-4 items-center">
        {isHeld && (
          <div className="flex-shrink-0">
            <HoldTimer expiresAt={allocation.expires_at} onExpired={onExpired} />
          </div>
        )}
        <div className="flex-1 w-full">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-14 h-14 rounded-2xl bg-white border-2 border-amber-200 flex flex-col items-center justify-center shadow-sm">
              <ParkingCircle className="w-5 h-5 text-amber-500" />
              <span className="font-bold text-lg text-slate-800 leading-none">{allocation.slot_number}</span>
            </div>
            <div>
              <p className="font-bold text-slate-800">{allocation.zone_name}</p>
              <p className="text-sm text-slate-500 capitalize">{allocation.slot_vehicle_type} slot</p>
            </div>
          </div>

          {isConfirmed && (
            <p className="text-xs text-emerald-700 bg-emerald-100 rounded-xl px-3 py-2 mb-3">
              ✓ Your parking session is active. Click Exit when done.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {/* Navigate button — always shown when allocation exists */}
            <button onClick={onNavigate}
              className="flex items-center gap-1.5 py-2 px-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-semibold text-sm transition-colors">
              <Navigation className="w-4 h-4" />
              Navigate
            </button>

            {isHeld && (
              <>
                <button onClick={() => act(onConfirm, 'confirm', 'Parking confirmed! 🎉')}
                  disabled={loading === 'confirm'}
                  className="flex-1 min-w-[120px] py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60">
                  {loading === 'confirm' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  Confirm Parked
                </button>
                <button onClick={() => act(onCancel, 'cancel', 'Allocation cancelled.')}
                  disabled={loading === 'cancel'}
                  className="py-2.5 px-4 bg-white border border-slate-200 text-red-500 rounded-xl font-semibold text-sm flex items-center gap-1.5 hover:bg-red-50 transition-colors disabled:opacity-60">
                  {loading === 'cancel' ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                  Cancel
                </button>
              </>
            )}
            {isConfirmed && (
              <button onClick={() => act(onExit, 'exit', 'Exited. Safe drive! 🚗')}
                disabled={loading === 'exit'}
                className="flex-1 min-w-[120px] py-2.5 bg-slate-700 hover:bg-slate-800 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60">
                {loading === 'exit' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                Exit Parking
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
function QueueCard({ queueEntry, onAccept, onDecline }) {
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
    setLoading(label);
    try { await fn(queueEntry.id); toast.success(msg); }
    catch (e) { toast.error('Failed', e.message); }
    finally { setLoading(''); }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border-2 p-4 ${isOffered ? 'border-violet-400 bg-violet-50' : 'border-sky-200 bg-sky-50'}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-12 h-12 rounded-xl bg-white border border-sky-200 flex items-center justify-center">
          <span className="text-2xl font-bold text-sky-600">#{queueEntry.queue_position}</span>
        </div>
        <div>
          <p className="font-bold text-slate-800">{isOffered ? '🎉 Slot Offered!' : 'In Waiting Queue'}</p>
          <p className="text-sm text-slate-500 capitalize">{queueEntry.vehicle_type} · Position {queueEntry.queue_position}</p>
        </div>
      </div>
      {isOffered && (
        <div className="bg-white rounded-xl border border-violet-200 p-3 mb-3">
          <p className="text-sm font-semibold text-violet-700">
            A slot is available! Accept within {fmtTime(offerRemaining)}.
          </p>
        </div>
      )}
      {isOffered && (
        <div className="flex gap-2">
          <button onClick={() => act(onAccept, 'accept', 'Slot accepted! Check your allocation.')}
            disabled={loading === 'accept'}
            className="flex-1 py-2.5 bg-violet-500 hover:bg-violet-600 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60">
            {loading === 'accept' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
            Accept
          </button>
          <button onClick={() => act(onDecline, 'decline', 'Slot declined.')}
            disabled={loading === 'decline'}
            className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl font-semibold text-sm flex items-center justify-center gap-1.5 hover:bg-slate-50 transition-colors disabled:opacity-60">
            {loading === 'decline' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsDown className="w-4 h-4" />}
            Decline
          </button>
        </div>
      )}
      {!isOffered && (
        <p className="text-xs text-sky-600 bg-sky-100 rounded-xl px-3 py-2">
          You'll be notified when a slot becomes available.
        </p>
      )}
    </motion.div>
  );
}

// ──────────────────────────────────────────────
// Role-based availability summary
// ──────────────────────────────────────────────
function AvailabilityPanel({ availability, userRole }) {
  // Filter to role-appropriate zones
  const isStaff = userRole === 'staff';
  const rows = (availability || []).filter(a => {
    if (isStaff) return true; // staff see all
    return a.staff_only === 0; // students see only non-staff
  });

  const totAvail = rows.reduce((s, a) => s + (Number(a.available) || 0), 0);
  const totHeld  = rows.reduce((s, a) => s + (Number(a.held) || 0), 0);
  const totOcc   = rows.reduce((s, a) => s + (Number(a.occupied) || 0), 0);

  return (
    <div className="bg-white rounded-2xl border border-surface-200 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="font-semibold text-slate-700 text-sm">
          {isStaff ? '🏢 Staff Parking' : '🎓 Student Parking'} Availability
        </p>
        <span className="text-xs text-slate-400">Live</span>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { label: 'Available', value: totAvail, color: 'text-emerald-600 bg-emerald-50', icon: CheckCircle },
          { label: 'Held',      value: totHeld,  color: 'text-amber-600 bg-amber-50',    icon: Clock },
          { label: 'Occupied',  value: totOcc,   color: 'text-red-600 bg-red-50',         icon: XCircle },
        ].map(item => (
          <div key={item.label} className={`rounded-xl p-3 flex flex-col items-center gap-1 ${item.color}`}>
            <item.icon className="w-4 h-4" />
            <span className="text-2xl font-bold tabular-nums">{item.value}</span>
            <span className="text-xs font-medium">{item.label}</span>
          </div>
        ))}
      </div>
      {/* Per vehicle type */}
      <div className="space-y-1.5">
        {['bike', 'car'].map(vt => {
          const vtRows = rows.filter(a => a.vehicle_type === vt);
          const avail = vtRows.reduce((s, a) => s + (Number(a.available) || 0), 0);
          const total = vtRows.reduce((s, a) => s + (Number(a.available) || 0) + (Number(a.held) || 0) + (Number(a.occupied) || 0), 0);
          if (total === 0) return null;
          const pct = total > 0 ? Math.round((avail / total) * 100) : 0;
          return (
            <div key={vt} className="flex items-center gap-2 text-xs">
              {vt === 'bike' ? <Bike className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" /> : <Car className="w-3.5 h-3.5 text-sky-500 flex-shrink-0" />}
              <span className="text-slate-600 capitalize font-medium w-8">{vt}</span>
              <div className="flex-1 h-2 rounded-full bg-surface-100">
                <motion.div className="h-full rounded-full bg-emerald-400"
                  initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }} />
              </div>
              <span className="font-semibold text-slate-700">{avail}/{total}</span>
            </div>
          );
        })}
      </div>
      {!isStaff && (
        <p className="text-xs text-slate-400 mt-2 pt-2 border-t border-surface-100">
          Staff-only zones are not shown. Your allocation is restricted to student-eligible slots.
        </p>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Main Dashboard
// ──────────────────────────────────────────────
export default function StudentDashboard() {
  const { user, logout } = useAuth();
  const { connected } = useSocket() || {};
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
      // load slots for map
      try {
        const r = await fetch('/api/student/slots-map', { credentials: 'include' });
        if (r.ok) {
          const d = await r.json();
          setSlots(d.slots || []);
          if (d.zones) setZones(d.zones);
        }
      } catch {
        // fallback: no slot map data
      }

      // If active allocation exists but route is not loaded yet, fetch route
      if (dash.data?.activeAllocation?.slot_id && !route) {
        try {
          const res = await studentApi.route(dash.data.activeAllocation.slot_id);
          if (res.data?.route) setRoute(res.data.route);
        } catch {
          // handled by client fallback
        }
      }
    } catch (e) {
      if (!quiet) toast.error('Failed to load', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // ── Socket events ──
  useSocketEvent('slot:held',      () => load(true));
  useSocketEvent('slot:released',  () => load(true));
  useSocketEvent('slot:occupied',  () => load(true));
  useSocketEvent('slot:blocked',   () => load(true));
  useSocketEvent('slot:unblocked', () => load(true));
  useSocketEvent('demo:reset',     () => { load(true); setRoute(null); });

  useSocketEvent('allocation:reallocated', (payload) => {
    setIsReallocating(true);
    setReallocationMsg(payload?.message || 'Your slot has been reallocated.');
    if (payload?.type === 'reallocated' && payload.slot) {
      setRoute(null); // will be refreshed with new route
    }
    setTimeout(() => setIsReallocating(false), 3000);
    load(true);
  });

  useSocketEvent('notification:new', () => load(true));

  // ── Geolocation ──
  const verifyLocation = useCallback(() => {
    if (!navigator.geolocation) { setGeoState('error'); return; }
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
      toast.success('Demo location set', 'Simulated at parking entrance.');
    } catch {
      setGeoState('eligible');
      setGeoCoords({ lat: 11.0245, lng: 77.0072, accuracy: 5, demo: true });
      toast.info('Demo Mode', 'Location simulated at parking entrance.');
    }
  }, [toast]);

  // ── Request slot ──
  const requestSlot = useCallback(async () => {
    if (!geoCoords) return;
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
        toast.success(`Slot ${res.data.slot.slot_number} Allocated!`, '3 minutes to confirm parking.');
        setRoute(res.data.route);
        setTab('map'); // Auto-switch to map tab
      } else if (res.data.type === 'queued') {
        toast.info('Added to Queue', `Position #${res.data.queuePosition}`);
      }
      load(true);
    } catch (e) {
      toast.error('Request Failed', e.message);
    } finally {
      setRequesting(false);
    }
  }, [geoCoords, vehicleType, toast, load]);

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
    setTab('map');
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

  // ── Derived ──
  const canRequest = (geoState === 'eligible' || geoState === 'demo')
    && !data?.activeAllocation
    && !data?.queueEntry
    && !requesting;

  const requestDisabledReason = (() => {
    if (data?.activeAllocation) return 'You already have an active allocation.';
    if (data?.queueEntry) return 'You are already in the queue.';
    if (geoState === 'idle') return 'Please verify your location first.';
    if (geoState === 'detecting') return 'Detecting location…';
    if (geoState === 'campus') return 'Move closer to the parking entrance.';
    if (geoState === 'outside') return 'You must be inside the campus geofence.';
    if (geoState === 'inaccurate') return 'GPS accuracy too low. Move to open area.';
    if (geoState === 'denied') return 'Location permission denied.';
    return null;
  })();

  const unreadCount = data?.unreadCount || 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-full border-4 border-emerald-200 border-t-emerald-500 animate-spin" />
          <p className="text-slate-500 font-semibold">Loading your dashboard…</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'map', icon: Map, label: 'Map', badge: data?.activeAllocation ? '!' : null },
    { id: 'history', icon: History, label: 'History' },
    { id: 'notifications', icon: Bell, label: 'Alerts', badge: unreadCount > 0 ? unreadCount : null },
  ];

  const isStaff = user?.role === 'staff';

  return (
    <div className="min-h-screen bg-surface-50 flex flex-col">
      {/* Top Bar */}
      <header className="bg-white border-b border-surface-200 px-4 py-3 sticky top-0 z-40">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <InitialsAvatar name={user?.name} size="md" />
            <div>
              <p className="font-bold text-slate-800 text-sm leading-tight">{user?.name}</p>
              <div className="flex items-center gap-1.5">
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${isStaff ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700'}`}>
                  {isStaff ? '🏢 Staff' : '🎓 Student'}
                </span>
                <span className="text-xs text-slate-400">PSG College of Technology</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:flex items-center gap-1 text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-1 rounded-full">
              🔬 Demo
            </span>
            <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full font-semibold ${connected ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
              {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
            </div>
            <button onClick={() => { setRefreshing(true); load(true); }} disabled={refreshing}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-surface-100 transition-colors">
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={handleLogout}
              className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-5 space-y-4 pb-24">

          {/* Reallocation banner */}
          <AnimatePresence>
            {reallocationMsg && (
              <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
                className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-amber-800">Slot Reallocated</p>
                  <p className="text-sm text-amber-700 mt-0.5">{reallocationMsg}</p>
                </div>
                <button onClick={() => setReallocationMsg(null)} className="text-amber-400 hover:text-amber-600">
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ──── HOME TAB ──── */}
          {tab === 'home' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <LocationCard geoState={geoState} onVerify={verifyLocation} onDemoVerify={demoVerify} />

              <AnimatePresence mode="wait">
                {data?.activeAllocation && (
                  <AllocationCard
                    key="alloc"
                    allocation={data.activeAllocation}
                    onConfirm={confirmParking}
                    onCancel={cancelAllocation}
                    onExit={exitParking}
                    onExpired={() => load(true)}
                    onNavigate={() => setTab('map')}
                  />
                )}
                {data?.queueEntry && !data?.activeAllocation && (
                  <QueueCard
                    key="queue"
                    queueEntry={data.queueEntry}
                    onAccept={acceptOffer}
                    onDecline={declineOffer}
                  />
                )}
              </AnimatePresence>

              {/* Vehicle selector (only when no active allocation/queue) */}
              {!data?.activeAllocation && !data?.queueEntry && (
                <div className="bg-white rounded-2xl border border-surface-200 p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-slate-600">Select Vehicle Type</p>
                    <span className="text-xs text-slate-400 capitalize">{isStaff ? 'Staff' : 'Student'} slots only</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { type: 'bike', label: 'Bike', icon: Bike, color: 'emerald' },
                      { type: 'car',  label: 'Car',  icon: Car,  color: 'sky' },
                    ].map(v => {
                      const active = vehicleType === v.type;
                      return (
                        <button key={v.type} onClick={() => setVehicleType(v.type)}
                          className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                            active ? `border-${v.color}-400 bg-${v.color}-50` : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}>
                          <v.icon className={`w-8 h-8 ${active ? `text-${v.color}-500` : 'text-slate-400'}`} />
                          <span className={`font-bold text-sm ${active ? `text-${v.color}-700` : 'text-slate-500'}`}>{v.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Availability */}
              <AvailabilityPanel availability={data?.availability} userRole={user?.role} />

              {/* Request Button */}
              {!data?.activeAllocation && !data?.queueEntry && (
                <div className="space-y-2">
                  <motion.button
                    whileHover={canRequest ? { scale: 1.02 } : {}}
                    whileTap={canRequest ? { scale: 0.98 } : {}}
                    onClick={requestSlot}
                    disabled={!canRequest || requesting}
                    id="request-slot-btn"
                    className={`w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all shadow-lg ${
                      canRequest
                        ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-200'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
                    }`}>
                    {requesting
                      ? <><Loader2 className="w-5 h-5 animate-spin" />Finding Your Slot…</>
                      : <><ParkingCircle className="w-6 h-6" />Get My Parking Slot</>}
                  </motion.button>
                  {requestDisabledReason && !canRequest && (
                    <p className="text-xs text-center text-slate-400">{requestDisabledReason}</p>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* ──── MAP TAB ──── */}
          {tab === 'map' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
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

          {/* ──── HISTORY TAB ──── */}
          {tab === 'history' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              <h2 className="font-bold text-slate-800">Parking History</h2>
              {!data?.recentHistory?.length ? (
                <div className="bg-white rounded-2xl border border-surface-200 p-8 text-center">
                  <History className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-slate-500 font-medium">No history yet</p>
                  <p className="text-sm text-slate-400">Completed sessions will appear here.</p>
                </div>
              ) : data.recentHistory.map(h => (
                <div key={h.id} className="bg-white rounded-2xl border border-surface-200 p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                      <ParkingCircle className="w-5 h-5 text-slate-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800">{h.slot_number} · {h.zone_name}</p>
                      <p className="text-xs text-slate-400">{new Date(h.created_at).toLocaleString()}</p>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full capitalize ${
                      h.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' :
                      h.status === 'cancelled' ? 'bg-red-100 text-red-600' :
                      h.status === 'expired'   ? 'bg-amber-100 text-amber-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>{h.status}</span>
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {/* ──── NOTIFICATIONS TAB ──── */}
          {tab === 'notifications' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-slate-800">Notifications</h2>
                {unreadCount > 0 && (
                  <button onClick={markNotificationsRead} className="text-xs text-emerald-600 font-semibold hover:underline">
                    Mark all read
                  </button>
                )}
              </div>
              {!data?.notifications?.length ? (
                <div className="bg-white rounded-2xl border border-surface-200 p-8 text-center">
                  <Bell className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-slate-500 font-medium">No notifications</p>
                </div>
              ) : data.notifications.map(n => (
                <div key={n.id} className={`bg-white rounded-2xl border p-4 shadow-sm ${!n.is_read ? 'border-emerald-200' : 'border-surface-200'}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${n.is_read ? 'bg-slate-200' : 'bg-emerald-500'}`} />
                    <div className="flex-1">
                      <p className="font-semibold text-slate-800 text-sm">{n.title}</p>
                      <p className="text-sm text-slate-500 mt-0.5">{n.message}</p>
                      <p className="text-xs text-slate-400 mt-1">{new Date(n.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </div>
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-surface-200 z-40">
        <div className="max-w-lg mx-auto flex">
          {tabs.map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); if (t.id === 'notifications') markNotificationsRead(); }}
                className={`flex-1 flex flex-col items-center gap-1 py-2.5 transition-colors relative ${active ? 'text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <div className="relative">
                  <t.icon className="w-5 h-5" />
                  {t.badge && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold leading-none">
                      {t.badge === '!' ? '!' : t.badge > 9 ? '9+' : t.badge}
                    </span>
                  )}
                </div>
                <span className="text-xs font-medium">{t.label}</span>
                {active && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-emerald-500 rounded-full" />}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
