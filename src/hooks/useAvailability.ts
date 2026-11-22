import { useQuery } from '@tanstack/react-query';
import { getAvailableUnits } from '@/lib/availability';
import type { EquipmentUnit } from '@/types/schema';

interface UseAvailabilityParams {
  tenantId: string | null;
  equipmentIds: string[];
  startDate: Date | null;
  endDate: Date | null;
  bufferHours: number;
}

export function useAvailability({
  tenantId,
  equipmentIds,
  startDate,
  endDate,
  bufferHours,
}: UseAvailabilityParams) {
  const sortedIdsKey = [...equipmentIds].sort().join(',');

  return useQuery<Record<string, EquipmentUnit[]>>({
    queryKey: [
      'availability',
      tenantId,
      sortedIdsKey,
      startDate?.toISOString(),
      endDate?.toISOString(),
      bufferHours,
    ],
    enabled:
      Boolean(tenantId) &&
      equipmentIds.length > 0 &&
      Boolean(startDate) &&
      Boolean(endDate) &&
      (endDate?.getTime() ?? 0) > (startDate?.getTime() ?? 0),
    queryFn: async () => {
      if (!tenantId || !startDate || !endDate) return {};
      return getAvailableUnits(tenantId, equipmentIds, startDate, endDate, bufferHours);
    },
    staleTime: 1000 * 30,
  });
}

