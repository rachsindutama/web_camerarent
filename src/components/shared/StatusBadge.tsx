import { cn } from '@/lib/utils';

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
  label: string;
  badgeClass: string;
  dotClass: string;
}

const NEUTRAL_BADGE = 'border-border bg-background text-foreground';
const DESTRUCTIVE_BADGE = 'border-destructive/30 bg-destructive/10 text-destructive';

const STATUS_MAP: Record<StatusVariant, StatusStyle> = {
  available: { label: 'Available', badgeClass: NEUTRAL_BADGE, dotClass: 'bg-emerald-500' },
  rented: { label: 'Rented', badgeClass: NEUTRAL_BADGE, dotClass: 'bg-zinc-900' },
  maintenance: { label: 'Maintenance', badgeClass: NEUTRAL_BADGE, dotClass: 'bg-amber-500' },
  damaged: { label: 'Damaged', badgeClass: DESTRUCTIVE_BADGE, dotClass: 'bg-red-500' },
  overdue: { label: 'Overdue', badgeClass: DESTRUCTIVE_BADGE, dotClass: 'bg-red-500' },
  unverified: { label: 'Unverified', badgeClass: NEUTRAL_BADGE, dotClass: 'bg-zinc-300' },
  pending: { label: 'KYC Pending', badgeClass: NEUTRAL_BADGE, dotClass: 'bg-amber-500' },
  verified: { label: 'KYC Verified', badgeClass: NEUTRAL_BADGE, dotClass: 'bg-emerald-500' },
  rejected: { label: 'KYC Rejected', badgeClass: DESTRUCTIVE_BADGE, dotClass: 'bg-red-500' },
  pending_payment: { label: 'Pending Payment', badgeClass: NEUTRAL_BADGE, dotClass: 'bg-zinc-300' },
  waiting_verification: { label: 'Waiting Verification', badgeClass: NEUTRAL_BADGE, dotClass: 'bg-amber-500' },
  confirmed: { label: 'Confirmed', badgeClass: NEUTRAL_BADGE, dotClass: 'bg-zinc-900' },
  active_rent: { label: 'Active Rent', badgeClass: NEUTRAL_BADGE, dotClass: 'bg-zinc-900' },
  completed: { label: 'Completed', badgeClass: NEUTRAL_BADGE, dotClass: 'bg-emerald-500' },
  cancelled: { label: 'Cancelled', badgeClass: 'border-border bg-muted text-muted-foreground', dotClass: 'bg-zinc-400' },
  active: { label: 'Active', badgeClass: NEUTRAL_BADGE, dotClass: 'bg-emerald-500' },
  suspended: { label: 'Suspended', badgeClass: DESTRUCTIVE_BADGE, dotClass: 'bg-red-500' },
  blacklisted: { label: 'Blacklisted', badgeClass: DESTRUCTIVE_BADGE, dotClass: 'bg-red-500' },
};

interface StatusBadgeProps {
  status: StatusVariant;
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
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
      {label ?? config.label}
    </span>
  );
}
