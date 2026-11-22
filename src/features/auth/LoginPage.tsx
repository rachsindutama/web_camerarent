import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Aperture,
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { missingFirebaseKeys } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

const SYSTEM_SPECS = [
  {
    code: 'SYS-01',
    label: 'Physical Unit Tracking',
    detail: 'Individual serial-number ledger for bodies, cinema glass, and stabilizers.',
  },
  {
    code: 'SYS-02',
    label: 'Buffer-Aware Allocation',
    detail: 'Atomic Firestore transactions enforcing turnaround charging and cleaning windows.',
  },
  {
    code: 'SYS-03',
    label: 'Strict Liability Separation',
    detail: 'Security deposits isolated from rental revenue in an immutable ledger.',
  },
  {
    code: 'SYS-04',
    label: 'Global KYC & Blacklist Gate',
    detail: 'Cross-tenant renter verification via NIK before checkout authorization.',
  },
];

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const justRegistered = searchParams.get('registered') === '1';

  const { authError, unregisteredEmail, isConfigured, signInWithGoogle } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const handleGoogleSignIn = async () => {
    setSubmitting(true);
    try {
      await signInWithGoogle();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen grid-cols-1 bg-white lg:grid-cols-12">
      {/* Left editorial specification panel */}
      <div className="flex flex-col justify-between border-b border-zinc-200 bg-zinc-50 p-8 lg:col-span-7 lg:border-b-0 lg:border-r lg:p-12">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded border border-zinc-900 bg-zinc-950 text-white">
              <Aperture className="h-4 w-4" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-xs font-semibold tracking-tight text-zinc-950">CAMERARENT</p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                MULTI-TENANT GEAR RENTAL OPS
              </p>
            </div>
          </div>
          <span className="rounded border border-zinc-200 bg-white px-2 py-0.5 font-mono text-[10px] text-zinc-600">
            SPEC v3.0
          </span>
        </div>

        <div className="my-12 max-w-xl">
          <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
            Production Equipment Operations
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
            Precision inventory control for camera houses and production crews.
          </h1>
          <p className="mt-3 text-xs leading-relaxed text-zinc-600">
            Manage multi-branch fleets from Sony A7 IV bodies and Canon RF 24-70mm f/2.8L glass to
            DJI RS3 Pro rigs with serial-level handover checklists, Antar-Jemput dispatch tracking,
            and verifiable accounting.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {SYSTEM_SPECS.map((spec) => (
              <div key={spec.code} className="rounded-md border border-zinc-200 bg-white p-3.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-medium text-zinc-400">
                    {spec.code}
                  </span>
                  <CheckCircle2 className="h-3.5 w-3.5 text-zinc-400" strokeWidth={1.5} />
                </div>
                <p className="mt-2 text-xs font-semibold text-zinc-900">{spec.label}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{spec.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-zinc-200 pt-4 font-mono text-[10px] text-zinc-500">
          <span>RBAC: SUPERADMIN // TENANT_ADMIN // RENTER</span>
          <span>CURRENCY: IDR</span>
        </div>
      </div>

      {/* Right authentication panel */}
      <div className="flex items-center justify-center p-8 lg:col-span-5">
        <div className="w-full max-w-sm space-y-4">
          <Card className="shadow-none">
            <CardHeader className="space-y-1.5">
              <div className="flex items-center gap-2 text-zinc-500">
                <KeyRound className="h-3.5 w-3.5" strokeWidth={1.5} />
                <span className="font-mono text-[10px] uppercase tracking-wider">
                  Identity Access
                </span>
              </div>
              <CardTitle className="text-base">Sign in to CameraRent</CardTitle>
              <CardDescription>
                Registered accounts only. Role permissions and branch context are resolved directly
                from Firestore.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {justRegistered ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                  <div className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" strokeWidth={1.5} />
                    <span>Registration complete</span>
                  </div>
                  <p className="mt-1 text-[11px] text-emerald-800">
                    Your account has been created. Sign in with your registered Google account
                    below.
                  </p>
                </div>
              ) : null}

              {!isConfigured ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                    <span>Firebase environment not configured</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-amber-800">
                    Copy <code className="font-mono font-semibold">.env.example</code> to{' '}
                    <code className="font-mono font-semibold">.env.local</code> and populate:
                  </p>
                  <ul className="mt-1.5 list-disc pl-4 font-mono text-[10px] text-amber-800">
                    {missingFirebaseKeys.map((key) => (
                      <li key={key}>{key}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {unregisteredEmail ? (
                <div className="space-y-2.5 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                    <span>Account Not Registered</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-red-800">
                    <span className="font-mono font-medium">{unregisteredEmail}</span> has not
                    completed registration. Login bypass is disabled — register your NIK and contact
                    details first.
                  </p>
                  <Button asChild size="sm" variant="mono" className="w-full">
                    <Link to="/register">
                      <UserPlus className="h-3.5 w-3.5" strokeWidth={1.5} />
                      Proceed to Registration
                    </Link>
                  </Button>
                </div>
              ) : null}

              {authError ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900">
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                    <span>Authentication Error</span>
                  </div>
                  <p className="mt-1 break-all font-mono text-[10px] leading-relaxed text-red-800">
                    {authError}
                  </p>
                </div>
              ) : null}

              <Button
                type="button"
                className="w-full"
                size="lg"
                disabled={!isConfigured || submitting}
                onClick={handleGoogleSignIn}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M21.35 11.1h-9.18v2.92h5.27c-.23 1.48-1.74 4.35-5.27 4.35-3.17 0-5.76-2.62-5.76-5.87s2.59-5.87 5.76-5.87c1.81 0 3.02.77 3.71 1.43l2.53-2.44C16.78 4.1 14.68 3.2 12.17 3.2 7.21 3.2 3.2 7.21 3.2 12.5s4.01 9.3 8.97 9.3c5.18 0 8.62-3.64 8.62-8.77 0-.59-.07-1.04-.14-1.93z"
                  />
                </svg>
                {submitting ? 'Verifying Registration...' : 'Continue with Google'}
              </Button>

              <Button asChild variant="outline" size="lg" className="w-full">
                <Link to="/register">
                  <UserPlus className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Create New Account
                </Link>
              </Button>

              <Separator />

              <div className="flex items-start gap-2.5 text-[11px] text-zinc-500">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" strokeWidth={1.5} />
                <p className="leading-relaxed">
                  Unregistered Google accounts cannot sign in directly. New renters must complete
                  registration with NIK &amp; phone verification first.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
