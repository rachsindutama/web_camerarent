import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-md border border-dashed border-zinc-300 bg-zinc-50/50 px-6 py-12 text-center',
        className
      )}
    >
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500">
        <Icon className="h-4 w-4" strokeWidth={1.5} />
      </div>
      <h3 className="text-sm font-medium text-zinc-950">{title}</h3>
      <p className="mt-1 max-w-sm text-xs text-zinc-500">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

