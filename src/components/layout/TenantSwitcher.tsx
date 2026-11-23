import { Building2, Check, ChevronsUpDown, Globe, Lock } from 'lucide-react';
import { useTenant } from '@/hooks/useTenant';
import { ALL_TENANTS_SCOPE } from '@/store/useTenantStore';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function TenantSwitcher() {
  const {
    tenants,
    activeTenant,
    isAllTenants,
    isSuperAdmin,
    isLockedToTenant,
    isLoading,
    setSelectedTenantId,
  } = useTenant();

  if (isLockedToTenant) {
    return (
      <div className="inline-flex h-7 items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 text-xs text-zinc-700">
        <Lock className="h-3 w-3 text-zinc-400" strokeWidth={1.5} />
        <span className="font-medium text-zinc-900">
          {activeTenant?.name ?? 'Assigned Rental House'}
        </span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-2 border-zinc-200 bg-white px-2.5 text-xs font-normal text-zinc-800 shadow-none"
        >
          {isAllTenants ? (
            <Globe className="h-3.5 w-3.5 text-zinc-500" strokeWidth={1.5} />
          ) : (
            <Building2 className="h-3.5 w-3.5 text-zinc-500" strokeWidth={1.5} />
          )}
          <span className="max-w-[180px] truncate font-medium">
            {isLoading
              ? 'Loading branches...'
              : isAllTenants
                ? `Semua Cabang (${tenants.length})`
                : activeTenant?.name ?? (tenants.length === 0 ? 'No active tenant' : 'Select tenant')}
          </span>
          <ChevronsUpDown className="h-3 w-3 text-zinc-400" strokeWidth={1.5} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Scope Cabang</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isSuperAdmin ? (
          <>
            <DropdownMenuItem
              onSelect={() => setSelectedTenantId(ALL_TENANTS_SCOPE)}
              className="flex items-center justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-zinc-900">Semua Cabang</p>
                <p className="truncate text-[10px] text-zinc-500">
                  Tampilkan seluruh data lintas cabang
                </p>
              </div>
              {isAllTenants ? <Check className="h-3.5 w-3.5 text-primary" strokeWidth={1.5} /> : null}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {tenants.length === 0 ? (
          <div className="px-2 py-2 text-xs text-zinc-500">Belum ada cabang terdaftar.</div>
        ) : (
          tenants.map((tenant) => {
            const isSelected = !isAllTenants && tenant.id === activeTenant?.id;
            return (
              <DropdownMenuItem
                key={tenant.id}
                onSelect={() => setSelectedTenantId(tenant.id)}
                className="flex items-center justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-zinc-900">{tenant.name}</p>
                  <p className="truncate font-mono text-[10px] text-zinc-400">{tenant.slug}</p>
                </div>
                {isSelected ? <Check className="h-3.5 w-3.5 text-primary" strokeWidth={1.5} /> : null}
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
