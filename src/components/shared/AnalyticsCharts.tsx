import { useMemo, useState } from 'react';
import { BarChart3, Building2, Flame } from 'lucide-react';
import { calculateRentalDays } from '@/lib/availability';
import { formatIDR } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import { CurrencyText } from '@/components/shared/CurrencyText';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Booking, Tenant, Transaction } from '@/types/schema';

function formatCompactIDR(amount: number): string {
  if (amount >= 1_000_000) {
    const m = amount / 1_000_000;
    return `Rp ${m >= 10 ? m.toFixed(0) : m.toFixed(1).replace(/\.0$/, '')}jt`;
  }
  if (amount >= 1_000) {
    return `Rp ${Math.round(amount / 1_000)}rb`;
  }
  return `Rp ${amount}`;
}

interface RevenueExpenseChartProps {
  transactions: Transaction[];
}

export function RevenueExpenseChart({ transactions }: RevenueExpenseChartProps) {
  const { tx, lang } = useI18n();
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const buckets = useMemo(() => {
    const map = new Map<string, { dateKey: string; label: string; revenue: number; expense: number }>();
    const locale = lang === 'id' ? 'id-ID' : 'en-GB';

    transactions.forEach((entry) => {
      if (entry.category !== 'revenue' && entry.category !== 'expense') return;
      const d = entry.createdAt?.toDate ? entry.createdAt.toDate() : new Date();
      const dateKey = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString(locale, { day: '2-digit', month: 'short' });
      const cur = map.get(dateKey) ?? { dateKey, label, revenue: 0, expense: 0 };
      if (entry.category === 'revenue') cur.revenue += entry.amount;
      if (entry.category === 'expense') cur.expense += entry.amount;
      map.set(dateKey, cur);
    });

    return Array.from(map.values())
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
      .slice(-10);
  }, [transactions, lang]);

  const maxValue = useMemo(() => {
    const peak = buckets.reduce((m, b) => Math.max(m, b.revenue, b.expense), 0);
    return peak > 0 ? peak : 1;
  }, [buckets]);

  const totalRev = buckets.reduce((s, b) => s + b.revenue, 0);
  const totalExp = buckets.reduce((s, b) => s + b.expense, 0);
  const marginPct = totalRev > 0 ? Math.round(((totalRev - totalExp) / totalRev) * 100) : 0;

  const activeBucket = buckets.find((b) => b.dateKey === hoveredKey) ?? null;

  return (
    <Card className="shadow-none">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
        <div>
          <CardTitle className="flex items-center gap-1.5 text-sm font-semibold text-zinc-950">
            <BarChart3 className="h-4 w-4 text-zinc-500" strokeWidth={1.5} />
            {tx('Revenue vs Operating Expense', 'Pendapatan vs Biaya Operasional')}
          </CardTitle>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            {tx(
              'Daily cash flow trend excluding refundable deposit liabilities.',
              'Tren arus kas harian di luar liabilitas deposit jaminan.'
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="inline-flex items-center gap-1.5 text-zinc-700">
            <span className="h-2.5 w-2.5 rounded-sm bg-zinc-900" />
            {tx('Revenue', 'Pendapatan')}
          </span>
          <span className="inline-flex items-center gap-1.5 text-zinc-700">
            <span className="h-2.5 w-2.5 rounded-sm bg-red-400" />
            {tx('Expense', 'Biaya')}
          </span>
          <span className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-zinc-700">
            {tx('Margin', 'Margin')} {marginPct}%
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {buckets.length === 0 ? (
          <div className="flex h-44 items-center justify-center rounded border border-dashed border-zinc-200 text-xs text-zinc-400">
            {tx('No revenue or expense records yet.', 'Belum ada data pendapatan atau pengeluaran.')}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Hover Telemetry Bar */}
            <div className="flex min-h-[28px] flex-wrap items-center justify-between gap-2 rounded border border-zinc-100 bg-zinc-50/70 px-3 py-1 font-mono text-[11px]">
              {activeBucket ? (
                <>
                  <span className="font-semibold text-zinc-900">{activeBucket.label}</span>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-zinc-700">
                      {tx('Rev:', 'Masuk:')} <strong>{formatIDR(activeBucket.revenue)}</strong>
                    </span>
                    <span className="text-red-700">
                      {tx('Exp:', 'Keluar:')} <strong>{formatIDR(activeBucket.expense)}</strong>
                    </span>
                    <span className="text-emerald-700">
                      {tx('Net:', 'Bersih:')}{' '}
                      <strong>{formatIDR(activeBucket.revenue - activeBucket.expense)}</strong>
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-zinc-500">
                    {tx(
                      `Showing ${buckets.length} active day(s) · Hover bar to inspect`,
                      `Menampilkan ${buckets.length} hari aktif · Arahkan kursor ke grafik`
                    )}
                  </span>
                  <span className="text-zinc-700">
                    {tx('Peak:', 'Tertinggi:')} {formatCompactIDR(maxValue)}
                  </span>
                </>
              )}
            </div>

            {/* Grouped Bar Chart */}
            <div className="relative pt-2">
              {/* Horizontal reference lines */}
              <div className="pointer-events-none absolute inset-x-0 top-2 bottom-6 flex flex-col justify-between">
                <div className="border-t border-dashed border-zinc-200" />
                <div className="border-t border-dashed border-zinc-100" />
                <div className="border-t border-zinc-200" />
              </div>

              <div className="relative flex h-44 items-end gap-2 pt-2">
                {buckets.map((bucket) => {
                  const revH = Math.max(
                    bucket.revenue > 0 ? 4 : 0,
                    Math.round((bucket.revenue / maxValue) * 100)
                  );
                  const expH = Math.max(
                    bucket.expense > 0 ? 4 : 0,
                    Math.round((bucket.expense / maxValue) * 100)
                  );
                  const isActive = hoveredKey === bucket.dateKey;

                  return (
                    <div
                      key={bucket.dateKey}
                      onMouseEnter={() => setHoveredKey(bucket.dateKey)}
                      onMouseLeave={() => setHoveredKey(null)}
                      className={`group flex h-full flex-1 flex-col items-center justify-end gap-1.5 rounded px-0.5 transition-colors ${
                        isActive ? 'bg-zinc-100/70' : ''
                      }`}
                    >
                      <div className="flex h-full w-full items-end justify-center gap-1 pt-2">
                        <div
                          style={{ height: `${revH}%` }}
                          className="w-full max-w-[20px] rounded-t bg-zinc-900 transition-all group-hover:bg-zinc-700"
                          title={`${bucket.label} — ${tx('Revenue', 'Pendapatan')}: ${formatIDR(bucket.revenue)}`}
                        />
                        <div
                          style={{ height: `${expH}%` }}
                          className="w-full max-w-[20px] rounded-t bg-red-400 transition-all group-hover:bg-red-500"
                          title={`${bucket.label} — ${tx('Expense', 'Biaya')}: ${formatIDR(bucket.expense)}`}
                        />
                      </div>
                      <span className="w-full truncate text-center font-mono text-[10px] text-zinc-500">
                        {bucket.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface TopRentedGearChartProps {
  bookings: Booking[];
  limit?: number;
}

export function TopRentedGearChart({ bookings, limit = 6 }: TopRentedGearChartProps) {
  const { tx } = useI18n();

  const rankedGear = useMemo(() => {
    const map = new Map<
      string,
      { name: string; rentCount: number; estRevenue: number; daysTotal: number }
    >();

    bookings.forEach((booking) => {
      if (booking.bookingStatus === 'cancelled') return;
      const days =
        booking.startDate && booking.endDate
          ? calculateRentalDays(booking.startDate.toDate(), booking.endDate.toDate())
          : 1;
      booking.items.forEach((item) => {
        const key = item.equipmentName;
        const cur = map.get(key) ?? {
          name: item.equipmentName,
          rentCount: 0,
          estRevenue: 0,
          daysTotal: 0,
        };
        cur.rentCount += 1;
        cur.daysTotal += days;
        cur.estRevenue += item.dailyRate * days;
        map.set(key, cur);
      });
    });

    return Array.from(map.values())
      .sort((a, b) => b.estRevenue - a.estRevenue || b.rentCount - a.rentCount)
      .slice(0, limit);
  }, [bookings, limit]);

  const topRevenue = rankedGear[0]?.estRevenue ?? 1;

  return (
    <Card className="shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-1.5 text-sm font-semibold text-zinc-950">
          <Flame className="h-4 w-4 text-zinc-500" strokeWidth={1.5} />
          {tx('Top Rented Equipment', 'Alat Paling Sering Disewa')}
        </CardTitle>
        <p className="text-[11px] text-zinc-500">
          {tx(
            'Ranked by gross rental volume across non-cancelled bookings.',
            'Urutan berdasarkan volume sewa kotor dari booking non-batal.'
          )}
        </p>
      </CardHeader>
      <CardContent>
        {rankedGear.length === 0 ? (
          <div className="flex h-44 items-center justify-center rounded border border-dashed border-zinc-200 text-xs text-zinc-400">
            {tx('No equipment rental history yet.', 'Belum ada riwayat penyewaan alat.')}
          </div>
        ) : (
          <div className="space-y-3">
            {rankedGear.map((item, idx) => {
              const pct = Math.max(8, Math.round((item.estRevenue / Math.max(1, topRevenue)) * 100));
              return (
                <div key={item.name} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-zinc-100 font-mono text-[10px] font-semibold text-zinc-700">
                        {idx + 1}
                      </span>
                      <span className="truncate font-medium text-zinc-900">{item.name}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 font-mono text-[11px]">
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600">
                        {item.rentCount}× · {item.daysTotal}
                        {tx('d', 'h')}
                      </span>
                      <CurrencyText
                        amount={item.estRevenue}
                        className="font-semibold text-zinc-950"
                      />
                    </div>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                    <div
                      style={{ width: `${pct}%` }}
                      className={`h-full rounded-full transition-all ${
                        idx === 0 ? 'bg-zinc-900' : 'bg-zinc-600'
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface BranchComparisonChartProps {
  tenants: Tenant[];
  transactions: Transaction[];
  bookings: Booking[];
}

export function BranchComparisonChart({
  tenants,
  transactions,
  bookings,
}: BranchComparisonChartProps) {
  const { tx } = useI18n();

  const rows = useMemo(() => {
    return tenants
      .map((tenant) => {
        const tTx = transactions.filter((t) => t.tenantId === tenant.id);
        const revenue = tTx
          .filter((t) => t.category === 'revenue')
          .reduce((s, t) => s + t.amount, 0);
        const expense = tTx
          .filter((t) => t.category === 'expense')
          .reduce((s, t) => s + t.amount, 0);
        const bookingCount = bookings.filter(
          (b) => b.tenantId === tenant.id && b.bookingStatus !== 'cancelled'
        ).length;
        return {
          id: tenant.id,
          name: tenant.name,
          revenue,
          expense,
          net: revenue - expense,
          bookingCount,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }, [tenants, transactions, bookings]);

  const maxRev = Math.max(1, ...rows.map((r) => r.revenue));

  return (
    <Card className="shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-1.5 text-sm font-semibold text-zinc-950">
          <Building2 className="h-4 w-4 text-zinc-500" strokeWidth={1.5} />
          {tx('Branch Revenue vs Expense Comparison', 'Perbandingan Pendapatan & Biaya per Cabang')}
        </CardTitle>
        <p className="text-[11px] text-zinc-500">
          {tx(
            'Side-by-side operating GMV and expense ratio across rental branches.',
            'Perbandingan GMV operasional dan rasio biaya antar cabang rental.'
          )}
        </p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="flex h-36 items-center justify-center rounded border border-dashed border-zinc-200 text-xs text-zinc-400">
            {tx('No branch data yet.', 'Belum ada data cabang.')}
          </div>
        ) : (
          <div className="space-y-4">
            {rows.map((row) => {
              const revPct = Math.max(row.revenue > 0 ? 6 : 0, Math.round((row.revenue / maxRev) * 100));
              const expPct = Math.max(row.expense > 0 ? 4 : 0, Math.round((row.expense / maxRev) * 100));
              return (
                <div key={row.id} className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-zinc-950">
                      {row.name}{' '}
                      <span className="font-mono text-[10px] font-normal text-zinc-400">
                        ({row.bookingCount} {tx('bookings', 'booking')})
                      </span>
                    </span>
                    <div className="flex items-center gap-3 font-mono text-[11px]">
                      <span className="text-zinc-900">
                        {tx('Rev:', 'Rev:')} <CurrencyText amount={row.revenue} className="font-semibold" />
                      </span>
                      <span className="text-red-600">
                        {tx('Exp:', 'Exp:')} <CurrencyText amount={row.expense} />
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100">
                      <div
                        style={{ width: `${revPct}%` }}
                        className="h-full rounded-full bg-zinc-900 transition-all"
                      />
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                      <div
                        style={{ width: `${expPct}%` }}
                        className="h-full rounded-full bg-red-400 transition-all"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

