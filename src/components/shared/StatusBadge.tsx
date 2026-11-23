import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';

export type StatusVariant =
  | 'available'
  | 'rented'
  | 'maintenance'
  | 'damaged'
  | 'overdue'
  | 'unverified'
  | 'pending'
  | 'verified'
  | 'rejected'
  | 'pending_payment'
  | 'waiting_verification'
  | 'confirmed'
  | 'active_rent'
  | 'completed'
  | 'cancelled'
  | 'active'
  | 'suspended'
  | 'blacklisted';

interface StatusStyle {
  labelEn: string;
  labelId: string;
  badgeClass: string;
  dotClass: string;
}

const NEUTRAL_BADGE = 'border-border bg-background text-foreground';
const DESTRUCTIVE_BADGE = 'border-destructive/30 bg-destructive/10 text-destructive';

const STATUS_MAP: Record<StatusVariant, StatusStyle> = {
  available: { labelEn: 'Available', labelId: 'Tersedia', badgeClass: NEUTRAL_BADGE, dotClass: 'bg-emerald-500' },
  rented: { labelEn: 'Rented', labelId: 'Disewa', badgeClass: NEUTRAL_BADGE, dotClass: 'bg-zinc-900' },
  maintenance: { labelEn: 'Maintenance', labelId: 'Perawatan', badgeClass: NEUTRAL_BADGE, dotClass: 'bg-amber-500' },
  damaged: { labelEn: 'Damaged', labelId: 'Rusak', badgeClass: DESTRUCTIVE_BADGE, dotClass: 'bg-red-500' },
  overdue: { labelEn: 'Overdue', labelId: 'Terlambat', badgeClass: DESTRUCTIVE_BADGE, dotClass: 'bg-red-500' },
  unverified: { labelEn: 'Unverified', labelId: 'Belum Verifikasi', badgeClass: NEUTRAL_BADGE, dotClass: 'bg-zinc-300' },
  pending: { labelEn: 'KYC Pending', labelId: 'KYC Menunggu', badgeClass: NEUTRAL_BADGE, dotClass: 'bg-amber-500' },
  verified: { labelEn: 'KYC Verified', labelId: 'KYC Terverifikasi', badgeClass: NEUTRAL_BADGE, dotClass: 'bg-emerald-500' },
  rejected: { labelEn: 'KYC Rejected', labelId: 'KYC Ditolak', badgeClass: DESTRUCTIVE_BADGE, dotClass: 'bg-red-500' },
  pending_payment: { labelEn: 'Pending Payment', labelId: 'Menunggu Pembayaran', badgeClass: NEUTRAL_BADGE, dotClass: 'bg-zinc-300' },
  waiting_verification: { labelEn: 'Waiting Verification', labelId: 'Menunggu Verifikasi', badgeClass: NEUTRAL_BADGE, dotClass: 'bg-amber-500' },
  confirmed: { labelEn: 'Confirmed', labelId: 'Dikonfirmasi', badgeClass: NEUTRAL_BADGE, dotClass: 'bg-zinc-900' },
  active_rent: { labelEn: 'Active Rent', labelId: 'Sedang Disewa', badgeClass: NEUTRAL_BADGE, dotClass: 'bg-zinc-900' },
  completed: { labelEn: 'Completed', labelId: 'Selesai', badgeClass: NEUTRAL_BADGE, dotClass: 'bg-emerald-500' },
  cancelled: { labelEn: 'Cancelled', labelId: 'Dibatalkan', badgeClass: 'border-border bg-muted text-muted-foreground', dotClass: 'bg-zinc-400' },
  active: { labelEn: 'Active', labelId: 'Aktif', badgeClass: NEUTRAL_BADGE, dotClass: 'bg-emerald-500' },
  suspended: { labelEn: 'Suspended', labelId: 'Ditangguhkan', badgeClass: DESTRUCTIVE_BADGE, dotClass: 'bg-red-500' },
  blacklisted: { labelEn: 'Blacklisted', labelId: 'Daftar Hitam', badgeClass: DESTRUCTIVE_BADGE, dotClass: 'bg-red-500' },
};

interface StatusBadgeProps {
  status: StatusVariant;
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const { tx } = useI18n();
  const config = STATUS_MAP[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium leading-tight',
        config.badgeClass,
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', config.dotClass)} />
      {label ?? tx(config.labelEn, config.labelId)}
    </span>
  );
}
