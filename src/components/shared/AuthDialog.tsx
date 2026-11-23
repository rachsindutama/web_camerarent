import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ShieldCheck, UserPlus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { missingFirebaseKeys } from '@/lib/firebase';
import { CurrencyText } from '@/components/shared/CurrencyText';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';

export interface CheckoutAuthSummary {
  itemCount: number;
  totalAmount: number;
  branchName: string;
  rentalDays: number;
}

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  justRegistered?: boolean;
  checkoutSummary?: CheckoutAuthSummary | null;
}

export function AuthDialog({
  open,
  onOpenChange,
  justRegistered = false,
  checkoutSummary = null,
}: AuthDialogProps) {
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-4">
        <DialogHeader>
          <DialogTitle>
            {checkoutSummary ? 'Masuk untuk Menyelesaikan Booking' : 'Masuk ke CameraRent'}
          </DialogTitle>
          <DialogDescription>
            {checkoutSummary
              ? 'Draft booking kamu tetap tersimpan. Masuk atau daftar untuk langsung mengunci unit.'
              : 'Masuk dengan akun terdaftar untuk mulai booking dan pantau pesananmu.'}
          </DialogDescription>
        </DialogHeader>

        {checkoutSummary ? (
          <div className="rounded-md border bg-muted/40 px-3 py-2.5 text-xs">
            <p className="text-muted-foreground">
              {checkoutSummary.branchName} · {checkoutSummary.itemCount} item ·{' '}
              {checkoutSummary.rentalDays} hari
            </p>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="font-medium text-foreground">Estimasi Total</span>
              <CurrencyText
                amount={checkoutSummary.totalAmount}
                className="shrink-0 font-semibold text-foreground"
              />
            </div>
          </div>
        ) : null}

        {justRegistered ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" strokeWidth={1.5} />
              <span>Pendaftaran berhasil</span>
            </div>
            <p className="mt-1 text-emerald-800">
              Akun kamu sudah aktif. Silakan masuk menggunakan akun Google yang telah didaftarkan.
            </p>
          </div>
        ) : null}

        {!isConfigured ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
              <span>Konfigurasi Firebase belum lengkap</span>
            </div>
            <p className="mt-1 leading-relaxed text-amber-800">
              Lengkapi <code className="font-mono font-semibold">.env.local</code>:
            </p>
            <ul className="mt-1 list-disc pl-4 font-mono text-[10px] text-amber-800">
              {missingFirebaseKeys.map((key) => (
                <li key={key}>{key}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {unregisteredEmail ? (
          <div className="space-y-2.5 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
              <span>Akun Belum Terdaftar</span>
            </div>
            <p className="leading-relaxed">
              Akun <span className="font-mono font-medium">{unregisteredEmail}</span> belum
              terdaftar. Yuk daftar dulu supaya bisa langsung booking.
            </p>
            <Button asChild size="sm" className="w-full">
              <Link to="/register">
                <UserPlus className="h-3.5 w-3.5" strokeWidth={1.5} />
                Lanjut ke Pendaftaran
              </Link>
            </Button>
          </div>
        ) : null}

        {authError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
              <span>Gagal Masuk</span>
            </div>
            <p className="mt-1 break-all font-mono text-[10px]">{authError}</p>
          </div>
        ) : null}

        <div className="space-y-2.5">
          <Button
            type="button"
            className="w-full"
            size="lg"
            disabled={!isConfigured || submitting}
            onClick={() => void handleGoogleSignIn()}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M21.35 11.1h-9.18v2.92h5.27c-.23 1.48-1.74 4.35-5.27 4.35-3.17 0-5.76-2.62-5.76-5.87s2.59-5.87 5.76-5.87c1.81 0 3.02.77 3.71 1.43l2.53-2.44C16.78 4.1 14.68 3.2 12.17 3.2 7.21 3.2 3.2 7.21 3.2 12.5s4.01 9.3 8.97 9.3c5.18 0 8.62-3.64 8.62-8.77 0-.59-.07-1.04-.14-1.93z"
              />
            </svg>
            {submitting ? 'Memverifikasi Akun...' : 'Masuk dengan Google'}
          </Button>

          <Button asChild variant="outline" size="lg" className="w-full">
            <Link to="/register">
              <UserPlus className="h-4 w-4" strokeWidth={1.5} />
              Daftar Akun Baru
            </Link>
          </Button>
        </div>

        <Separator />

        <div className="flex items-start gap-2.5 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} />
          <p className="leading-relaxed">
            Belum punya akun? Daftar sebentar dulu supaya kamu bisa langsung booking dan pantau
            pesananmu.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

