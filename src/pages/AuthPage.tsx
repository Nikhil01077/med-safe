import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { HeartPulse, Mail, Lock, User, Stethoscope, UserCog, HandHeart, FlaskConical, Loader2, Info } from 'lucide-react';
import type { Role } from '@/types';

const TEST_CREDS = [
  { label: 'Patient', email: 'patient@medsafe.com', password: 'password123' },
  { label: 'Caretaker', email: 'caretaker@medsafe.com', password: 'password123' },
  { label: 'Doctor', email: 'doctor@medsafe.com', password: 'password123' },
  { label: 'Pharmacist', email: 'pharmacist@medsafe.com', password: 'password123' },
];

export default function AuthPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('patient');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    if (mode === 'signin') {
      const { error } = await signIn(email, password);
      if (error) {
        showToast(error, 'error');
        setLoading(false);
      } else {
        showToast('Welcome back!', 'success');
      }
    } else {
      const { error } = await signUp(email, password, name, role);
      if (error) {
        showToast(error, 'error');
        setLoading(false);
      } else {
        showToast('Account created! Redirecting...', 'success');
      }
    }
  };

  const quickFill = (cred: typeof TEST_CREDS[0]) => {
    setEmail(cred.email);
    setPassword(cred.password);
    setMode('signin');
  };

  const roleOptions: { value: Role; label: string; icon: typeof User; desc: string }[] = [
    { value: 'patient', label: 'Patient', icon: HandHeart, desc: 'Track your medications' },
    { value: 'caretaker', label: 'Caretaker', icon: UserCog, desc: 'Monitor your patient' },
    { value: 'doctor', label: 'Doctor', icon: Stethoscope, desc: 'Manage prescriptions' },
    { value: 'pharmacist', label: 'Pharmacist', icon: FlaskConical, desc: 'Dispense medications' },
  ];

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-900 mb-4 shadow-lg">
            <HeartPulse className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900">MedSafe</h1>
          <p className="text-slate-500 mt-1">Medication Safety Platform</p>
        </div>

        {/* Test Credentials Banner */}
        <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-blue-600" />
            <p className="text-sm font-semibold text-blue-900">Test Credentials — Click to fill</p>
          </div>
          <div className="space-y-2">
            {TEST_CREDS.map(cred => (
              <button
                key={cred.label}
                onClick={() => quickFill(cred)}
                className="w-full flex items-center justify-between text-left px-3 py-2 rounded-lg bg-white border border-blue-100 hover:border-blue-300 hover:bg-blue-50 transition-all text-sm group"
              >
                <span className="font-medium text-slate-700">{cred.label}</span>
                <span className="text-slate-500 group-hover:text-blue-600 transition-colors">{cred.email}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-blue-600 mt-2 text-center">Password for all: password123</p>
        </div>

        {/* Auth Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
          {/* Mode Toggle */}
          <div className="flex gap-2 mb-6 p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => setMode('signin')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                mode === 'signin' ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setMode('signup')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                mode === 'signup' ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    placeholder="John Doe"
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-slate-900"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="••••••••"
                  className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-slate-900"
                />
              </div>
            </div>

            {mode === 'signup' && (
              <>
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1.5 block">Role</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {roleOptions.map(opt => {
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setRole(opt.value)}
                          className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                            role === opt.value
                              ? 'border-blue-500 bg-blue-50 text-blue-900'
                              : 'border-slate-200 hover:border-slate-300 text-slate-600'
                          }`}
                        >
                          <Icon className="w-6 h-6" />
                          <span className="text-xs font-semibold">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-800">
                  Your unique ID will be auto-generated after signup. {role === 'patient' ? 'Share it with caretakers and doctors.' : role === 'caretaker' ? 'Use a patient ID to link with them.' : role === 'pharmacist' ? 'Look up patients by their ID to dispense.' : 'Search patients by their ID.'}
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-blue-900 text-white font-semibold hover:bg-blue-800 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg"
            >
              {loading && <Loader2 className="w-5 h-5 animate-spin" />}
              {mode === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-slate-400 mt-6">
          MedSafe — Eliminating medication errors through real-time coordination
        </p>
      </div>
    </div>
  );
}
