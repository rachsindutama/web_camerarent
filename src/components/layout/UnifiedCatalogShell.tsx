import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { LogIn, UserPlus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { usePlatformSettings } from '@/hooks/usePlatformSettings';
import { useBookingDraftStore } from '@/store/useBookingDraftStore';
import { AppShell } from '@/components/layout/AppShell';
import { getDefaultRouteForRole } from '@/components/layout/RoleGuard';
import { TenantSwitcher } from '@/components/layout/TenantSwitcher';
import { AuthDialog, type CheckoutAuthSummary } from '@/components/shared/AuthDialog';
import { BrandMark } from '@/components/shared/BrandMark';
import { LanguageToggle } from '@/components/shared/LanguageToggle';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CatalogPage } from '@/features/inventory/CatalogPage';

export function UnifiedCatalogShell() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { tx } = useI18n();
  const {
    firebaseUser,
    userProfile,
    needsRegistration,
    loading,
    authError,
    unregisteredEmail,
    isConfigured,
  } = useAuth();
  const { settings } = usePlatformSettings();
  const draftItemCount = useBookingDraftStore(
    (s) => s.items.length + s.bundles.length
  );

  const justRegistered = searchParams.get('registered') === '1';
  const authRequested = searchParams.get('auth') === 'login';

  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [checkoutSummary, setCheckoutSummary] = useState<CheckoutAuthSummary | null>(null);
  const wasGuestRef = useRef(false);

  const isAuthenticated = Boolean(firebaseUser && userProfile);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      wasGuestRef.current = true;
    }
  }, [loading, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      setAuthDialogOpen(false);
      setCheckoutSummary(null);
      if (authRequested || justRegistered) {
        setSearchParams({}, { replace: true });
      }
      return;
    }
    if (authRequested || justRegistered || unregisteredEmail || authError || !isConfigured) {
      setAuthDialogOpen(true);
    }
  }, [
    isAuthenticated,
    authRequested,
    justRegistered,
    unregisteredEmail,
    authError,
    isConfigured,
    setSearchParams,
  ]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="w-72 space-y-3 rounded-md border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3.5 w-12" />
          </div>
          <Skeleton className="h-2.5 w-full" />
          <Skeleton className="h-2.5 w-3/4" />
        </div>
      </div>
    );
  }

  if (firebaseUser && (!userProfile || needsRegistration)) {
    return <Navigate to="/register" replace />;
  }

  if (firebaseUser && userProfile) {
    if (userProfile.isBlacklisted && userProfile.role !== 'superadmin') {
      return <Navigate to="/blacklisted" replace />;
    }

    if (
      wasGuestRef.current &&
      userProfile.role !== 'user' &&
      draftItemCount === 0
    ) {
      wasGuestRef.current = false;
      return <Navigate to={getDefaultRouteForRole(userProfile.role)} replace />;
    }
    wasGuestRef.current = false;

    return (
      <AppShell>
        <CatalogPage />
      </AppShell>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50/60 text-foreground">
      {/* Public Topbar for Unified Catalog */}
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
        <div className="mx-auto flex h-12 max-w-[1360px] items-center justify-between gap-4 px-5">
          <div className="flex items-center gap-3">
            <BrandMark size="sm" />
            <span className="h-3.5 w-px bg-zinc-200" />
            <TenantSwitcher />
          </div>

          <div className="flex items-center gap-2">
            <LanguageToggle />
            <Button asChild variant="outline" size="sm">
              <Link to="/register">
                <UserPlus className="h-3.5 w-3.5" strokeWidth={1.5} />
                {tx('Register', 'Daftar')}
              </Link>
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setCheckoutSummary(null);
                setAuthDialogOpen(true);
              }}
            >
              <LogIn className="h-3.5 w-3.5" strokeWidth={1.5} />
              {tx('Sign In', 'Masuk')}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1360px] flex-1 p-6">
        <CatalogPage
          onRequireAuth={(summary) => {
            setCheckoutSummary(summary);
            setAuthDialogOpen(true);
          }}
        />
      </main>

      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-3 px-6 py-4 text-xs text-muted-foreground">
          <span>{settings.seo.footerText}</span>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => {
                setCheckoutSummary(null);
                setAuthDialogOpen(true);
              }}
              className="hover:text-foreground hover:underline"
            >
              {tx('Sign In', 'Masuk')}
            </button>
            <Link to="/register" className="hover:text-foreground hover:underline">
              {tx('Create Account', 'Daftar Akun')}
            </Link>
          </div>
        </div>
      </footer>

      <AuthDialog
        open={authDialogOpen}
        onOpenChange={(open) => {
          setAuthDialogOpen(open);
          if (!open && authRequested) {
            setSearchParams({}, { replace: true });
          }
        }}
        justRegistered={justRegistered}
        checkoutSummary={checkoutSummary}
      />
    </div>
  );
}
