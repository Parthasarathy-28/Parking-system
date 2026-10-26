// Admin Sensor Simulation Page
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Radio, Car, Bike, Activity, CheckCircle, AlertTriangle,
  ArrowRight, Loader2, RefreshCw, Info, Zap, X
} from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import DigitalTwin from '../../components/DigitalTwin';
import { adminApi } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';
import { useSocketEvent } from '../../contexts/SocketContext';

const EVENTS = [
  {
    type: 'vehicle_entered',
    label: 'Vehicle Entered',
    desc: 'Marks slot as occupied. A vehicle has arrived.',
    icon: Car,
    color: 'bg-emerald-500 text-white hover:bg-emerald-600',
    badge: 'bg-emerald-100 text-emerald-700',
  },
  {
    type: 'vehicle_exited',
    label: 'Vehicle Exited',
    desc: 'Vehicle has left. Slot becomes free if no confirmed session.',
    icon: ArrowRight,
    color: 'bg-sky-500 text-white hover:bg-sky-600',
    badge: 'bg-sky-100 text-sky-700',
  },
  {
    type: 'unexpected_occupancy',
    label: 'Unexpected Occupancy',
    desc: '🔥 KEY DEMO: Another vehicle took the slot. Triggers automatic reallocation for the held student.',
    icon: AlertTriangle,
    color: 'bg-amber-500 text-white hover:bg-amber-600',
    badge: 'bg-amber-100 text-amber-700',
    highlight: true,
  },
  {
    type: 'slot_unavailable',
    label: 'Slot Unavailable',
    desc: 'Sets slot to maintenance mode. No new allocations.',
    icon: X,
    color: 'bg-red-500 text-white hover:bg-red-600',
    badge: 'bg-red-100 text-red-700',
  },
  {
    type: 'slot_available',
    label: 'Slot Available',
    desc: 'Restores slot to available/free. Triggers queue processing.',
    icon: CheckCircle,
    color: 'bg-primary-500 text-white hover:bg-primary-600',
    badge: 'bg-emerald-100 text-emerald-700',
  },
];

