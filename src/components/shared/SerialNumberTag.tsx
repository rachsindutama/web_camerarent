import { cn } from '@/lib/utils';

interface SerialNumberTagProps {
  serialNumber: string;
  className?: string;
}

export function SerialNumberTag({ serialNumber, className }: SerialNumberTagProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center whitespace-nowrap rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10.5px] font-medium leading-none text-zinc-700',
        className
      )}
    >
      {serialNumber}
    </span>
  );
}

