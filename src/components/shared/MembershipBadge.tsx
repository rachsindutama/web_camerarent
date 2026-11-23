import { cn } from '@/lib/utils';
import type { MembershipTier } from '@/types/schema';

interface MembershipBadgeProps {
  tier?: MembershipTier | null;
  className?: string;
}

export function MembershipBadge({ tier, className }: MembershipBadgeProps) {
  const isPremium = tier === 'premium';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium leading-tight transition-colors',
        isPremium
          ? 'border-transparent bg-primary text-primary-foreground shadow-sm'
          : 'border-transparent bg-secondary text-secondary-foreground',
        className
      )}
    >
      {isPremium ? 'Premium' : 'Basic'}
    </span>
  );
}
