// Admin Slots Page — Manage parking slots
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ParkingCircle, Car, Bike, Plus, Lock, Unlock, Search,
  RefreshCw, Filter, ChevronDown, X, Loader2, CheckCircle,
  AlertTriangle, Wrench, Users
} from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import DigitalTwin from '../../components/DigitalTwin';
import { adminApi } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';
import { useSocketEvent } from '../../contexts/SocketContext';

// ── Status badge ──────────────────────────────────────────
function StatusBadge({ operational, occupancy }) {
  const cfg = {
    'available_free':         { label: 'Available',   cls: 'bg-emerald-100 text-emerald-700' },
    'available_held':         { label: 'Held',         cls: 'bg-amber-100 text-amber-700' },
    'available_occupied':     { label: 'Occupied',     cls: 'bg-red-100 text-red-700' },
    'blocked_free':           { label: 'Blocked',      cls: 'bg-slate-100 text-slate-600' },
    'blocked_occupied':       { label: 'Blk+Occupied', cls: 'bg-red-100 text-red-700' },
    'maintenance_free':       { label: 'Maintenance',  cls: 'bg-orange-100 text-orange-700' },
  }[`${operational}_${occupancy}`] || { label: `${operational}`, cls: 'bg-slate-100 text-slate-500' };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>
  );
}

