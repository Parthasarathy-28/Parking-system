// Admin Analytics Page
import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid
} from 'recharts';
import { motion } from 'framer-motion';
import {
  BarChart2, RefreshCw, TrendingUp, Clock, AlertTriangle,
  CheckCircle, Users, Activity, ParkingCircle
} from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { adminApi } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';

const CHART_COLORS = ['#10b981', '#0ea5e9', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899'];

// ── Stat card ─────────────────────────────────────────────
function MetricCard({ label, value, icon: Icon, color, trend }) {
  const colorMap = {
    green:  'bg-emerald-50 text-emerald-600',
    sky:    'bg-sky-50 text-sky-600',
    amber:  'bg-amber-50 text-amber-600',
    red:    'bg-red-50 text-red-600',
    violet: 'bg-violet-50 text-violet-600',
    slate:  'bg-slate-50 text-slate-600',
  };
  const cls = colorMap[color] || colorMap.slate;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-surface-200 shadow-sm p-5"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
          <p className="text-3xl font-bold text-slate-800 tabular-nums">{value ?? 0}</p>
          {trend && <p className="text-xs text-slate-400 mt-1">{trend}</p>}
        </div>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${cls}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </motion.div>
  );
}

// ── Custom tooltip ──────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-surface-200 rounded-xl shadow-card-md px-3 py-2">
      <p className="text-xs font-semibold text-slate-600 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} className="text-sm font-bold" style={{ color: p.color }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
}

export default function AdminAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const toast = useToast();

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await adminApi.analytics();
      setData(res.data);
    } catch (e) {
      if (!quiet) toast.error('Failed to load analytics', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-10 h-10 rounded-full border-4 border-primary-200 border-t-primary-500 animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  const {
    hourlyAllocations = [],
    reallocations = 0,
    expiredHolds = 0,
    zoneOccupancy = [],
    recentSessions = [],
    todayRequests = 0,
  } = data || {};

  // Prepare hourly chart data — fill all 24 hours
  const hourlyData = Array.from({ length: 24 }, (_, h) => {
    const hr = h.toString().padStart(2, '0');
    const found = hourlyAllocations.find(a => a.hour === hr);
    return { hour: `${hr}:00`, allocations: found?.count || 0 };
  });

  // Zone pie chart data
  const zoneData = zoneOccupancy.map(z => ({
    name: `${z.name} (${z.zone_code})`,
    occupied: z.occupied || 0,
    available: z.available || 0,
    total: z.total || 0,
  }));

  const zoneOccupancyPie = zoneData.map(z => ({
    name: z.name,
    value: z.occupied,
  })).filter(z => z.value > 0);

  const totalAllocations = hourlyAllocations.reduce((s, a) => s + (a.count || 0), 0);

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Analytics</h2>
            <p className="text-sm text-slate-400">
              Real-time usage data for PSG College of Technology.
              <span className="ml-1 text-amber-600 font-semibold">Demo data may be labeled.</span>
            </p>
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

        {/* KPI Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="Requests Today" value={todayRequests} icon={Activity} color="sky" trend="From midnight to now" />
          <MetricCard label="Total Allocations" value={totalAllocations} icon={CheckCircle} color="green" trend="All recorded allocations" />
          <MetricCard label="Reallocations" value={reallocations} icon={AlertTriangle} color="amber" trend="Automatic reassignments" />
          <MetricCard label="Expired Holds" value={expiredHolds} icon={Clock} color="red" trend="Unconfirmed holds released" />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Hourly Allocations Bar Chart */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-surface-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-slate-700">Allocations by Hour</h3>
                <p className="text-xs text-slate-400 mt-0.5">Based on recorded audit events</p>
              </div>
              <BarChart2 className="w-5 h-5 text-slate-400" />
            </div>
            {totalAllocations === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-slate-400">
                <BarChart2 className="w-10 h-10 text-slate-300 mb-2" />
                <p className="text-sm font-medium">No allocation data yet</p>
                <p className="text-xs text-slate-400 mt-1">Run the demo to generate activity.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={hourlyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#94a3b8' }} interval={3} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="allocations" fill="#10b981" radius={[4, 4, 0, 0]} name="Allocations" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Zone Occupancy Pie */}
          <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-5">
            <div className="mb-4">
              <h3 className="font-bold text-slate-700">Zone Occupancy</h3>
              <p className="text-xs text-slate-400 mt-0.5">Current snapshot</p>
            </div>
            {zoneOccupancyPie.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-slate-400">
                <ParkingCircle className="w-10 h-10 text-slate-300 mb-2" />
                <p className="text-sm font-medium">No occupied slots</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={zoneOccupancyPie}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {zoneOccupancyPie.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, n) => [`${v} occupied`, n]} />
                  <Legend iconSize={10} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Zone Table */}
        {zoneData.length > 0 && (
          <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-200">
              <h3 className="font-bold text-slate-700">Zone Occupancy Details</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-50 border-b border-surface-200">
                    {['Zone', 'Code', 'Total', 'Occupied', 'Available', 'Occupancy %'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {zoneOccupancy.map((z, i) => {
                    const pct = z.total > 0 ? Math.round((z.occupied / z.total) * 100) : 0;
                    return (
                      <tr key={z.zone_code} className="border-b border-surface-100 hover:bg-surface-50">
                        <td className="px-4 py-3 font-semibold text-slate-800">{z.name}</td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: `${CHART_COLORS[i % CHART_COLORS.length]}20`, color: CHART_COLORS[i % CHART_COLORS.length] }}>
                            {z.zone_code}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{z.total}</td>
                        <td className="px-4 py-3 font-semibold text-red-600">{z.occupied}</td>
                        <td className="px-4 py-3 font-semibold text-emerald-600">{z.available}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 rounded-full bg-surface-100 max-w-24">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                            </div>
                            <span className="tabular-nums text-slate-600 font-semibold">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Recent Sessions */}
        <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
            <h3 className="font-bold text-slate-700">Recent Parking Sessions</h3>
            <span className="text-xs text-slate-400">Last 10</span>
          </div>
          {recentSessions.length === 0 ? (
            <div className="p-10 text-center">
              <Activity className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-400 text-sm font-medium">No sessions recorded yet</p>
              <p className="text-xs text-slate-400 mt-1">Parking sessions will appear after students confirm and exit.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-50 border-b border-surface-200">
                    {['Student', 'Slot', 'Zone', 'Started', 'Ended', 'Duration'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentSessions.map(s => (
                    <tr key={s.id} className="border-b border-surface-100 hover:bg-surface-50">
                      <td className="px-4 py-3 font-semibold text-slate-800">{s.user_name}</td>
                      <td className="px-4 py-3 font-mono text-slate-700">{s.slot_number}</td>
                      <td className="px-4 py-3 text-slate-500">{s.zone_name}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{new Date(s.started_at).toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{s.ended_at ? new Date(s.ended_at).toLocaleString() : <span className="text-emerald-600 font-semibold">Active</span>}</td>
                      <td className="px-4 py-3 tabular-nums text-slate-600">{s.duration_minutes != null ? `${s.duration_minutes} min` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
