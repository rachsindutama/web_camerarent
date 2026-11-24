import { Navigate, Outlet, useLocation, Link } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { UserRole } from '@/types/schema';

export function getDefaultRouteForRole(role: UserRole): string {
  switch (role) {
    case 'superadmin':
      return '/superadmin/tenants';
    case 'admin':
      return '/admin/inventory';
    case 'staff':
      return '/admin/bookings';
    case 'user':
    default:
      return '/';
  }
}

function AuthLoadingScreen() {
  const { tx } = useI18n();
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50">
      <div className="w-72 space-y-3 rounded-md border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3.5 w-12" />
        </div>
        <Skeleton className="h-2.5 w-full" />
        <Skeleton className="h-2.5 w-3/4" />
        <p className="pt-1 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
          {tx('Verifying session & RBAC claims', 'Memverifikasi sesi & hak akses')}
        </p>
      </div>
    </div>
  );
}

export function GuestOnlyGuard() {
  const { firebaseUser, userProfile, loading } = useAuth();

  if (loading) {
    return <AuthLoadingScreen />;
  }

  // Only redirect into the app when BOTH Firebase Auth AND registered Firestore userProfile exist
  if (firebaseUser && userProfile) {
    if (userProfile.isBlacklisted && userProfile.role !== 'superadmin') {
      return <Navigate to="/blacklisted" replace />;
    }
    return <Navigate to={getDefaultRouteForRole(userProfile.role)} replace />;
  }

  return <Outlet />;
}

export function RequireAuth() {
  const { firebaseUser, userProfile, needsRegistration, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <AuthLoadingScreen />;
  }

  // Strict NO-BYPASS: an authenticated Google user without a registered Firestore profile is blocked
  if (firebaseUser && (!userProfile || needsRegistration)) {
    return <Navigate to="/register" replace />;
  }

  if (!firebaseUser || !userProfile) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (
    userProfile.isBlacklisted &&
    userProfile.role !== 'superadmin' &&
    location.pathname !== '/blacklisted'
  ) {
    return <Navigate to="/blacklisted" replace />;
  }

  return <Outlet />;
}

interface RoleGuardProps {
  allowedRoles: UserRole[];
  children?: React.ReactNode;
}

export function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const { firebaseUser, userProfile, needsRegistration, loading } = useAuth();
  const { tx } = useI18n();
  const location = useLocation();

  if (loading) {
    return <AuthLoadingScreen />;
  }

  if (firebaseUser && (!userProfile || needsRegistration)) {
    return <Navigate to="/register" replace />;
  }

  if (!firebaseUser || !userProfile) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (userProfile.isBlacklisted && userProfile.role !== 'superadmin') {
    return <Navigate to="/blacklisted" replace />;
  }

  if (!allowedRoles.includes(userProfile.role)) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-6">
        <div className="w-full max-w-md rounded-md border border-zinc-200 bg-white p-6">
          <div className="flex items-center gap-2.5 text-red-700">
            <ShieldAlert className="h-4 w-4" strokeWidth={1.5} />
            <span className="font-mono text-xs font-semibold uppercase tracking-wider">
              {tx('403 // Access Restricted', '403 // Akses Dibatasi')}
            </span>
          </div>
          <h1 className="mt-3 text-base font-semibold text-zinc-950">
            {tx('Insufficient role permissions', 'Izin peran tidak mencukupi')}
          </h1>
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
            {tx('Your current role', 'Peran Anda saat ini')} (
            <span className="font-mono text-zinc-800">{userProfile.role}</span>){' '}
            {tx('does not have authorization to access', 'tidak memiliki izin untuk mengakses')}{' '}
            <span className="font-mono text-zinc-800">{location.pathname}</span>.
          </p>
          <div className="mt-5 flex items-center gap-2 border-t border-zinc-100 pt-4">
            <Button asChild variant="outline" size="sm">
              <Link to={getDefaultRouteForRole(userProfile.role)}>
                <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
                {tx('Return to workspace', 'Kembali ke ruang kerja')}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return children ? <>{children}</> : <Outlet />;
}
