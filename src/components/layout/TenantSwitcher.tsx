import { Building2, Check, ChevronsUpDown, Globe, LocateFixed, Lock, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { formatBranchDistanceKm } from '@/lib/geo';
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
    sortedTenants,
    activeTenant,
    nearestTenantId,
    distancesById,
    detectingNearest,
    detectNearestBranch,
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

  const listToRender = isSuperAdmin ? tenants : sortedTenants;
  const activeIsNearest = Boolean(
    !isSuperAdmin && activeTenant && nearestTenantId && activeTenant.id === nearestTenantId
  );

  const handleDetectNearest = async () => {
    const loc = await detectNearestBranch();
    if (!loc) {
      toast.error('Tidak dapat mendeteksi lokasi. Pilih cabang secara manual.');
      return;
    }
    setSelectedTenantId(null, false);
    toast.success('Cabang otomatis disesuaikan ke area terdekat Anda.');
  };

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
          ) : activeIsNearest ? (
            <MapPin className="h-3.5 w-3.5 text-zinc-500" strokeWidth={1.5} />
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
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>
          {isSuperAdmin ? 'Scope Cabang' : 'Pilih Cabang Rental'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isSuperAdmin ? (
          <>
            <DropdownMenuItem
              onSelect={() => setSelectedTenantId(ALL_TENANTS_SCOPE, true)}
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
        {listToRender.length === 0 ? (
          <div className="px-2 py-2 text-xs text-zinc-500">Belum ada cabang terdaftar.</div>
        ) : (
          listToRender.map((tenant) => {
            const isSelected = !isAllTenants && tenant.id === activeTenant?.id;
            const distKm = distancesById[tenant.id];
            return (
              <DropdownMenuItem
                key={tenant.id}
                onSelect={() => setSelectedTenantId(tenant.id, true)}
                className="flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-zinc-900">{tenant.name}</p>
                  <p className="truncate font-mono text-[10px] text-zinc-400">
                    {distKm !== undefined
                      ? `~${formatBranchDistanceKm(distKm)} dari lokasi Anda`
                      : tenant.slug}
                  </p>
                </div>
                {isSelected ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={1.5} /> : null}
              </DropdownMenuItem>
            );
          })
        )}
        {!isSuperAdmin && listToRender.length > 1 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => void handleDetectNearest()}
              disabled={detectingNearest}
              className="gap-2 text-xs text-muted-foreground"
            >
              <LocateFixed className="h-3.5 w-3.5" strokeWidth={1.5} />
              <span>{detectingNearest ? 'Mendeteksi lokasi...' : 'Gunakan Cabang Terdekat'}</span>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
