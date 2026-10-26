// Admin Priority Management Page — Drag-and-drop slot ordering
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import {
  ListOrdered, ChevronUp, ChevronDown, Save, Loader2,
  RefreshCw, Car, Bike, Info, AlertTriangle, CheckCircle,
  GripVertical, Filter
} from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { adminApi } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';

const STATUS_COLORS = {
  'free':     'bg-emerald-100 text-emerald-700',
  'held':     'bg-amber-100 text-amber-700',
  'occupied': 'bg-red-100 text-red-700',
};

function SlotRow({ slot, index, total, onMoveUp, onMoveDown }) {
  const statusCls = STATUS_COLORS[slot.occupancy_status] || 'bg-slate-100 text-slate-600';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.15 }}
      className="flex items-center gap-3 bg-white border border-surface-200 rounded-xl px-4 py-3 shadow-sm hover:shadow-md transition-shadow group"
    >
      {/* Priority Badge */}
      <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
        <span className="text-xs font-bold text-primary-600 tabular-nums">#{index + 1}</span>
      </div>

      {/* Drag handle visual */}
      <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0 cursor-grab group-hover:text-slate-400 transition-colors" />

      {/* Slot info */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="flex-shrink-0">
          {slot.vehicle_type === 'bike'
            ? <Bike className="w-4 h-4 text-emerald-500" />
            : <Car className="w-4 h-4 text-sky-500" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">{slot.slot_number}</span>
            <span className="text-xs text-slate-400">{slot.zone_name}</span>
            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full hidden sm:inline ${statusCls}`}>
              {slot.occupancy_status}
            </span>
          </div>
          {slot.allocated_user_name && (
            <p className="text-xs text-slate-400 truncate">→ {slot.allocated_user_name}</p>
          )}
        </div>
      </div>

      {/* Up/down controls */}
      <div className="flex flex-col gap-0.5 flex-shrink-0">
        <button
          onClick={() => onMoveUp(index)}
          disabled={index === 0}
          className="p-1 rounded hover:bg-surface-100 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label={`Move ${slot.slot_number} up`}
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          onClick={() => onMoveDown(index)}
          disabled={index === total - 1}
          className="p-1 rounded hover:bg-surface-100 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label={`Move ${slot.slot_number} down`}
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      {/* Old priority indicator */}
      <div className="text-right flex-shrink-0 hidden lg:block">
        <p className="text-xs text-slate-400">was #{slot.allocation_priority}</p>
      </div>
    </motion.div>
  );
}

export default function AdminPriority() {
  const [allSlots, setAllSlots] = useState([]);
  const [orderedSlots, setOrderedSlots] = useState([]);
  const [filterVehicle, setFilterVehicle] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [saved, setSaved] = useState(false);
  const toast = useToast();

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await adminApi.slots();
      const slots = [...res.data.slots].sort((a, b) => a.allocation_priority - b.allocation_priority);
      setAllSlots(slots);
      setOrderedSlots(slots);
      setHasChanges(false);
    } catch (e) {
      if (!quiet) toast.error('Failed to load slots', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const moveUp = (index) => {
    if (index === 0) return;
    const newOrder = [...orderedSlots];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    setOrderedSlots(newOrder);
    setHasChanges(true);
  };

  const moveDown = (index) => {
    if (index === orderedSlots.length - 1) return;
    const newOrder = [...orderedSlots];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    setOrderedSlots(newOrder);
    setHasChanges(true);
  };

  const handleReorder = (newOrder) => {
    setOrderedSlots(newOrder);
    setHasChanges(true);
  };

  const savePriorities = async () => {
    setSaving(true);
    try {
      const priorities = orderedSlots.map((slot, idx) => ({
        slotId: slot.id,
        priority: idx + 1,
      }));
      await adminApi.setPriorities(priorities);
      toast.success('Priorities Saved', `${priorities.length} slots updated.`);
      setSaved(true);
      setHasChanges(false);
      setTimeout(() => setSaved(false), 3000);
      load(true);
    } catch (e) {
      toast.error('Save Failed', e.message);
    } finally {
      setSaving(false);
    }
  };

  const resetOrder = () => {
    setOrderedSlots([...allSlots]);
    setHasChanges(false);
  };

  // Filtered view (does not affect save — all slots are saved)
  const filteredView = orderedSlots.filter(s =>
    filterVehicle === 'all' || s.vehicle_type === filterVehicle
  );

  const bikeCount = orderedSlots.filter(s => s.vehicle_type === 'bike').length;
  const carCount = orderedSlots.filter(s => s.vehicle_type === 'car').length;

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
            <h2 className="text-xl font-bold text-slate-800">Priority Management</h2>
            <p className="text-sm text-slate-400">
              Slot at top (#1) is allocated first. Drag to reorder, or use the ▲▼ buttons.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => load(true)}
              disabled={refreshing}
              className="p-2 rounded-xl border border-surface-200 bg-white text-slate-500 hover:bg-surface-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            {hasChanges && (
              <button
                onClick={resetOrder}
                className="px-4 py-2 rounded-xl border border-surface-200 bg-white text-sm font-semibold text-slate-600 hover:bg-surface-50 transition-colors"
              >
                Reset
              </button>
            )}
            <button
              onClick={savePriorities}
              disabled={saving || !hasChanges}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 ${
                saved
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                  : 'bg-primary-500 hover:bg-primary-600 text-white'
              }`}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {saved ? 'Saved!' : saving ? 'Saving…' : 'Save Order'}
            </button>
          </div>
        </div>

        {/* Unsaved changes banner */}
        <AnimatePresence>
          {hasChanges && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3"
            >
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <p className="text-sm text-amber-700 font-medium">Unsaved changes. Hit "Save Order" to apply the new priority to all allocations.</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Info */}
        <div className="flex items-start gap-3 bg-sky-50 border border-sky-200 rounded-2xl px-4 py-3">
          <Info className="w-4 h-4 text-sky-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-sky-700">
            Priority #1 is allocated first. Place slots closest to the exit at the top — students prefer minimal walking distance. Drag or use buttons to reorder. <strong>Filters are display-only</strong>; all slots are saved together.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-surface-200 p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-slate-800">{orderedSlots.length}</p>
            <p className="text-xs text-slate-400 mt-0.5">Total Slots</p>
          </div>
          <div className="bg-white rounded-xl border border-emerald-200 p-3 text-center shadow-sm">
            <div className="flex items-center justify-center gap-1.5 mb-0.5">
              <Bike className="w-4 h-4 text-emerald-500" />
              <p className="text-2xl font-bold text-slate-800">{bikeCount}</p>
            </div>
            <p className="text-xs text-slate-400">Bike Slots</p>
          </div>
          <div className="bg-white rounded-xl border border-sky-200 p-3 text-center shadow-sm">
            <div className="flex items-center justify-center gap-1.5 mb-0.5">
              <Car className="w-4 h-4 text-sky-500" />
              <p className="text-2xl font-bold text-slate-800">{carCount}</p>
            </div>
            <p className="text-xs text-slate-400">Car Slots</p>
          </div>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-sm text-slate-500 font-medium">View:</span>
          {['all', 'bike', 'car'].map(f => (
            <button
              key={f}
              onClick={() => setFilterVehicle(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors capitalize ${
                filterVehicle === f
                  ? 'bg-primary-500 text-white'
                  : 'bg-white border border-surface-200 text-slate-600 hover:bg-surface-50'
              }`}
            >
              {f === 'all' ? 'All' : f === 'bike' ? '🚲 Bikes' : '🚗 Cars'}
            </button>
          ))}
          {filterVehicle !== 'all' && (
            <span className="text-xs text-slate-400 ml-1">
              (Showing {filteredView.length} of {orderedSlots.length} — full order saved)
            </span>
          )}
        </div>

        {/* Priority List — Drag and Drop */}
        {orderedSlots.length === 0 ? (
          <div className="bg-white rounded-2xl border border-surface-200 p-12 text-center">
            <ListOrdered className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No slots to prioritize</p>
            <p className="text-sm text-slate-400">Add slots in the Slots page first.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-surface-200 bg-surface-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ListOrdered className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-bold text-slate-600 uppercase tracking-wide">
                  Allocation Priority Order
                </span>
              </div>
              <span className="text-xs text-slate-400">Drag rows to reorder</span>
            </div>
            <div className="p-4">
              <Reorder.Group axis="y" values={orderedSlots} onReorder={handleReorder} className="space-y-2">
                {orderedSlots.map((slot, idx) => {
                  // If filter active, hide but still render in Reorder.Group
                  const visible = filterVehicle === 'all' || slot.vehicle_type === filterVehicle;
                  return (
                    <Reorder.Item
                      key={slot.id}
                      value={slot}
                      className={visible ? '' : 'hidden'}
                    >
                      <SlotRow
                        slot={slot}
                        index={idx}
                        total={orderedSlots.length}
                        onMoveUp={moveUp}
                        onMoveDown={moveDown}
                      />
                    </Reorder.Item>
                  );
                })}
              </Reorder.Group>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
