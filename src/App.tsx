import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ToastProvider } from '@/lib/toast';
import AuthPage from '@/pages/AuthPage';
import PatientPortal from '@/pages/PatientPortal';
import CaretakerPortal from '@/pages/CaretakerPortal';
import DoctorPortal from '@/pages/DoctorPortal';
import PharmacistPortal from '@/pages/PharmacistPortal';
import { Loader2 } from 'lucide-react';
import type { Role } from '@/types';

function ProtectedRoute({ children, role }: { children: React.ReactNode; role: Role }) {
  const { profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <Loader2 className="w-8 h-8 animate-spin text-blue-900" />
      </div>
    );
  }

  if (!profile) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  if (profile.role !== role) {
    return <Navigate to={`/${profile.role}`} replace />;
  }

  return <>{children}</>;
}

function RootRedirect() {
  const { profile, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <Loader2 className="w-8 h-8 animate-spin text-blue-900" />
      </div>
    );
  }
  if (profile) {
    return <Navigate to={`/${profile.role}`} replace />;
  }
  return <AuthPage />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/patient" element={<ProtectedRoute role="patient"><PatientPortal /></ProtectedRoute>} />
      <Route path="/caretaker" element={<ProtectedRoute role="caretaker"><CaretakerPortal /></ProtectedRoute>} />
      <Route path="/doctor" element={<ProtectedRoute role="doctor"><DoctorPortal /></ProtectedRoute>} />
      <Route path="/pharmacist" element={<ProtectedRoute role="pharmacist"><PharmacistPortal /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