// ── Add Slot Modal ─────────────────────────────────────────
function AddSlotModal({ zones, onClose, onSuccess }) {
  const [form, setForm] = useState({ zoneId: '', slotNumber: '', vehicleType: 'bike', allocationPriority: 100 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await adminApi.createSlot({
        zoneId: form.zoneId,
        slotNumber: form.slotNumber.toUpperCase(),
        vehicleType: form.vehicleType,
        allocationPriority: Number(form.allocationPriority),
      });
      toast.success('Slot Created', `${form.slotNumber.toUpperCase()} added successfully.`);
      onSuccess();
      onClose();
    } catch (e) {
      setError(e.message || 'Failed to create slot.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-slate-800">Add New Slot</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-surface-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-slate-600 block mb-1">Zone</label>
            <select
              required
              value={form.zoneId}
              onChange={e => setForm(f => ({ ...f, zoneId: e.target.value }))}
              className="w-full border border-surface-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-300"
            >
              <option value="">Select zone…</option>
              {zones.map(z => (
                <option key={z.id} value={z.id}>{z.name} ({z.zone_code}) — {z.vehicle_type}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-600 block mb-1">Slot Number</label>
            <input
              required
              type="text"
              placeholder="e.g. A13, B05"
              value={form.slotNumber}
              onChange={e => setForm(f => ({ ...f, slotNumber: e.target.value }))}
              className="w-full border border-surface-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-300"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-600 block mb-1">Vehicle Type</label>
            <div className="flex gap-3">
              {['bike', 'car'].map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, vehicleType: v }))}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                    form.vehicleType === v
                      ? 'border-primary-400 bg-primary-50 text-primary-700'
                      : 'border-surface-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {v === 'bike' ? <Bike className="w-4 h-4" /> : <Car className="w-4 h-4" />}
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-600 block mb-1">
              Allocation Priority <span className="text-slate-400">(lower = higher priority)</span>
            </label>
            <input
              type="number"
              min={1}
              value={form.allocationPriority}
              onChange={e => setForm(f => ({ ...f, allocationPriority: e.target.value }))}
              className="w-full border border-surface-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-300"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-surface-200 text-sm font-semibold text-slate-600 hover:bg-surface-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add Slot
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ── Block Confirmation Dialog ──────────────────────────────
function BlockDialog({ slot, onClose, onDone }) {
  const [action, setAction] = useState('block_after_session');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const hasActive = slot.occupancy_status === 'held' || slot.occupancy_status === 'occupied';

  const confirm = async () => {
    setLoading(true);
    try {
      const res = await adminApi.blockSlot(slot.id, { action, reason });
      toast.success('Slot Blocked', res.data.message);
      onDone();
      onClose();
    } catch (e) {
      toast.error('Block Failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">Block Slot {slot.slot_number}?</h3>
            <p className="text-sm text-slate-500 mt-0.5">This slot is currently {slot.occupancy_status}.</p>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-slate-400 hover:bg-surface-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {hasActive && (
          <div className="space-y-2 mb-4">
            <p className="text-sm font-semibold text-slate-600">Choose action:</p>
            {[
              { value: 'block_after_session', label: 'Block after current session ends', desc: 'Vehicle can finish; slot is blocked for new allocations.' },
              { value: 'cancel_and_block', label: 'Cancel hold & reallocate student', desc: 'Student gets reallocated to next available slot immediately.' },
            ].map(opt => (
              <label key={opt.value} className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${action === opt.value ? 'border-amber-400 bg-amber-50' : 'border-surface-200 hover:border-surface-300'}`}>
                <input
                  type="radio"
                  name="blockAction"
                  value={opt.value}
                  checked={action === opt.value}
                  onChange={() => setAction(opt.value)}
                  className="mt-0.5 accent-amber-500"
                />
                <div>
                  <p className="text-sm font-semibold text-slate-700">{opt.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>
        )}

        <div className="mb-4">
          <label className="text-sm font-semibold text-slate-600 block mb-1">Reason (optional)</label>
          <input
            type="text"
            placeholder="Maintenance, reserved event…"
            value={reason}
            onChange={e => setReason(e.target.value)}
            className="w-full border border-surface-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
          />
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-surface-200 text-sm font-semibold text-slate-600 hover:bg-surface-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            Block Slot
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────
export default function AdminSlots() {
  const [slots, setSlots] = useState([]);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterVehicle, setFilterVehicle] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [blockingSlot, setBlockingSlot] = useState(null);
  const [unblockLoading, setUnblockLoading] = useState('');
  const [view, setView] = useState('twin'); // 'twin' | 'table'
  const toast = useToast();

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const [slotsRes, zonesRes] = await Promise.all([adminApi.slots(), adminApi.zones()]);
      setSlots(slotsRes.data.slots);
      setZones(zonesRes.data.zones);
    } catch (e) {
      toast.error('Failed to load', e.message);
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
  useSocketEvent('demo:reset', () => load(true));

  const unblock = async (slot) => {
    setUnblockLoading(slot.id);
    try {
      await adminApi.unblockSlot(slot.id);
      toast.success('Slot Unblocked', `${slot.slot_number} is now available.`);
      load(true);
    } catch (e) {
      toast.error('Unblock Failed', e.message);
    } finally {
      setUnblockLoading('');
    }
  };

  // Filtered slots
  const filtered = slots.filter(s => {
    const matchSearch = !search || s.slot_number.toLowerCase().includes(search.toLowerCase()) || s.zone_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all'
      || (filterStatus === 'available' && s.operational_status === 'available' && s.occupancy_status === 'free')
      || (filterStatus === 'held' && s.occupancy_status === 'held')
      || (filterStatus === 'occupied' && s.occupancy_status === 'occupied')
      || (filterStatus === 'blocked' && s.operational_status === 'blocked');
    const matchVehicle = filterVehicle === 'all' || s.vehicle_type === filterVehicle;
    return matchSearch && matchStatus && matchVehicle;
  });

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
      <AnimatePresence>
        {showAddModal && (
          <AddSlotModal zones={zones} onClose={() => setShowAddModal(false)} onSuccess={() => load(true)} />
        )}
        {blockingSlot && (
          <BlockDialog slot={blockingSlot} onClose={() => setBlockingSlot(null)} onDone={() => load(true)} />
        )}
      </AnimatePresence>

      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Parking Slots</h2>
            <p className="text-sm text-slate-400">{slots.length} total · {slots.filter(s => s.operational_status === 'available' && s.occupancy_status === 'free').length} available</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setView(v => v === 'twin' ? 'table' : 'twin')}
              className="px-3 py-2 rounded-xl border border-surface-200 text-sm font-semibold text-slate-600 bg-white hover:bg-surface-50 transition-colors"
            >
              {view === 'twin' ? 'Table View' : 'Grid View'}
            </button>
            <button
              onClick={() => load(true)}
              disabled={refreshing}
              className="p-2 rounded-xl border border-surface-200 text-slate-500 bg-white hover:bg-surface-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Slot
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-48">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search slots…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-surface-200 rounded-xl text-sm focus:outline-none focus:border-primary-400 bg-white"
            />
          </div>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="border border-surface-200 rounded-xl px-3 py-2 text-sm text-slate-600 focus:outline-none focus:border-primary-400 bg-white"
          >
            <option value="all">All Status</option>
            <option value="available">Available</option>
            <option value="held">Held</option>
            <option value="occupied">Occupied</option>
            <option value="blocked">Blocked</option>
          </select>
          <select
            value={filterVehicle}
            onChange={e => setFilterVehicle(e.target.value)}
            className="border border-surface-200 rounded-xl px-3 py-2 text-sm text-slate-600 focus:outline-none focus:border-primary-400 bg-white"
          >
            <option value="all">All Vehicles</option>
            <option value="bike">Bikes</option>
            <option value="car">Cars</option>
          </select>
        </div>

        {/* Digital Twin View */}
        {view === 'twin' && (
          <DigitalTwin
            slots={filtered}
            isAdmin={true}
            onRefresh={() => load(true)}
          />
        )}

        {/* Table View */}
        {view === 'table' && (
          <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200 bg-surface-50">
                    {['Slot', 'Zone', 'Vehicle', 'Priority', 'Status', 'Allocated To', 'Actions'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-slate-400">
                        <ParkingCircle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                        No slots match your filters
                      </td>
                    </tr>
                  ) : filtered.map(slot => (
                    <tr key={slot.id} className="border-b border-surface-100 hover:bg-surface-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-bold text-slate-800">{slot.slot_number}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{slot.zone_name}</td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5">
                          {slot.vehicle_type === 'bike' ? <Bike className="w-4 h-4 text-emerald-500" /> : <Car className="w-4 h-4 text-sky-500" />}
                          <span className="capitalize text-slate-600">{slot.vehicle_type}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-slate-500">#{slot.allocation_priority}</span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge operational={slot.operational_status} occupancy={slot.occupancy_status} />
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs max-w-32 truncate">
                        {slot.allocated_user_name || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {slot.operational_status !== 'blocked' ? (
                            <button
                              onClick={() => setBlockingSlot(slot)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-50 transition-colors"
                            >
                              <Lock className="w-3.5 h-3.5" />
                              Block
                            </button>
                          ) : (
                            <button
                              onClick={() => unblock(slot)}
                              disabled={unblockLoading === slot.id}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 text-emerald-600 text-xs font-semibold hover:bg-emerald-50 transition-colors disabled:opacity-60"
                            >
                              {unblockLoading === slot.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <Unlock className="w-3.5 h-3.5" />}
                              Unblock
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
