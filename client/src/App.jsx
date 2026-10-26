// ParkPulse Main App
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import { ToastProvider } from './contexts/ToastContext';

// Pages
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import StudentDashboard from './pages/student/StudentDashboard';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminSlots from './pages/admin/AdminSlots';
import AdminZones from './pages/admin/AdminZones';
import AdminGeofence from './pages/admin/AdminGeofence';
import AdminAnalytics from './pages/admin/AdminAnalytics';
import AdminSensor from './pages/admin/AdminSensor';
import AdminPriority from './pages/admin/AdminPriority';

function ProtectedRoute({ children, role }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (role === 'admin' && user.role !== 'admin') return <Navigate to="/student/dashboard" replace />;
  if (role === 'student' && user.role === 'admin') return <Navigate to="/admin/dashboard" replace />;
  return children;
}

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-full border-4 border-primary-200 border-t-primary-500 animate-spin" />
        <p className="text-slate-500 font-medium">Loading ParkPulse...</p>
      </div>
    </div>
  );
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (user) return <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/student/dashboard'} replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />

      {/* Student/Staff */}
      <Route path="/student/dashboard" element={
        <ProtectedRoute role="student"><StudentDashboard /></ProtectedRoute>
      } />

      {/* Admin */}
      <Route path="/admin/dashboard" element={
        <ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>
      } />
      <Route path="/admin/slots" element={
        <ProtectedRoute role="admin"><AdminSlots /></ProtectedRoute>
      } />
      <Route path="/admin/zones" element={
        <ProtectedRoute role="admin"><AdminZones /></ProtectedRoute>
      } />
      <Route path="/admin/geofence" element={
        <ProtectedRoute role="admin"><AdminGeofence /></ProtectedRoute>
      } />
      <Route path="/admin/analytics" element={
        <ProtectedRoute role="admin"><AdminAnalytics /></ProtectedRoute>
      } />
      <Route path="/admin/sensor" element={
        <ProtectedRoute role="admin"><AdminSensor /></ProtectedRoute>
      } />
      <Route path="/admin/priority" element={
        <ProtectedRoute role="admin"><AdminPriority /></ProtectedRoute>
      } />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <SocketProvider>
            <AppRoutes />
          </SocketProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
