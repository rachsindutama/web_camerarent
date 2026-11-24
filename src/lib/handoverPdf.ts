import { createElement } from 'react';
import { HandoverDocument } from '@/components/documents/HandoverDocument';
import { renderReactElementToPng } from '@/lib/htmlPdfEngine';
import {
  resolveBookingRenter,
  resolveBookingUnitsMap,
  resolveFreshPlatformSettings,
} from '@/lib/pdfUnits';
import type { Booking, EquipmentUnit, Tenant, UserProfile } from '@/types/schema';

interface GenerateHandoverPdfParams {
  booking: Booking;
  tenant: Tenant | null;
  renter?: Pick<UserProfile, 'displayName' | 'email' | 'phone' | 'nik'> | null;
  unitsById?: Record<string, EquipmentUnit>;
}

export async function generateHandoverPdf({
  booking,
  tenant,
  renter,
  unitsById,
}: GenerateHandoverPdfParams): Promise<void> {
  const [resolvedUnits, settings, resolvedRenter] = await Promise.all([
    resolveBookingUnitsMap(booking, unitsById),
    resolveFreshPlatformSettings(),
    resolveBookingRenter(booking, renter),
  ]);

  const safeFilename = booking.invoiceNumber.replace(/\//g, '-');
  await renderReactElementToPng(
    createElement(HandoverDocument, {
      booking,
      tenant,
      renter: resolvedRenter,
      unitsById: resolvedUnits,
      settings,
    }),
    `BAST-${safeFilename}.png`
  );
}
