// Digital Twin - Interactive parking lot visualization
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Car, Bike, X, Info, Lock, Wrench, MapPin, Navigation } from 'lucide-react';
import { useSocketEvent } from '../contexts/SocketContext';
import { adminApi } from '../lib/api';
import { useToast } from '../contexts/ToastContext';

// Status config
const STATUS = {
  free_available:    { color: '#10b981', bg: '#dcfce7', border: '#6ee7b7', label: 'Available',    text: '#065f46' },
  held_available:    { color: '#f59e0b', bg: '#fef3c7', border: '#fbbf24', label: 'Held',          text: '#78350f' },
  occupied_available:{ color: '#ef4444', bg: '#fee2e2', border: '#fca5a5', label: 'Occupied',      text: '#7f1d1d' },
  free_blocked:      { color: '#94a3b8', bg: '#f1f5f9', border: '#cbd5e1', label: 'Blocked',       text: '#475569' },
  free_maintenance:  { color: '#f97316', bg: '#ffedd5', border: '#fdba74', label: 'Maintenance',   text: '#7c2d12' },
};

function getSlotStatus(slot) {
  const key = `${slot.occupancy_status}_${slot.operational_status}`;
  return STATUS[key] || STATUS['free_available'];
}

function SlotIcon({ vehicleType, size = 14 }) {
  return vehicleType === 'bike'
    ? <Bike size={size} />
    : <Car size={size} />;
}

