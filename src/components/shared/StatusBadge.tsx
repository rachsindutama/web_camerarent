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

const STATUS_MAP: Record<StatusVariant, StatusStyle> = {
  available: {
    label: 'Available',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    dotClass: 'bg-emerald-500',
  },
  rented: {
    label: 'Rented',
    badgeClass: 'border-blue-200 bg-blue-50 text-blue-700',
    dotClass: 'bg-blue-500',
  },
  maintenance: {
    label: 'Maintenance',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-800',
    dotClass: 'bg-amber-500',
  },
  damaged: {
    label: 'Damaged',
    badgeClass: 'border-red-200 bg-red-50 text-red-700',
    dotClass: 'bg-red-500',
  },
  overdue: {
    label: 'Overdue',
    badgeClass: 'border-red-300 bg-red-50 text-red-800',
    dotClass: 'bg-red-600',
  },
  unverified: {
    label: 'KYC Unverified',
    badgeClass: 'border-zinc-200 bg-zinc-100 text-zinc-700',
    dotClass: 'bg-zinc-400',
  },
  pending: {
    label: 'KYC Pending',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-800',
    dotClass: 'bg-amber-500',
  },
  verified: {
    label: 'KYC Verified',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    dotClass: 'bg-emerald-500',
  },
  rejected: {
    label: 'KYC Rejected',
    badgeClass: 'border-red-200 bg-red-50 text-red-700',
    dotClass: 'bg-red-500',
  },
  pending_payment: {
    label: 'Pending Payment',
    badgeClass: 'border-zinc-200 bg-zinc-100 text-zinc-700',
    dotClass: 'bg-zinc-400',
  },
  waiting_verification: {
    label: 'Waiting Verification',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-800',
    dotClass: 'bg-amber-500',
  },
  confirmed: {
    label: 'Confirmed',
    badgeClass: 'border-blue-200 bg-blue-50 text-blue-700',
    dotClass: 'bg-blue-500',
  },
  active_rent: {
    label: 'Active Rent',
    badgeClass: 'border-blue-300 bg-blue-50 text-blue-800',
    dotClass: 'bg-blue-600',
  },
  completed: {
    label: 'Completed',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    dotClass: 'bg-emerald-500',
  },
  cancelled: {
    label: 'Cancelled',
    badgeClass: 'border-zinc-200 bg-zinc-100 text-zinc-500',
    dotClass: 'bg-zinc-400',
  },
  active: {
    label: 'Active',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    dotClass: 'bg-emerald-500',
  },
  suspended: {
    label: 'Suspended',
    badgeClass: 'border-red-200 bg-red-50 text-red-700',
    dotClass: 'bg-red-500',
  },
  blacklisted: {
    label: 'Blacklisted',
    badgeClass: 'border-red-300 bg-red-50 text-red-800',
    dotClass: 'bg-red-600',
  },
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
        'inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[11px] font-medium leading-tight',
        config.badgeClass,
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', config.dotClass)} />
      {label ?? config.label}
    </span>
  );
}