function EventLog({ events }) {
  if (events.length === 0) return (
    <div className="flex flex-col items-center gap-2 py-8 text-slate-400">
      <Radio className="w-8 h-8 text-slate-300" />
      <p className="text-sm">No events simulated yet</p>
    </div>
  );

  return (
    <div className="space-y-2 max-h-60 overflow-y-auto">
      <AnimatePresence>
        {events.map((ev, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-start gap-2.5 text-sm"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 flex-shrink-0 mt-1.5" />
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-slate-700">{ev.slot}</span>
              <span className="text-slate-400 mx-1">·</span>
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${EVENTS.find(e => e.type === ev.type)?.badge || 'bg-slate-100 text-slate-600'}`}>
                {ev.type.replace(/_/g, ' ')}
              </span>
            </div>
            <span className="text-xs text-slate-400 flex-shrink-0">{ev.time}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export default function AdminSensor() {
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [simulating, setSimulating] = useState('');
  const [log, setLog] = useState([]);
  const [notes, setNotes] = useState('');
  const toast = useToast();

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await adminApi.slots();
      setSlots(res.data.slots);
    } catch (e) {
      if (!quiet) toast.error('Failed to load slots', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);
  useSocketEvent('slot:held', () => load(true));
  useSocketEvent('slot:released', () => load(true));
  useSocketEvent('slot:occupied', () => load(true));
  useSocketEvent('slot:blocked', () => load(true));
  useSocketEvent('slot:unblocked', () => load(true));

  const simulate = async (eventType) => {
    if (!selectedSlot) {
      toast.warning('No slot selected', 'Click a slot in the grid to select it.');
      return;
    }
    setSimulating(eventType);
    try {
      const res = await adminApi.simulateOccupancy({ slotId: selectedSlot.id, eventType, notes: notes || undefined });
      toast.success('Event Simulated', res.data.message);
      setLog(prev => [{
        slot: selectedSlot.slot_number,
        type: eventType,
        time: new Date().toLocaleTimeString(),
      }, ...prev].slice(0, 20));
      load(true);
    } catch (e) {
      toast.error('Simulation Failed', e.message);
    } finally {
      setSimulating('');
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-10 h-10 rounded-full border-4 border-primary-200 border-t-primary-500 animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Sensor Simulator</h2>
            <p className="text-sm text-slate-400">Simulate IoT sensor events to test real-time behaviour and auto-reallocation.</p>
          </div>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-surface-200 text-sm font-semibold text-slate-600 bg-white hover:bg-surface-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Info */}
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
          <Info className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-700">
            <p className="font-semibold">Demo Mode — Simulated Sensor Events</p>
            <p>In production, these would come from real IoT sensors. Click a slot in the digital twin below to select it, then fire an event. Watch the student dashboard update in real-time!</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Event Controls */}
          <div className="space-y-4">
            {/* Selected slot */}
            <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Selected Slot</p>
              {selectedSlot ? (
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-primary-50 border-2 border-primary-200 flex flex-col items-center justify-center">
                    <ParkingCircleIcon className="w-4 h-4 text-primary-500" />
                    <span className="font-bold text-sm text-primary-700">{selectedSlot.slot_number}</span>
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">{selectedSlot.slot_number}</p>
                    <p className="text-xs text-slate-400">{selectedSlot.zone_name} · {selectedSlot.vehicle_type} · P{selectedSlot.allocation_priority}</p>
                    <div className="flex gap-1 mt-1">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${
                        selectedSlot.occupancy_status === 'free' ? 'bg-emerald-100 text-emerald-700' :
                        selectedSlot.occupancy_status === 'held' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>{selectedSlot.occupancy_status}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">{selectedSlot.operational_status}</span>
                    </div>
                  </div>
                  <button onClick={() => setSelectedSlot(null)} className="ml-auto p-1.5 rounded-lg text-slate-400 hover:bg-surface-100">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1 py-4 text-slate-400">
                  <Radio className="w-6 h-6 text-slate-300" />
                  <p className="text-sm font-medium">No slot selected</p>
                  <p className="text-xs">Click a slot in the grid below</p>
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-4">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wide block mb-2">Notes (optional)</label>
              <input
                type="text"
                placeholder="Reason for event…"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full border border-surface-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary-400"
              />
            </div>

            {/* Event Buttons */}
            <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Fire Event</p>
              <div className="space-y-2">
                {EVENTS.map(ev => (
                  <motion.button
                    key={ev.type}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => simulate(ev.type)}
                    disabled={!selectedSlot || simulating === ev.type}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left text-sm font-semibold transition-all disabled:opacity-50 ${
                      ev.highlight ? `${ev.color} ring-2 ring-amber-300 ring-offset-1` : ev.color
                    }`}
                  >
                    {simulating === ev.type
                      ? <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                      : <ev.icon className="w-4 h-4 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p>{ev.label}</p>
                      <p className="text-xs opacity-80 font-normal mt-0.5 truncate">{ev.desc.replace('🔥 KEY DEMO: ', '')}</p>
                    </div>
                    {ev.highlight && <Zap className="w-4 h-4 flex-shrink-0 text-amber-200" />}
                  </motion.button>
                ))}
              </div>
              {!selectedSlot && (
                <p className="text-xs text-slate-400 text-center mt-3">← Select a slot to enable events</p>
              )}
            </div>

            {/* Event Log */}
            <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Event Log</p>
                {log.length > 0 && (
                  <button onClick={() => setLog([])} className="text-xs text-red-400 hover:text-red-600">Clear</button>
                )}
              </div>
              <EventLog events={log} />
            </div>
          </div>

          {/* Digital Twin */}
          <div className="lg:col-span-2">
            <DigitalTwin
              slots={slots}
              isAdmin={true}
              onRefresh={() => load(true)}
            />
            <p className="text-xs text-slate-400 text-center mt-2">
              Click any slot in the grid above to select it for sensor simulation
            </p>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

// Inline icon since ParkingCircle is from lucide
function ParkingCircleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9 17V7h4a3 3 0 0 1 0 6H9" />
    </svg>
  );
}
