import { ShieldBan, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { LanguageToggle } from '@/components/shared/LanguageToggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export function BlacklistNoticePage() {
  const { userProfile, signOut } = useAuth();
  const { tx } = useI18n();

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-zinc-50 p-6">
      <div className="absolute right-6 top-6">
        <LanguageToggle />
      </div>
      <Card className="w-full max-w-md border-red-200 shadow-none">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2 text-red-700">
            <ShieldBan className="h-4 w-4" strokeWidth={1.5} />
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider">
              {tx('Global Registry // Account Flagged', 'Registri Global // Akun Ditandai')}
            </span>
          </div>
          <CardTitle className="text-base">
            {tx('Rental access suspended', 'Akses sewa ditangguhkan')}
          </CardTitle>
          <CardDescription>
            {tx(
              'This account has been placed on the platform-wide blacklist. Equipment reservations and dispatch requests are disabled across all participating rental houses.',
              'Akun ini masuk dalam daftar hitam global. Pemesanan alat dan pengiriman dinonaktifkan di seluruh cabang.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-red-200 bg-red-50/60 p-3 text-xs">
            <p className="font-mono text-[10px] uppercase tracking-wider text-red-600">
              {tx('Recorded Reason', 'Alasan Tercatat')}
            </p>
            <p className="mt-1 text-red-950">
              {userProfile?.blacklistReason ??
                tx(
                  'Unresolved equipment dispute or overdue liability flagged by platform governance.',
                  'Sengketa peralatan atau tunggakan keterlambatan belum terselesaikan.'
                )}
            </p>
          </div>

          <div className="space-y-1.5 rounded-md border border-zinc-200 bg-zinc-50 p-3 font-mono text-[11px] text-zinc-600">
            <div className="flex justify-between">
              <span className="text-zinc-400">{tx('ACCOUNT', 'AKUN')}</span>
              <span className="text-zinc-900">{userProfile?.email}</span>
            </div>
            {userProfile?.nik ? (
              <div className="flex justify-between">
                <span className="text-zinc-400">NIK</span>
                <span className="text-zinc-900">{userProfile.nik}</span>
              </div>
            ) : null}
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-zinc-500">
              {tx('Contact platform governance to appeal.', 'Hubungi admin platform untuk banding.')}
            </span>
            <Button variant="outline" size="sm" onClick={() => void signOut()}>
              <LogOut className="h-3.5 w-3.5" strokeWidth={1.5} />
              {tx('Sign out', 'Keluar')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
