// Admin Layout - collapsible sidebar
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, ParkingCircle, Layers, MapPin, BarChart2,
  Radio, ListOrdered, LogOut, ChevronLeft, ChevronRight,
  Car, Bell, Menu, X, RefreshCw, User
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { useToast } from '../contexts/ToastContext';
import { adminApi } from '../lib/api';

const navItems = [
  { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Overview' },
  { to: '/admin/slots',     icon: ParkingCircle,   label: 'Slots' },
  { to: '/admin/zones',     icon: Layers,           label: 'Zones' },
  { to: '/admin/priority',  icon: ListOrdered,      label: 'Priority' },
  { to: '/admin/geofence',  icon: MapPin,           label: 'Geofence' },
  { to: '/admin/sensor',    icon: Radio,            label: 'Sensor Sim' },
  { to: '/admin/analytics', icon: BarChart2,        label: 'Analytics' },
];

function InitialsAvatar({ name }) {
  const initials = name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  return (
    <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-700 flex-shrink-0">
      {initials}
    </div>
  );
}

export default function AdminLayout({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const { user, logout } = useAuth();
  const { connected } = useSocket() || {};
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
    toast.success('Signed out', 'See you next time!');
  };

  const handleReset = async () => {
    if (!confirm('Reset all demo data? This will clear all allocations and reset slot status.')) return;
    setResetting(true);
    try {
      await adminApi.resetDemo();
      toast.success('Demo Reset', 'All slots are now available.');
      window.location.reload();
    } catch (e) {
      toast.error('Reset Failed', e.message);
    } finally {
      setResetting(false);
    }
  };

  const SidebarContent = ({ mobile = false }) => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={`flex items-center gap-3 p-4 border-b border-surface-200 ${collapsed && !mobile ? 'justify-center' : ''}`}>
        <div className="w-9 h-9 bg-primary-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-glow">
          <Car className="w-5 h-5 text-white" />
        </div>
        {(!collapsed || mobile) && (
          <div>
            <p className="font-800 text-slate-800 text-base leading-tight">ParkPulse</p>
            <p className="text-xs text-slate-400">Admin Panel</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="Admin navigation">
        {navItems.map(item => {
          const active = location.pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-600 transition-all ${
                active
                  ? 'bg-primary-500 text-white shadow-glow'
                  : 'text-slate-600 hover:bg-surface-100 hover:text-slate-900'
              } ${collapsed && !mobile ? 'justify-center' : ''}`}
              title={collapsed && !mobile ? item.label : undefined}
              aria-current={active ? 'page' : undefined}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {(!collapsed || mobile) && item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom actions */}
      <div className="p-3 border-t border-surface-200 space-y-2">
        <button
          onClick={handleReset}
          disabled={resetting}
          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-600 text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-50 ${collapsed && !mobile ? 'justify-center' : ''}`}
          title="Reset Demo Data"
        >
          <RefreshCw className={`w-5 h-5 flex-shrink-0 ${resetting ? 'animate-spin' : ''}`} />
          {(!collapsed || mobile) && 'Reset Demo'}
        </button>

        <button
          onClick={handleLogout}
          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-600 text-red-500 hover:bg-red-50 transition-colors ${collapsed && !mobile ? 'justify-center' : ''}`}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {(!collapsed || mobile) && 'Sign Out'}
        </button>

        {/* User info */}
        {(!collapsed || mobile) && user && (
          <div className="flex items-center gap-2 px-3 py-2">
            <InitialsAvatar name={user.name} />
            <div className="min-w-0">
              <p className="text-xs font-700 text-slate-700 truncate">{user.name}</p>
              <p className="text-xs text-slate-400">Administrator</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-surface-50 overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className={`hidden md:flex flex-col bg-white border-r border-surface-200 transition-all duration-300 ${collapsed ? 'w-16' : 'w-56'}`}>
        <SidebarContent />
        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute left-full top-1/2 -translate-y-1/2 w-5 h-10 bg-white border border-surface-200 border-l-0 rounded-r-lg flex items-center justify-center text-slate-400 hover:text-slate-600 z-10"
          style={{ left: collapsed ? '64px' : '224px' }}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>
      </aside>

      {/* Mobile Overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40 md:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -240 }}
              animate={{ x: 0 }}
              exit={{ x: -240 }}
              transition={{ type: 'spring', damping: 25 }}
              className="fixed left-0 top-0 bottom-0 w-60 bg-white z-50 md:hidden flex flex-col border-r border-surface-200"
            >
              <button
                className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-surface-100"
                onClick={() => setMobileOpen(false)}
                aria-label="Close sidebar"
              >
                <X className="w-5 h-5" />
              </button>
              <SidebarContent mobile />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b border-surface-200 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-1.5 rounded-lg text-slate-500 hover:bg-surface-100"
              aria-label="Open sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-base font-700 text-slate-800 leading-tight">
                {navItems.find(n => n.to === location.pathname)?.label || 'Admin'}
              </h1>
              <p className="text-xs text-slate-400">PSG College of Technology</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="bg-amber-100 text-amber-700 text-xs font-600 px-2.5 py-1 rounded-full hidden sm:inline">
              🔬 Demo Mode
            </span>
            <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-600 ${connected ? 'bg-primary-50 text-primary-600' : 'bg-surface-100 text-slate-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-primary-500 animate-pulse' : 'bg-slate-400'}`} />
              {connected ? 'Live' : 'Offline'}
            </div>
            {user && <InitialsAvatar name={user.name} />}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