// Slot cell component
function SlotCell({ slot, isSelected, onSelect, highlightPath, isMySlot, isAdmin, onAdminAction }) {
  const status = getSlotStatus(slot);
  const inPath = highlightPath?.includes(slot.id);
  const [justChanged, setJustChanged] = useState(false);

  useEffect(() => {
    setJustChanged(true);
    const t = setTimeout(() => setJustChanged(false), 600);
    return () => clearTimeout(t);
  }, [slot.occupancy_status, slot.operational_status]);

  return (
    <motion.button
      layout
      initial={false}
      animate={{
        backgroundColor: status.bg,
        borderColor: isSelected || isMySlot ? '#10b981' : status.border,
        scale: justChanged ? [1, 1.08, 1] : 1,
      }}
      transition={{ duration: 0.3 }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.97 }}
      onClick={() => onSelect(slot)}
      className={`relative rounded-xl border-2 flex flex-col items-center justify-center gap-1 cursor-pointer
        ${slot.vehicle_type === 'bike' ? 'w-14 h-10' : 'w-16 h-12'}
        ${isMySlot ? 'ring-2 ring-primary-500 ring-offset-1 slot-glow' : ''}
        ${inPath ? 'ring-2 ring-secondary-400 ring-offset-1' : ''}
      `}
      style={{ backgroundColor: status.bg, borderColor: isSelected || isMySlot ? '#10b981' : status.border }}
      aria-label={`Slot ${slot.slot_number} – ${status.label}`}
      title={`${slot.slot_number}: ${status.label}`}
    >
      <SlotIcon vehicleType={slot.vehicle_type} size={slot.vehicle_type === 'bike' ? 11 : 13} />
      <span className="text-xs font-700 tabular-nums" style={{ color: status.text }}>{slot.slot_number}</span>
      {isMySlot && (
        <motion.div
          className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-primary-500 rounded-full flex items-center justify-center"
          animate={{ scale: [1, 1.3, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
        >
          <span className="text-white text-xs">★</span>
        </motion.div>
      )}
    </motion.button>
  );
}

// Detail side sheet
function SlotDetailSheet({ slot, onClose, isAdmin, onSimulateEvent }) {
  if (!slot) return null;
  const status = getSlotStatus(slot);
  const [simLoading, setSimLoading] = useState(false);
  const toast = useToast();

  const simulateEvents = [
    { type: 'vehicle_entered',     label: 'Vehicle Entered',       color: 'bg-primary-500 text-white' },
    { type: 'vehicle_exited',      label: 'Vehicle Exited',        color: 'bg-secondary-500 text-white' },
    { type: 'unexpected_occupancy',label: 'Unexpected Occupancy',  color: 'bg-amber-500 text-white' },
    { type: 'slot_unavailable',    label: 'Mark Unavailable',      color: 'bg-red-500 text-white' },
    { type: 'slot_available',      label: 'Mark Available',        color: 'bg-primary-500 text-white' },
  ];

  const handleSim = async (eventType) => {
    setSimLoading(true);
    try {
      await adminApi.simulateOccupancy({ slotId: slot.id, eventType });
      toast.success('Event Simulated', `${eventType} for ${slot.slot_number}`);
      onSimulateEvent && onSimulateEvent();
    } catch (e) {
      toast.error('Simulation Failed', e.message);
    } finally {
      setSimLoading(false);
    }
  };

  const handleBlock = async () => {
    try {
      await adminApi.blockSlot(slot.id, { action: 'block_after_session' });
      toast.success('Slot Blocked', `${slot.slot_number} will be blocked after current session.`);
      onSimulateEvent && onSimulateEvent();
    } catch (e) { toast.error('Block Failed', e.message); }
  };

  const handleUnblock = async () => {
    try {
      await adminApi.unblockSlot(slot.id);
      toast.success('Slot Unblocked', `${slot.slot_number} is now available.`);
      onSimulateEvent && onSimulateEvent();
    } catch (e) { toast.error('Unblock Failed', e.message); }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      className="absolute right-0 top-0 bottom-0 w-72 bg-white border-l border-surface-200 shadow-card-lg rounded-r-2xl z-20 overflow-y-auto"
    >
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: status.bg }}>
              <SlotIcon vehicleType={slot.vehicle_type} size={18} />
            </div>
            <div>
              <p className="font-800 text-slate-800 text-lg">{slot.slot_number}</p>
              <span className="text-xs font-600 px-2 py-0.5 rounded-full" style={{ backgroundColor: status.bg, color: status.text }}>
                {status.label}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-surface-100" aria-label="Close details">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2 text-sm mb-4">
          <Row label="Vehicle type" value={slot.vehicle_type === 'bike' ? '🚲 Bike' : '🚗 Car'} />
          <Row label="Zone" value={slot.zone_name || slot.zone_id} />
          <Row label="Priority" value={`#${slot.allocation_priority}`} />
          <Row label="Operational" value={slot.operational_status} />
          <Row label="Occupancy" value={slot.occupancy_status} />
          {slot.allocated_user_name && <Row label="Allocated to" value={slot.allocated_user_name} />}
          <Row label="Last updated" value={slot.last_updated ? new Date(slot.last_updated).toLocaleTimeString() : '-'} />
        </div>

        {isAdmin && (
          <>
            <div className="border-t border-surface-200 pt-3 mb-3">
              <p className="text-xs font-700 text-slate-400 uppercase tracking-wide mb-2">Slot Control</p>
              <div className="flex gap-2">
                {slot.operational_status !== 'blocked' ? (
                  <button onClick={handleBlock} className="flex-1 text-xs bg-surface-100 hover:bg-red-50 text-red-600 border border-red-200 py-2 rounded-lg font-600 transition-colors flex items-center justify-center gap-1">
                    <Lock className="w-3.5 h-3.5" /> Block
                  </button>
                ) : (
                  <button onClick={handleUnblock} className="flex-1 text-xs bg-primary-50 hover:bg-primary-100 text-primary-600 border border-primary-200 py-2 rounded-lg font-600 transition-colors">
                    Unblock
                  </button>
                )}
              </div>
            </div>

            <div>
              <p className="text-xs font-700 text-slate-400 uppercase tracking-wide mb-2">Simulated Sensor Events</p>
              <div className="space-y-1.5">
                {simulateEvents.map(ev => (
                  <button
                    key={ev.type}
                    onClick={() => handleSim(ev.type)}
                    disabled={simLoading}
                    className={`w-full text-xs py-2 rounded-lg font-600 transition-opacity disabled:opacity-60 ${ev.color}`}
                  >
                    {ev.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-slate-400">{label}</span>
      <span className="font-600 text-slate-700 capitalize">{value}</span>
    </div>
  );
}

// Legend
function Legend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs">
      {Object.entries(STATUS).slice(0, 5).map(([key, s]) => (
        <div key={key} className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm border" style={{ backgroundColor: s.bg, borderColor: s.border }} />
          <span className="text-slate-500">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

// Route path visualization helper
function getPathLabel(nodeId) {
  if (nodeId === 'entrance') return 'Entry';
  if (nodeId === 'exit') return 'Exit';
  if (nodeId.startsWith('lane-')) return nodeId.replace('lane-', '').replace(/-/g, ' ').toUpperCase();
  return nodeId;
}

export default function DigitalTwin({ slots = [], isAdmin = false, myAllocation = null, route = null, onRefresh }) {
  const [selected, setSelected] = useState(null);
  const [listView, setListView] = useState(false);
  const toast = useToast();

  // Listen to real-time slot events
  useSocketEvent('slot:held', () => onRefresh?.());
  useSocketEvent('slot:released', () => onRefresh?.());
  useSocketEvent('slot:occupied', () => onRefresh?.());
  useSocketEvent('slot:blocked', () => onRefresh?.());
  useSocketEvent('slot:unblocked', () => onRefresh?.());

  const zoneA = slots.filter(s => s.slot_number?.startsWith('A'));
  const zoneB = slots.filter(s => s.slot_number?.startsWith('B'));
  const zoneC = slots.filter(s => s.slot_number?.startsWith('C'));

  const mySlotId = myAllocation?.slot_id;
  const routePath = route?.path || [];

  const slotsByZone = [
    { label: 'Zone A – Bikes', color: '#10b981', bg: '#dcfce7', slots: zoneA, cols: 4 },
    { label: 'Zone B – Cars',  color: '#3b82f6', bg: '#dbeafe', slots: zoneB, cols: 3 },
    { label: 'Zone C – Staff Reserved', color: '#8b5cf6', bg: '#ede9fe', slots: zoneC, cols: 4 },
  ];

  return (
    <div className="bg-white rounded-3xl border border-surface-200 shadow-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-surface-200">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary-500" />
          <span className="font-700 text-slate-800">Parking Digital Twin</span>
          {isAdmin && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-600">Admin View</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setListView(!listView)}
            className="text-xs text-slate-500 hover:text-slate-700 border border-surface-200 px-2.5 py-1 rounded-lg transition-colors"
          >
            {listView ? 'Grid View' : 'List View'}
          </button>
          <button onClick={onRefresh} className="text-xs text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-surface-100">
            ↺
          </button>
        </div>
      </div>

      {/* Route breadcrumb */}
      {routePath.length > 0 && (
        <div className="px-5 py-2 bg-secondary-50 border-b border-secondary-100 flex items-center gap-2 overflow-x-auto text-xs">
          <Navigation className="w-3.5 h-3.5 text-secondary-500 flex-shrink-0" />
          <span className="text-secondary-600 font-600">Route:</span>
          {routePath.map((node, i) => (
            <span key={node} className="flex items-center gap-1 text-secondary-700 whitespace-nowrap">
              {i > 0 && <span className="text-secondary-300">›</span>}
              <span className={node === mySlotId ? 'font-700 text-primary-600' : ''}>{getPathLabel(node)}</span>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        {/* Grid/List view */}
        {!listView ? (
          <div className="p-5 overflow-x-auto">
            {/* Entrance label */}
            <div className="flex items-center gap-2 mb-4">
              <div className="px-3 py-1.5 bg-surface-100 border border-surface-300 rounded-full text-xs font-700 text-slate-600 flex items-center gap-1.5">
                <span>⬇</span> ENTRANCE
              </div>
              <div className="flex-1 h-px bg-surface-200" />
              <div className="px-3 py-1.5 bg-surface-100 border border-surface-300 rounded-full text-xs font-700 text-slate-600 flex items-center gap-1.5">
                EXIT <span>⬆</span>
              </div>
            </div>

            {slotsByZone.map(zone => (
              <div key={zone.label} className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: zone.bg, border: `1.5px solid ${zone.color}` }} />
                  <p className="text-sm font-700 text-slate-600">{zone.label}</p>
                  <div className="flex-1 h-px bg-surface-200" />
                  <p className="text-xs text-slate-400">
                    {zone.slots.filter(s => s.occupancy_status === 'free' && s.operational_status === 'available').length} free / {zone.slots.length}
                  </p>
                </div>
                <div className={`flex flex-wrap gap-2`}>
                  {zone.slots.map(slot => (
                    <SlotCell
                      key={slot.id}
                      slot={slot}
                      isSelected={selected?.id === slot.id}
                      isMySlot={slot.id === mySlotId}
                      isAdmin={isAdmin}
                      highlightPath={routePath}
                      onSelect={setSelected}
                      onAdminAction={onRefresh}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Legend */}
            <div className="mt-4 pt-4 border-t border-surface-200">
              <Legend />
            </div>
          </div>
        ) : (
          /* List view for accessibility */
          <div className="divide-y divide-surface-200 max-h-80 overflow-y-auto">
            {slots.map(slot => {
              const s = getSlotStatus(slot);
              return (
                <button
                  key={slot.id}
                  onClick={() => setSelected(slot)}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-surface-50 text-left transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: s.bg }}>
                    <SlotIcon vehicleType={slot.vehicle_type} size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-700 text-slate-800">{slot.slot_number}</p>
                    <p className="text-xs text-slate-400">{slot.zone_name || 'Zone'}</p>
                  </div>
                  <span className="text-xs font-600 px-2 py-0.5 rounded-full" style={{ backgroundColor: s.bg, color: s.text }}>{s.label}</span>
                  {slot.id === mySlotId && <span className="text-xs text-primary-600 font-700">★ Yours</span>}
                </button>
              );
            })}
          </div>
        )}

        {/* Side sheet */}
        <AnimatePresence>
          {selected && (
            <SlotDetailSheet
              slot={selected}
              isAdmin={isAdmin}
              onClose={() => setSelected(null)}
              onSimulateEvent={() => { onRefresh?.(); setSelected(null); }}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
