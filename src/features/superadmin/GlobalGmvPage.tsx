import { useQuery } from '@tanstack/react-query';
import { collection, getDocs } from 'firebase/firestore';
import { BarChart3, Building2, Landmark, ShieldAlert, TrendingUp } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useTenant } from '@/hooks/useTenant';
import { CurrencyText } from '@/components/shared/CurrencyText';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Booking, Transaction } from '@/types/schema';

export function GlobalGmvPage() {
  const { allTenants } = useTenant();

  const { data: bookings = [], isLoading: loadingBookings } = useQuery<Booking[]>({
    queryKey: ['superadmin', 'all-bookings'],
    enabled: Boolean(db),
    queryFn: async () => {
      if (!db) return [];
      const snap = await getDocs(collection(db, 'bookings'));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Booking);
    },
  });

  const { data: transactions = [], isLoading: loadingTx } = useQuery<Transaction[]>({
    queryKey: ['superadmin', 'all-transactions'],
    enabled: Boolean(db),
    queryFn: async () => {
      if (!db) return [];
      const snap = await getDocs(collection(db, 'transactions'));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Transaction);
    },
  });

  const totalRevenue = transactions
    .filter((t) => t.category === 'revenue')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalDepositIn = transactions
    .filter((t) => t.type === 'deposit_in')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalDepositRefund = transactions
    .filter((t) => t.type === 'deposit_refund')
    .reduce((sum, t) => sum + t.amount, 0);

  const depositLiabilityHeld = Math.max(0, totalDepositIn - totalDepositRefund);
  const activeRentals = bookings.filter((b) => b.bookingStatus === 'active_rent').length;
  const overdueBookings = bookings.filter((b) => b.bookingStatus === 'overdue').length;

  const isLoading = loadingBookings || loadingTx;

  return (
    <div className="space-y-5">
      <div className="border-b border-zinc-200 pb-4">
        <h2 className="text-base font-semibold tracking-tight text-zinc-950">
          Global GMV &amp; Platform Telemetry
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Aggregated rental revenue across all tenants with strict separation from refundable
          security deposit liabilities.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-1.5">
            <CardTitle className="font-mono text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Platform Revenue (GMV)
            </CardTitle>
            <TrendingUp className="h-3.5 w-3.5 text-zinc-400" strokeWidth={1.5} />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold text-zinc-950">
              <CurrencyText amount={totalRevenue} />
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">Rental income + overdue &amp; damage fines</p>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-1.5">
            <CardTitle className="font-mono text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Deposit Liability Held
            </CardTitle>
            <Landmark className="h-3.5 w-3.5 text-zinc-400" strokeWidth={1.5} />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold text-zinc-950">
              <CurrencyText amount={depositLiabilityHeld} />
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">Excluded from platform revenue</p>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-1.5">
            <CardTitle className="font-mono text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Active Fleet Rentals
            </CardTitle>
            <BarChart3 className="h-3.5 w-3.5 text-zinc-400" strokeWidth={1.5} />
          </CardHeader>
          <CardContent>
            <div className="font-mono text-lg font-semibold text-zinc-950">{activeRentals}</div>
            <p className="mt-1 text-[11px] text-zinc-500">
              Across {allTenants.filter((t) => t.status === 'active').length} active branches
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-1.5">
            <CardTitle className="font-mono text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Overdue Alerts
            </CardTitle>
            <ShieldAlert className="h-3.5 w-3.5 text-red-500" strokeWidth={1.5} />
          </CardHeader>
          <CardContent>
            <div className="font-mono text-lg font-semibold text-red-700">{overdueBookings}</div>
            <p className="mt-1 text-[11px] text-zinc-500">Active bookings past grace window</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900">
          <Building2 className="h-3.5 w-3.5 text-zinc-500" strokeWidth={1.5} />
          <span>Per-Tenant Breakdown</span>
        </div>

        {isLoading ? (
          <div className="rounded-md border border-zinc-200 bg-white p-8 text-center font-mono text-xs text-zinc-400">
            COMPUTING CROSS-TENANT METRICS...
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total Bookings</TableHead>
                <TableHead>Active / Overdue</TableHead>
                <TableHead className="text-right">Revenue (IDR)</TableHead>
                <TableHead className="text-right">Deposit Liability</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allTenants.map((tenant) => {
                const tBookings = bookings.filter((b) => b.tenantId === tenant.id);
                const tTx = transactions.filter((t) => t.tenantId === tenant.id);
                const rev = tTx
                  .filter((t) => t.category === 'revenue')
                  .reduce((s, t) => s + t.amount, 0);
                const depHeld = Math.max(
                  0,
                  tTx.filter((t) => t.type === 'deposit_in').reduce((s, t) => s + t.amount, 0) -
                    tTx.filter((t) => t.type === 'deposit_refund').reduce((s, t) => s + t.amount, 0)
                );
                const active = tBookings.filter((b) => b.bookingStatus === 'active_rent').length;
                const overdue = tBookings.filter((b) => b.bookingStatus === 'overdue').length;

                return (
                  <TableRow key={tenant.id}>
                    <TableCell>
                      <p className="font-medium text-zinc-950">{tenant.name}</p>
                      <p className="font-mono text-[10px] text-zinc-400">{tenant.slug}</p>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={tenant.status} />
                    </TableCell>
                    <TableCell className="font-mono">{tBookings.length}</TableCell>
                    <TableCell className="font-mono">
                      <span>{active} active</span>
                      {overdue > 0 ? (
                        <span className="ml-2 text-red-600">{overdue} overdue</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <CurrencyText amount={rev} />
                    </TableCell>
                    <TableCell className="text-right">
                      <CurrencyText amount={depHeld} className="text-zinc-600" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

