import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Aperture,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  LogOut,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

const registrationSchema = z.object({
  displayName: z.string().min(3, 'Full legal name must be at least 3 characters'),
  phone: z
    .string()
    .min(10, 'Enter a valid Indonesian phone or WhatsApp number')
    .max(18, 'Phone number is too long')
    .regex(/^[0-9+\-\s]+$/, 'Only digits, spaces, +, or - allowed'),
  nik: z.string().regex(/^\d{16}$/, 'NIK must be exactly 16 numeric digits'),
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the identity & anti-fraud verification terms' }),
  }),
});

type RegistrationFormValues = z.infer<typeof registrationSchema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const {
    firebaseUser,
    needsRegistration,
    authError,
    isConfigured,
    startGoogleRegistration,
    completeRegistration,
    signOut,
  } = useAuth();
  const [verifyingGoogle, setVerifyingGoogle] = useState(false);

  const form = useForm<RegistrationFormValues>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      displayName: firebaseUser?.displayName ?? '',
      phone: '',
      nik: '',
      acceptTerms: true,
    },
  });

  useEffect(() => {
    if (firebaseUser?.displayName && !form.getValues('displayName')) {
      form.setValue('displayName', firebaseUser.displayName);
    }
  }, [firebaseUser?.displayName, form]);

  const isStepTwo = Boolean(firebaseUser && needsRegistration);

  const handleVerifyGoogle = async () => {
    setVerifyingGoogle(true);
    try {
      const result = await startGoogleRegistration();
      if (result === 'already_registered') {
        navigate('/login', { replace: true });
      }
    } finally {
      setVerifyingGoogle(false);
    }
  };

  const onSubmit = async (values: RegistrationFormValues) => {
    const ok = await completeRegistration({
      displayName: values.displayName,
      phone: values.phone,
      nik: values.nik,
    });
    if (ok) {
      navigate('/login?registered=1', { replace: true });
    }
  };

  return (
    <div className="grid min-h-screen grid-cols-1 bg-white lg:grid-cols-12">
      {/* Left onboarding policy panel */}
      <div className="flex flex-col justify-between border-b border-zinc-200 bg-zinc-50 p-8 lg:col-span-5 lg:border-b-0 lg:border-r lg:p-12">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded border border-zinc-900 bg-zinc-950 text-white">
              <Aperture className="h-4 w-4" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight text-zinc-950">CameraRent</p>
              <p className="text-xs text-zinc-500">Renter Onboarding</p>
            </div>
          </div>
          <span className="rounded border border-zinc-200 bg-white px-2 py-0.5 font-mono text-[10px] text-zinc-600">
            MANDATORY GATE
          </span>
        </div>

        <div className="my-10 space-y-6">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
              Account Provisioning Protocol
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
              Register your identity before accessing rental operations.
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-zinc-600">
              Direct login bypass is disabled. Every renter must bind their Google account to a
              valid 16-digit National ID (NIK) and active WhatsApp number prior to signing in.
            </p>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-start gap-3 rounded-md border border-zinc-200 bg-white p-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-zinc-900 bg-zinc-900 font-mono text-[10px] font-semibold text-white">
                01
              </span>
              <div className="text-xs">
                <p className="font-semibold text-zinc-900">Verify Google Identity</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  Bind your verified email address. Already-registered accounts are redirected to
                  sign in.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-md border border-zinc-200 bg-white p-3">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border font-mono text-[10px] font-semibold ${
                  isStepTwo
                    ? 'border-zinc-900 bg-zinc-900 text-white'
                    : 'border-zinc-300 bg-zinc-50 text-zinc-500'
                }`}
              >
                02
              </span>
              <div className="text-xs">
                <p className="font-semibold text-zinc-900">Submit Legal Name, Phone &amp; NIK</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  Enforced both in-app and in Firestore Security Rules before account creation.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-md border border-zinc-200 bg-white p-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-zinc-300 bg-zinc-50 font-mono text-[10px] font-semibold text-zinc-500">
                03
              </span>
              <div className="text-xs">
                <p className="font-semibold text-zinc-900">Sign In &amp; Upload KYC Documents</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  After registration succeeds, log in at <span className="font-mono">/login</span>{' '}
                  and upload your KTP photo to unlock gear checkout.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-zinc-200 pt-4 text-xs text-zinc-500">
          Copyright © {new Date().getFullYear()} PT Pratamavisual Media Kreatif
        </div>
      </div>

      {/* Right registration form panel */}
      <div className="flex items-center justify-center p-8 lg:col-span-7">
        <div className="w-full max-w-md space-y-4">
          <div className="flex items-center justify-between">
            <Button asChild variant="ghost" size="sm" className="-ml-2 text-zinc-600">
              <Link to="/login">
                <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
                Back to Sign In
              </Link>
            </Button>
            <span className="font-mono text-[10px] uppercase text-zinc-400">
              STEP {isStepTwo ? '02 / 02' : '01 / 02'}
            </span>
          </div>

          <Card className="shadow-none">
            <CardHeader className="space-y-1.5">
              <div className="flex items-center gap-2 text-zinc-500">
                <UserPlus className="h-3.5 w-3.5" strokeWidth={1.5} />
                <span className="font-mono text-[10px] uppercase tracking-wider">
                  New Renter Registration
                </span>
              </div>
              <CardTitle className="text-base">
                {isStepTwo ? 'Complete your renter profile' : 'Verify your Google account'}
              </CardTitle>
              <CardDescription>
                {isStepTwo
                  ? 'Fill in your mandatory identity fields to provision your CameraRent account.'
                  : 'Connect your Google account first to verify email ownership before completing registration.'}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {authError ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900">
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                    <span>Registration Error</span>
                  </div>
                  <p className="mt-1 break-all font-mono text-[10px] text-red-800">{authError}</p>
                </div>
              ) : null}

              {!isStepTwo ? (
                <div className="space-y-4">
                  <Button
                    type="button"
                    size="lg"
                    className="w-full"
                    disabled={!isConfigured || verifyingGoogle}
                    onClick={() => void handleVerifyGoogle()}
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M21.35 11.1h-9.18v2.92h5.27c-.23 1.48-1.74 4.35-5.27 4.35-3.17 0-5.76-2.62-5.76-5.87s2.59-5.87 5.76-5.87c1.81 0 3.02.77 3.71 1.43l2.53-2.44C16.78 4.1 14.68 3.2 12.17 3.2 7.21 3.2 3.2 7.21 3.2 12.5s4.01 9.3 8.97 9.3c5.18 0 8.62-3.64 8.62-8.77 0-.59-.07-1.04-.14-1.93z"
                      />
                    </svg>
                    {verifyingGoogle ? 'Verifying Google Account...' : 'Verify with Google to Register'}
                  </Button>

                  <Separator />

                  <p className="text-center text-xs text-zinc-500">
                    Already completed registration?{' '}
                    <Link to="/login" className="font-medium text-primary hover:underline">
                      Sign in here
                    </Link>
                  </p>
                </div>
              ) : (
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50/50 px-3 py-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" strokeWidth={1.5} />
                      <div className="min-w-0">
                        <p className="font-mono text-[10px] uppercase text-emerald-700">
                          Google Email Verified
                        </p>
                        <p className="truncate font-mono text-xs text-zinc-900">
                          {firebaseUser?.email}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void signOut()}
                      className="h-7 shrink-0 text-zinc-600"
                    >
                      <LogOut className="h-3 w-3" strokeWidth={1.5} />
                      Switch
                    </Button>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="reg-name">Full Legal Name (per KTP)</Label>
                    <Input
                      id="reg-name"
                      placeholder="e.g., Sindu Pratama"
                      {...form.register('displayName')}
                    />
                    {form.formState.errors.displayName ? (
                      <p className="text-[11px] text-red-600">
                        {form.formState.errors.displayName.message}
                      </p>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-nik">National ID (NIK — 16 digits)</Label>
                      <Input
                        id="reg-nik"
                        placeholder="3174011203950004"
                        maxLength={16}
                        className="font-mono"
                        {...form.register('nik')}
                      />
                      {form.formState.errors.nik ? (
                        <p className="text-[11px] text-red-600">
                          {form.formState.errors.nik.message}
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="reg-phone">Active Phone / WhatsApp</Label>
                      <Input
                        id="reg-phone"
                        placeholder="+62 812 9000 1234"
                        className="font-mono"
                        {...form.register('phone')}
                      />
                      {form.formState.errors.phone ? (
                        <p className="text-[11px] text-red-600">
                          {form.formState.errors.phone.message}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <label className="flex items-start gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-2.5 text-[11px] text-zinc-600 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 rounded border-zinc-300"
                      {...form.register('acceptTerms')}
                    />
                    <span>
                      I confirm my NIK and contact details are accurate and consent to cross-tenant
                      KYC &amp; global blacklist verification.
                    </span>
                  </label>
                  {form.formState.errors.acceptTerms ? (
                    <p className="text-[11px] text-red-600">
                      {form.formState.errors.acceptTerms.message}
                    </p>
                  ) : null}

                  <Separator />

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full"
                    disabled={form.formState.isSubmitting}
                  >
                    <ShieldCheck className="h-4 w-4" strokeWidth={1.5} />
                    {form.formState.isSubmitting
                      ? 'Creating Account...'
                      : 'Complete Registration'}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

