import { cn, formatIDR } from '@/lib/utils';

interface CurrencyTextProps {
  amount: number;
  className?: string;
  suffix?: string;
}

export function CurrencyText({ amount, className, suffix }: CurrencyTextProps) {
  return (
    <span className={cn('font-mono tabular-nums tracking-tight', className)}>
      {formatIDR(amount)}
      {suffix ? <span className="text-muted-foreground font-sans text-[11px] ml-0.5">{suffix}</span> : null}
    </span>
  );
}

