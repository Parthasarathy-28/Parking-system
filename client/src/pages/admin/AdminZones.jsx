// Admin Zones Page
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Layers, Plus, Car, Bike, Users, X, Loader2,
  CheckCircle, ParkingCircle, RefreshCw, Clock
} from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { adminApi } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';

const ZONE_COLORS = [
  '#10b981', '#0ea5e9', '#8b5cf6', '#f59e0b',
  '#ef4444', '#ec4899', '#14b8a6', '#f97316',
];

function ZoneCard({ zone }) {
  const total = zone.total_slots || 0;
  const available = zone.available || 0;
  const occupied = zone.occupied || 0;
  const pct = total > 0 ? Math.round(((total - available) / total) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-surface-200 shadow-sm p-5 hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${zone.color}20`, border: `2px solid ${zone.color}` }}
          >
            <span className="font-bold text-sm" style={{ color: zone.color }}>{zone.zone_code}</span>
          </div>
          <div>
            <p className="font-bold text-slate-800">{zone.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {zone.vehicle_type === 'bike' && <span className="flex items-center gap-1 text-xs text-emerald-600"><Bike className="w-3 h-3" />Bikes</span>}
              {zone.vehicle_type === 'car' && <span className="flex items-center gap-1 text-xs text-sky-600"><Car className="w-3 h-3" />Cars</span>}
              {zone.vehicle_type === 'any' && <span className="text-xs text-slate-500">Any vehicle</span>}
              {zone.staff_only === 1 && (
                <span className="flex items-center gap-1 text-xs bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full font-semibold">
                  <Users className="w-3 h-3" />Staff Only
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-slate-800">{available}</p>
          <p className="text-xs text-slate-400">free slots</p>
        </div>
      </div>

      {/* Bar */}
      <div className="h-2 rounded-full bg-surface-100 overflow-hidden mb-3">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8 }}
          className="h-full rounded-full"
          style={{ backgroundColor: zone.color }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{pct}% occupied</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-emerald-500" />{available} free</span>
          <span className="flex items-center gap-1"><ParkingCircle className="w-3 h-3 text-red-500" />{occupied} occupied</span>
          <span className="text-slate-400">{total} total</span>
        </div>
      </div>

      {zone.description && (
        <p className="text-xs text-slate-400 mt-3 pt-3 border-t border-surface-100">{zone.description}</p>
      )}
    </motion.div>
  );
}

function AddZoneModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    name: '', zoneCode: '', vehicleType: 'bike',
    staffOnly: false, color: '#10b981', description: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await adminApi.createZone({
        name: form.name,
        zoneCode: form.zoneCode.toUpperCase(),
        vehicleType: form.vehicleType,
        staffOnly: form.staffOnly,
        color: form.color,
        description: form.description || undefined,
      });
      toast.success('Zone Created', `Zone ${form.zoneCode.toUpperCase()} added.`);
      onSuccess();
      onClose();
    } catch (e) {
      setError(e.message || 'Failed to create zone.');
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
          <h3 className="text-lg font-bold text-slate-800">Add New Zone</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-surface-100"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-slate-600 block mb-1">Zone Name</label>
              <input required type="text" placeholder="e.g. Bike Zone Alpha"
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-surface-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary-400" />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-600 block mb-1">Zone Code</label>
              <input required type="text" placeholder="e.g. A, B, C1"
                value={form.zoneCode} onChange={e => setForm(f => ({ ...f, zoneCode: e.target.value }))}
                className="w-full border border-surface-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary-400 uppercase" />
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-600 block mb-1">Vehicle Type</label>
            <div className="flex gap-2">
              {[
                { value: 'bike', label: 'Bikes', icon: Bike },
                { value: 'car', label: 'Cars', icon: Car },
                { value: 'any', label: 'Any', icon: ParkingCircle },
              ].map(v => (
                <button key={v.value} type="button"
                  onClick={() => setForm(f => ({ ...f, vehicleType: v.value }))}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border-2 text-xs font-semibold transition-all ${
                    form.vehicleType === v.value
                      ? 'border-primary-400 bg-primary-50 text-primary-700'
                      : 'border-surface-200 text-slate-500 hover:border-slate-300'
                  }`}>
                  <v.icon className="w-3.5 h-3.5" />{v.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.staffOnly} onChange={e => setForm(f => ({ ...f, staffOnly: e.target.checked }))} className="accent-violet-500 w-4 h-4" />
              <span className="text-sm font-semibold text-slate-600">Staff Only Zone</span>
            </label>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-600 block mb-2">Zone Color</label>
            <div className="flex gap-2 flex-wrap">
              {ZONE_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                  className={`w-7 h-7 rounded-full transition-all ${form.color === c ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'hover:scale-105'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-600 block mb-1">Description (optional)</label>
            <input type="text" placeholder="Near main gate, Level B2…"
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full border border-surface-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary-400" />
          </div>

          {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-surface-200 text-sm font-semibold text-slate-600 hover:bg-surface-50 transition-colors">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 rounded-xl bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add Zone
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

export default function AdminZones() {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const toast = useToast();

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await adminApi.zones();
      setZones(res.data.zones);
    } catch (e) {
      if (!quiet) toast.error('Failed', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const totalSlots = zones.reduce((s, z) => s + (z.total_slots || 0), 0);
  const totalFree = zones.reduce((s, z) => s + (z.available || 0), 0);

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
        {showAdd && <AddZoneModal onClose={() => setShowAdd(false)} onSuccess={() => load(true)} />}
      </AnimatePresence>

      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Parking Zones</h2>
            <p className="text-sm text-slate-400">{zones.length} zones · {totalSlots} total slots · {totalFree} available</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => load(true)} disabled={refreshing}
              className="p-2 rounded-xl border border-surface-200 text-slate-500 bg-white hover:bg-surface-50 transition-colors disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold transition-colors">
              <Plus className="w-4 h-4" />Add Zone
            </button>
          </div>
        </div>

        {zones.length === 0 ? (
          <div className="bg-white rounded-2xl border border-surface-200 p-12 text-center">
            <Layers className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="font-semibold text-slate-500">No zones configured</p>
            <p className="text-sm text-slate-400 mb-4">Create your first parking zone to get started.</p>
            <button onClick={() => setShowAdd(true)} className="px-5 py-2.5 rounded-xl bg-primary-500 text-white font-semibold text-sm hover:bg-primary-600 transition-colors">
              Add First Zone
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {zones.map(zone => <ZoneCard key={zone.id} zone={zone} />)}
          </div>
        )}

        {/* Summary Table */}
        {zones.length > 0 && (
          <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-200">
              <h3 className="font-bold text-slate-700">Zone Summary</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-50 border-b border-surface-200">
                    {['Zone', 'Code', 'Vehicle', 'Total', 'Free', 'Occupied', 'Blocked', 'Staff Only'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {zones.map(z => (
                    <tr key={z.id} className="border-b border-surface-100 hover:bg-surface-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-800">{z.name}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: `${z.color}20`, color: z.color }}>
                          {z.zone_code}
                        </span>
                      </td>
                      <td className="px-4 py-3 capitalize text-slate-600">{z.vehicle_type}</td>
                      <td className="px-4 py-3 font-bold text-slate-800">{z.total_slots || 0}</td>
                      <td className="px-4 py-3"><span className="text-emerald-600 font-semibold">{z.available || 0}</span></td>
                      <td className="px-4 py-3"><span className="text-red-600 font-semibold">{z.occupied || 0}</span></td>
                      <td className="px-4 py-3"><span className="text-slate-500">{(z.total_slots || 0) - (z.available || 0) - (z.occupied || 0)}</span></td>
                      <td className="px-4 py-3">{z.staff_only ? <span className="text-violet-600 font-semibold">Yes</span> : <span className="text-slate-400">No</span>}</td>
                    </tr>
                  ))}
                  <tr className="bg-surface-50 font-bold">
                    <td className="px-4 py-3 text-slate-700" colSpan={3}>Total</td>
                    <td className="px-4 py-3 text-slate-800">{totalSlots}</td>
                    <td className="px-4 py-3 text-emerald-600">{totalFree}</td>
                    <td className="px-4 py-3 text-red-600">{zones.reduce((s, z) => s + (z.occupied || 0), 0)}</td>
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
