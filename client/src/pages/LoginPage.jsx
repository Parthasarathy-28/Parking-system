// Login Page - Admin and Student login with demo helper
import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Car, Shield, Mail, Lock, Eye, EyeOff, ArrowLeft, Zap, Bike } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

const DEMO_ACCOUNTS = {
  admin: { email: 'admin@parkpulse.edu', password: 'Admin@123', label: 'Admin (Dr. Rajesh Kumar)', role: 'admin' },
  arun:  { email: 'arun@student.psg.edu',  password: 'Student@123', label: 'Arun (Student, Bike)', role: 'student' },
  bala:  { email: 'bala@student.psg.edu',  password: 'Student@123', label: 'Bala (Student, Car)',  role: 'student' },
  staff: { email: 'suresh@staff.psg.edu',  password: 'Staff@123',   label: 'Prof. Suresh (Staff)', role: 'staff' },
};

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('role') === 'admin' ? 'admin' : 'student');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const fillDemo = (account) => {
    setEmail(account.email);
    setPassword(account.password);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(email, password);
      toast.success('Welcome back!', `Signed in as ${data.user.name}`);
      navigate(data.redirectTo);
    } catch (err) {
      setError(err.message || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface-50 via-primary-50/20 to-secondary-50/10 flex flex-col">
      {/* Navbar */}
      <nav className="p-4">
        <Link to="/" className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-600">Back to ParkPulse</span>
        </Link>
      </nav>

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-primary-500 rounded-2xl mb-4 shadow-glow">
              <Car className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-3xl font-800 text-slate-900">ParkPulse</h1>
            <p className="text-slate-500 mt-1">Sign in to your account</p>
            <span className="inline-block bg-amber-100 text-amber-700 text-xs font-600 px-3 py-1 rounded-full mt-2">🔬 Demo Mode Active</span>
          </div>

          {/* Card */}
          <div className="bg-white rounded-3xl shadow-card-lg border border-surface-200 overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-surface-200">
              {[
                { key: 'student', label: 'Student / Staff', icon: Bike },
                { key: 'admin',   label: 'College Admin',   icon: Shield },
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => { setTab(t.key); setError(''); setEmail(''); setPassword(''); }}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-4 text-sm font-600 transition-colors ${
                    tab === t.key
                      ? 'text-primary-600 border-b-2 border-primary-500 bg-primary-50/50'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                  aria-selected={tab === t.key}
                >
                  <t.icon className="w-4 h-4" />
                  {t.label}
                </button>
              ))}
            </div>

            <div className="p-6">
              {/* Demo fill buttons */}
              <div className="mb-5">
                <p className="text-xs font-600 text-slate-400 uppercase tracking-wide mb-2">Quick Fill – Demo Accounts</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(DEMO_ACCOUNTS)
                    .filter(([, acc]) => tab === 'admin' ? acc.role === 'admin' : acc.role !== 'admin')
                    .map(([key, acc]) => (
                      <button
                        key={key}
                        onClick={() => fillDemo(acc)}
                        className="bg-surface-50 hover:bg-surface-100 border border-surface-200 text-slate-600 text-xs px-3 py-1.5 rounded-lg font-500 transition-colors"
                      >
                        {acc.label}
                      </button>
                    ))}
                </div>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-600 text-slate-700 mb-1.5" htmlFor="email">Email address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className="w-full pl-10 pr-4 py-2.5 border border-surface-300 rounded-xl text-sm focus:ring-2 focus:ring-primary-300 focus:border-primary-400 outline-none transition-all bg-white"
                      placeholder="you@college.edu"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-600 text-slate-700 mb-1.5" htmlFor="password">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      id="password"
                      type={showPass ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="w-full pl-10 pr-10 py-2.5 border border-surface-300 rounded-xl text-sm focus:ring-2 focus:ring-primary-300 focus:border-primary-400 outline-none transition-all bg-white"
                      placeholder="••••••••"
                    />
                    <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label={showPass ? 'Hide password' : 'Show password'}>
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2"
                      role="alert"
                    >
                      {error}
                    </motion.p>
                  )}
                </AnimatePresence>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-primary-500 hover:bg-primary-600 disabled:opacity-60 text-white py-3 rounded-xl font-700 transition-all flex items-center justify-center gap-2 shadow-glow"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <><Zap className="w-4 h-4" /> Sign In</>
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Credentials reference */}
          <div className="mt-6 bg-white/70 backdrop-blur rounded-2xl border border-surface-200 p-4">
            <p className="text-xs font-700 text-slate-400 uppercase tracking-wide mb-2">Demo Credentials</p>
            <div className="space-y-1 text-xs text-slate-600">
              <p><span className="font-600 text-slate-700">Admin:</span> admin@parkpulse.edu / Admin@123</p>
              <p><span className="font-600 text-slate-700">Arun:</span> arun@student.psg.edu / Student@123</p>
              <p><span className="font-600 text-slate-700">Bala:</span> bala@student.psg.edu / Student@123</p>
              <p><span className="font-600 text-slate-700">Staff:</span> suresh@staff.psg.edu / Staff@123</p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
