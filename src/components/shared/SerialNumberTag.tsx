import { cn } from '@/lib/utils';

interface SerialNumberTagProps {
  serialNumber: string;
  className?: string;
}

export function SerialNumberTag({ serialNumber, className }: SerialNumberTagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[11px] font-medium text-zinc-700',
        className
      )}
    >
      {serialNumber}
    </span>
  );
}

