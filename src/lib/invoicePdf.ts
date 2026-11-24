import { createElement } from 'react';
import { InvoiceDocument } from '@/components/documents/InvoiceDocument';
import { renderReactElementToPng } from '@/lib/htmlPdfEngine';
import { resolveBookingUnitsMap, resolveFreshPlatformSettings } from '@/lib/pdfUnits';
import type { Booking, EquipmentUnit, Tenant, UserProfile } from '@/types/schema';

interface GenerateInvoiceParams {
  booking: Booking;
  tenant: Tenant | null;
  renter?: Pick<UserProfile, 'displayName' | 'email' | 'phone' | 'nik'> | null;
  unitsById?: Record<string, EquipmentUnit>;
}

export async function generateInvoicePdf({
  booking,
  tenant,
  renter,
  unitsById,
}: GenerateInvoiceParams): Promise<void> {
  const [resolvedUnits, settings] = await Promise.all([
    resolveBookingUnitsMap(booking, unitsById),
    resolveFreshPlatformSettings(),
  ]);

  const safeFilename = booking.invoiceNumber.replace(/\//g, '-');
  await renderReactElementToPng(
    createElement(InvoiceDocument, {
      booking,
      tenant,
      renter,
      unitsById: resolvedUnits,
      settings,
    }),
    `${safeFilename}.png`
  );
}
