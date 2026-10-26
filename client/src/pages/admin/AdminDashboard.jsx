// Admin Dashboard — Overview Page
import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Car, Bike, Clock, CheckCircle, Lock, Wrench, Users, TrendingUp,
  RefreshCw, Activity, AlertTriangle, ParkingCircle, Layers,
  ArrowRight, Circle
} from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { adminApi } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';
import { useSocketEvent } from '../../contexts/SocketContext';

// ── Role Stats Panel (Student vs Staff) ───────────────────
function RoleStatsPanel({ roleStats = [] }) {
  const studentRows = roleStats.filter(r => r.staff_only === 0);
  const staffRows   = roleStats.filter(r => r.staff_only === 1);

  function sumRow(rows, key) {
    return rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
  }

  const panels = [
    {
      label: '🎓 Student Parking',
      rows: studentRows,
      border: 'border-sky-200',
      headerBg: 'bg-sky-50',
      color: 'text-sky-700',
    },
    {
      label: '🏢 Staff Parking',
      rows: staffRows,
      border: 'border-violet-200',
      headerBg: 'bg-violet-50',
      color: 'text-violet-700',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {panels.map(panel => {
        const total     = sumRow(panel.rows, 'total');
        const available = sumRow(panel.rows, 'available');
        const held      = sumRow(panel.rows, 'held');
        const occupied  = sumRow(panel.rows, 'occupied');
        const blocked   = sumRow(panel.rows, 'blocked');
        const usedPct   = total > 0 ? Math.round(((held + occupied) / total) * 100) : 0;

        return (
          <div key={panel.label} className={`bg-white rounded-2xl border ${panel.border} shadow-sm overflow-hidden`}>
            <div className={`px-4 py-2.5 ${panel.headerBg} flex items-center justify-between`}>
              <span className={`font-bold text-sm ${panel.color}`}>{panel.label}</span>
              <span className="text-xs text-slate-400">{total} slots</span>
            </div>
            <div className="px-4 py-3 space-y-3">
              {/* Mini stats */}
              <div className="grid grid-cols-4 gap-1 text-center">
                {[
                  { label: 'Free',     value: available, cls: 'text-emerald-600' },
                  { label: 'Held',     value: held,      cls: 'text-amber-600' },
                  { label: 'Occupied', value: occupied,  cls: 'text-red-600' },
                  { label: 'Blocked',  value: blocked,   cls: 'text-slate-500' },
                ].map(s => (
                  <div key={s.label}>
                    <p className={`text-xl font-bold tabular-nums ${s.cls}`}>{s.value}</p>
                    <p className="text-xs text-slate-400">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Occupancy bar */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-500">Occupancy</span>
                  <span className="font-bold text-slate-700">{usedPct}%</span>
                </div>
                <div className="h-2 rounded-full bg-surface-100 overflow-hidden flex">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.round((occupied / (total || 1)) * 100)}%` }}
                    transition={{ duration: 0.8 }}
                    className="h-full bg-red-400"
                  />
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.round((held / (total || 1)) * 100)}%` }}
                    transition={{ duration: 0.8, delay: 0.1 }}
                    className="h-full bg-amber-400"
                  />
                </div>
              </div>

              {/* Per-vehicle breakdown */}
              {panel.rows.map(r => (
                <div key={r.vehicle_type} className="flex items-center gap-2 text-xs text-slate-500">
                  {r.vehicle_type === 'bike'
                    ? <Bike className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                    : <Car className="w-3.5 h-3.5 text-sky-500 flex-shrink-0" />}
                  <span className="capitalize w-6 font-medium text-slate-600">{r.vehicle_type}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-surface-100">
                    <div className="h-full rounded-full bg-emerald-400"
                      style={{ width: `${r.total > 0 ? Math.round((r.available / r.total) * 100) : 0}%` }} />
                  </div>
                  <span className="font-semibold text-slate-600">{r.available}/{r.total} free</span>
                </div>
              ))}

              {panel.rows.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-2">No zones configured.</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}


function StatCard({ label, value, icon: Icon, color, subtext }) {
  const colors = {
    green:  'bg-emerald-50 text-emerald-600 border-emerald-200',
    amber:  'bg-amber-50 text-amber-600 border-amber-200',
    red:    'bg-red-50 text-red-600 border-red-200',
    slate:  'bg-slate-50 text-slate-600 border-slate-200',
    sky:    'bg-sky-50 text-sky-600 border-sky-200',
    violet: 'bg-violet-50 text-violet-600 border-violet-200',
  };
  const cls = colors[color] || colors.slate;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-2xl border p-5 shadow-sm ${cls.split(' ')[2]}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
          <p className="text-3xl font-bold text-slate-800 tabular-nums">{value ?? '—'}</p>
          {subtext && <p className="text-xs text-slate-400 mt-1">{subtext}</p>}
        </div>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${cls}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </motion.div>
  );
}

// ── Occupancy Ring ─────────────────────────────────────────
function OccupancyRing({ occupied, total }) {
  const pct = total > 0 ? (occupied / total) : 0;
  const radius = 48;
  const circ = 2 * Math.PI * radius;
  const color = pct > 0.9 ? '#ef4444' : pct > 0.7 ? '#f59e0b' : '#10b981';

  return (
    <div className="flex items-center gap-6">
      <div className="relative flex-shrink-0">
        <svg width="120" height="120" className="-rotate-90">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="10" />
          <motion.circle
            cx="60" cy="60" r={radius} fill="none"
            stroke={color} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: circ * (1 - pct) }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-slate-800 tabular-nums">{Math.round(pct * 100)}%</span>
          <span className="text-xs text-slate-400">occupied</span>
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className="text-slate-500">Available</span>
          <span className="ml-auto font-bold text-slate-800">{total - occupied}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <span className="text-slate-500">Occupied</span>
          <span className="ml-auto font-bold text-slate-800">{occupied}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
          <span className="text-slate-500">Total</span>
          <span className="ml-auto font-bold text-slate-800">{total}</span>
        </div>
      </div>
    </div>
  );
}

// ── Zone Bar ──────────────────────────────────────────────
function ZoneBar({ zone }) {
  const total = zone.total || 1;
  const occupiedPct = ((zone.occupied || 0) / total) * 100;
  const heldPct = ((zone.held || 0) / total) * 100;
  const blockedPct = ((zone.blocked || 0) / total) * 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-700">{zone.name}</span>
          <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">{zone.zone_code}</span>
          {zone.vehicle_type === 'bike' && <Bike className="w-3.5 h-3.5 text-emerald-500" />}
          {zone.vehicle_type === 'car' && <Car className="w-3.5 h-3.5 text-sky-500" />}
          {zone.staff_only === 1 && <span className="text-xs bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded font-semibold">Staff</span>}
        </div>
        <span className="text-xs text-slate-400">{zone.available || 0} free / {total}</span>
      </div>
      <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden flex">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${occupiedPct}%` }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="h-full bg-red-400"
        />
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${heldPct}%` }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="h-full bg-amber-400"
        />
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${blockedPct}%` }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="h-full bg-slate-300"
        />
      </div>
    </div>
  );
}

// ── Active Allocation Row ──────────────────────────────────
function AllocationRow({ alloc }) {
  const isHeld = alloc.status === 'held';
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-surface-100 last:border-0">
      <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
        <span className="text-xs font-bold text-slate-600">{alloc.slot_number}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">{alloc.user_name}</p>
        <p className="text-xs text-slate-400 truncate">{alloc.zone_name} · {alloc.email}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${isHeld ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
          {isHeld ? '⏱ Held' : '✓ Confirmed'}
        </span>
        {isHeld && alloc.expires_at && (
          <p className="text-xs text-slate-400 mt-0.5">
            Exp: {new Date(alloc.expires_at).toLocaleTimeString()}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Audit Row ─────────────────────────────────────────────
function AuditRow({ log }) {
  const icons = {
    allocation_created: <CheckCircle className="w-4 h-4 text-emerald-500" />,
    slot_blocked: <Lock className="w-4 h-4 text-red-500" />,
    slot_unblocked: <CheckCircle className="w-4 h-4 text-emerald-500" />,
    sensor_simulated: <Activity className="w-4 h-4 text-sky-500" />,
    demo_reset: <RefreshCw className="w-4 h-4 text-amber-500" />,
    reallocation_created: <AlertTriangle className="w-4 h-4 text-amber-500" />,
  };
  const icon = icons[log.action] || <Circle className="w-4 h-4 text-slate-400" />;

  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-surface-100 last:border-0">
      <div className="mt-0.5 flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-700 font-medium capitalize">{log.action.replace(/_/g, ' ')}</p>
        <p className="text-xs text-slate-400 truncate">{log.user_name || 'System'}</p>
      </div>
      <span className="text-xs text-slate-400 flex-shrink-0">{new Date(log.created_at).toLocaleTimeString()}</span>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────
export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const toast = useToast();

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await adminApi.dashboard();
      setData(res.data);
    } catch (e) {
      if (!quiet) toast.error('Failed to load dashboard', e.message);
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

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full border-4 border-primary-200 border-t-primary-500 animate-spin" />
            <p className="text-slate-500 font-medium">Loading dashboard…</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  const { stats = {}, zoneStats = [], activeAllocations = [], queueList = [], recentAudit = [], queueStats = [], roleStats = [] } = data || {};
  const totalQueue = queueStats.reduce((s, q) => s + (q.count || 0), 0);

  return (
    <AdminLayout>
      <div className="space-y-6">

        {/* Refresh button */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Parking Overview</h2>
            <p className="text-sm text-slate-400">Live data · PSG College of Technology</p>
          </div>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-slate-600 bg-white border border-surface-200 hover:bg-surface-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Stat Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <StatCard label="Total Slots" value={stats.total_slots} icon={ParkingCircle} color="slate" />
          <StatCard label="Available" value={stats.available} icon={CheckCircle} color="green" subtext="Ready to allocate" />
          <StatCard label="Held" value={stats.held} icon={Clock} color="amber" subtext="3-min holds" />
          <StatCard label="Occupied" value={stats.occupied} icon={Car} color="red" subtext="Active sessions" />
          <StatCard label="Blocked" value={stats.blocked} icon={Lock} color="slate" subtext="Admin blocked" />
          <StatCard label="Queue" value={totalQueue} icon={Users} color="violet" subtext="Waiting" />
        </div>

        {/* Student vs Staff Split */}
        <div>
          <h3 className="font-bold text-slate-700 mb-3">Student vs Staff Parking</h3>
          <RoleStatsPanel roleStats={roleStats} />
        </div>

        {/* Middle Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Occupancy Ring */}
          <div className="bg-white rounded-2xl border border-surface-200 p-5 shadow-sm">
            <h3 className="font-bold text-slate-700 mb-4">Real-Time Occupancy</h3>
            <OccupancyRing
              occupied={(stats.held || 0) + (stats.occupied || 0)}
              total={stats.total_slots || 1}
            />
          </div>

          {/* Zone Breakdown */}
          <div className="bg-white rounded-2xl border border-surface-200 p-5 shadow-sm">
            <h3 className="font-bold text-slate-700 mb-4">Zone Breakdown</h3>
            {zoneStats.length === 0 ? (
              <p className="text-slate-400 text-sm">No zones configured.</p>
            ) : (
              <div className="space-y-3">
                {zoneStats.map(zone => <ZoneBar key={zone.zone_code} zone={zone} />)}
              </div>
            )}
            {/* Legend */}
            <div className="flex gap-4 mt-4 pt-3 border-t border-surface-100">
              {[
                { color: 'bg-red-400', label: 'Occupied' },
                { color: 'bg-amber-400', label: 'Held' },
                { color: 'bg-slate-300', label: 'Blocked' },
                { color: 'bg-emerald-500', label: 'Available' },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className={`w-2.5 h-2.5 rounded-sm ${l.color}`} />
                  {l.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Active Allocations */}
          <div className="bg-white rounded-2xl border border-surface-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-700">Active Allocations</h3>
              <span className="text-sm text-slate-400">{activeAllocations.length} total</span>
            </div>
            {activeAllocations.length === 0 ? (
              <div className="py-8 flex flex-col items-center gap-2 text-slate-400">
                <ParkingCircle className="w-8 h-8 text-slate-300" />
                <p className="text-sm">No active allocations</p>
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto">
                {activeAllocations.map(a => <AllocationRow key={a.id} alloc={a} />)}
              </div>
            )}
          </div>

          {/* Audit Log */}
          <div className="bg-white rounded-2xl border border-surface-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-700">Recent Activity</h3>
              <TrendingUp className="w-4 h-4 text-slate-400" />
            </div>
            {recentAudit.length === 0 ? (
              <div className="py-8 flex flex-col items-center gap-2 text-slate-400">
                <Activity className="w-8 h-8 text-slate-300" />
                <p className="text-sm">No recent activity</p>
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto">
                {recentAudit.map(log => <AuditRow key={log.id} log={log} />)}
              </div>
            )}
          </div>
        </div>

        {/* Queue */}
        {queueList.length > 0 && (
          <div className="bg-white rounded-2xl border border-surface-200 p-5 shadow-sm">
            <h3 className="font-bold text-slate-700 mb-4">Waiting Queue</h3>
            <div className="space-y-2">
              {queueList.map(q => (
                <div key={q.id} className="flex items-center gap-3 py-2 border-b border-surface-100 last:border-0">
                  <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center text-sm font-bold text-sky-600">
                    #{q.queue_position}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700">{q.user_name}</p>
                    <p className="text-xs text-slate-400">{q.email} · {q.vehicle_type}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full capitalize ${q.status === 'offered' ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-600'}`}>
                    {q.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
