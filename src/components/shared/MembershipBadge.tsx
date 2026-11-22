import { Award, User } from 'lucide-react';
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
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider leading-tight',
        isPremium
          ? 'border-zinc-900 bg-zinc-900 text-amber-300'
          : 'border-zinc-200 bg-zinc-100 text-zinc-600',
        className
      )}
    >
      {isPremium ? (
        <Award className="h-3 w-3 shrink-0" strokeWidth={1.75} />
      ) : (
        <User className="h-3 w-3 shrink-0" strokeWidth={1.5} />
      )}
      {isPremium ? 'PREMIUM' : 'GENERAL'}
    </span>
  );
}

