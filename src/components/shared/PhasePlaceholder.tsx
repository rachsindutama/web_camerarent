import { Layers } from 'lucide-react';
import { EmptyState } from '@/components/shared/EmptyState';

interface PhasePlaceholderProps {
  moduleName: string;
  phase: string;
  summary: string;
}

export function PhasePlaceholder({ moduleName, phase, summary }: PhasePlaceholderProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-zinc-950">{moduleName}</h2>
          <p className="mt-0.5 text-xs text-zinc-500">{summary}</p>
        </div>
        <span className="rounded border border-zinc-200 bg-white px-2 py-0.5 font-mono text-[10px] font-medium uppercase text-zinc-600">
          Scheduled // {phase}
        </span>
      </div>

      <EmptyState
        icon={Layers}
        title={`${moduleName} module queued for ${phase}`}
        description="Route protection, RBAC guard, and tenant context are active. This module will be implemented in the next confirmed build phase."
      />
    </div>
  );
}

