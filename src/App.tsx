import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import {
  GuestOnlyGuard,
  RequireAuth,
  RoleGuard,
  getDefaultRouteForRole,
} from '@/components/layout/RoleGuard';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { KycOnboardingPage } from '@/features/auth/KycOnboardingPage';
import { BlacklistNoticePage } from '@/features/auth/BlacklistNoticePage';
import { TenantsPage } from '@/features/superadmin/TenantsPage';
import { SettingsPage } from '@/features/superadmin/SettingsPage';
import { InventoryPage } from '@/features/inventory/InventoryPage';
import { BundlesPage } from '@/features/inventory/BundlesPage';
import { CatalogPage } from '@/features/inventory/CatalogPage';
import { MyBookingsPage } from '@/features/bookings/MyBookingsPage';
import { AdminBookingsPage } from '@/features/bookings/AdminBookingsPage';
import { LogisticsPage } from '@/features/logistics/LogisticsPage';
import { InspectionsPage } from '@/features/inspections/InspectionsPage';
import { FinancePage } from '@/features/finance/FinancePage';
import { StaffPage } from '@/features/staff/StaffPage';
import { MembersPage } from '@/features/members/MembersPage';
import { ChatPage } from '@/features/chat/ChatPage';
import { useAuth } from '@/hooks/useAuth';
import { usePlatformSettings } from '@/hooks/usePlatformSettings';

function SettingsBootstrap() {
  usePlatformSettings();
  return null;
}

function RootRedirect() {
  const { userProfile, firebaseUser, needsRegistration, loading } = useAuth();
  if (loading) return null;
  if (firebaseUser && (!userProfile || needsRegistration)) {
    return <Navigate to="/register" replace />;
  }
  if (!firebaseUser || !userProfile) return <Navigate to="/login" replace />;
  return <Navigate to={getDefaultRouteForRole(userProfile.role)} replace />;
}

export function App() {
  return (
    <BrowserRouter>
      <SettingsBootstrap />
      <Routes>
        {/* Guest-only routes */}
        <Route element={<GuestOnlyGuard />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        {/* Authenticated & registered routes */}
        <Route element={<RequireAuth />}>
          <Route path="/blacklisted" element={<BlacklistNoticePage />} />

          <Route element={<AppShell />}>
            {/* Superadmin governance routes */}
            <Route element={<RoleGuard allowedRoles={['superadmin']} />}>
              <Route path="/superadmin/tenants" element={<TenantsPage />} />
              <Route
                path="/superadmin/blacklist"
                element={<Navigate to="/admin/members" replace />}
              />
              <Route
                path="/superadmin/gmv"
                element={<Navigate to="/superadmin/tenants" replace />}
              />
              <Route path="/superadmin/settings" element={<SettingsPage />} />
            </Route>

            {/* Tenant Admin + Superadmin operational routes */}
            <Route element={<RoleGuard allowedRoles={['superadmin', 'admin']} />}>
              <Route path="/admin/inventory" element={<InventoryPage />} />
              <Route path="/admin/bundles" element={<BundlesPage />} />
              <Route path="/admin/bookings" element={<AdminBookingsPage />} />
              <Route path="/admin/logistics" element={<LogisticsPage />} />
              <Route path="/admin/inspections" element={<InspectionsPage />} />
              <Route path="/admin/finance" element={<FinancePage />} />
              <Route path="/admin/staff" element={<StaffPage />} />
              <Route path="/admin/members" element={<MembersPage />} />
              <Route path="/admin/chat" element={<ChatPage mode="admin" />} />
            </Route>

            {/* Renter portal routes */}
            <Route element={<RoleGuard allowedRoles={['user', 'admin', 'superadmin']} />}>
              <Route path="/catalog" element={<CatalogPage />} />
              <Route path="/bookings" element={<MyBookingsPage />} />
              <Route path="/kyc" element={<KycOnboardingPage />} />
              <Route path="/chat" element={<ChatPage mode="user" />} />
            </Route>
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
