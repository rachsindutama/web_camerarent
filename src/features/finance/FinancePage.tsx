import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { addDoc, collection, getDocs, query, Timestamp, where } from 'firebase/firestore';
import {
  ArrowDownRight,
  ArrowUpRight,
  Download,
  Eye,
  FileDown,
  FileText,
  Landmark,
  Plus,
  ReceiptText,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { generateInvoicePdf } from '@/lib/invoicePdf';
import { formatDateTime, formatIDR } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { BookingDetailModal } from '@/features/bookings/BookingDetailModal';
import { CurrencyText } from '@/components/shared/CurrencyText';
import { ImagePreviewModal } from '@/components/shared/ImagePreviewModal';
import { SerialNumberTag } from '@/components/shared/SerialNumberTag';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Booking, Transaction, UserProfile } from '@/types/schema';

const TX_TYPE_LABELS: Record<Transaction['type'], string> = {
  rental_income: 'Rental & Delivery Income',
  deposit_in: 'Security Deposit In',
  deposit_refund: 'Security Deposit Release / Refund',
  damage_fine: 'Damage Assessment Fine',
  overdue_fine: 'Overdue Late Fine',
  operational_expense: 'Operational Expense',
};

export function FinancePage() {
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();
  const { activeTenantId, activeTenant, isAllTenants, allTenants, tenantById } = useTenant();
  const [categoryTab, setCategoryTab] = useState<'all' | 'revenue' | 'liability' | 'expense'>('all');
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expenseTenantId, setExpenseTenantId] = useState('');
  const [expenseAmount, setExpenseAmount] = useState(150000);
  const [expenseMethod, setExpenseMethod] = useState<Transaction['paymentMethod']>('bank_transfer');
  const [expenseNotes, setExpenseNotes] = useState('');

  // Clickable Transaction Detail Modal + Linked Booking Detail + Proof Preview
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [openBookingDetail, setOpenBookingDetail] = useState<Booking | null>(null);
  const [proofPreview, setProofPreview] = useState<{ url: string; label: string } | null>(null);

  const { data: transactions = [], isLoading } = useQuery<Transaction[]>({
    queryKey: ['transactions', isAllTenants ? 'all' : activeTenantId],
    enabled: Boolean(db && (isAllTenants || activeTenantId)),
    queryFn: async () => {
      if (!db || (!isAllTenants && !activeTenantId)) return [];
      const q = isAllTenants
        ? collection(db, 'transactions')
        : query(collection(db, 'transactions'), where('tenantId', '==', activeTenantId));
      const snap = await getDocs(q);
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Transaction)
        .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
    },
  });

  const { data: bookings = [] } = useQuery<Booking[]>({
    queryKey: ['finance-bookings', isAllTenants ? 'all' : activeTenantId],
    enabled: Boolean(db && (isAllTenants || activeTenantId)),
    queryFn: async () => {
      if (!db || (!isAllTenants && !activeTenantId)) return [];
      const q = isAllTenants
        ? collection(db, 'bookings')
        : query(collection(db, 'bookings'), where('tenantId', '==', activeTenantId));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Booking);
    },
  });

  const { data: usersById = {} } = useQuery<Record<string, UserProfile>>({
    queryKey: ['finance-users'],
    enabled: Boolean(db),
    queryFn: async () => {
      if (!db) return {};
      const snap = await getDocs(collection(db, 'users'));
      const map: Record<string, UserProfile> = {};
      snap.docs.forEach((d) => {
        map[d.id] = { uid: d.id, ...d.data() } as UserProfile;
      });
      return map;
    },
  });

  const bookingsById = useMemo(() => {
    const map: Record<string, Booking> = {};
    bookings.forEach((b) => {
      map[b.id] = b;
    });
    return map;
  }, [bookings]);

  if (!isAllTenants && (!activeTenantId || !activeTenant)) {
    return (
      <EmptyState
        icon={ReceiptText}
        title="No active rental branch selected"
        description="Select a tenant branch to inspect its immutable financial ledger."
      />
    );
  }

  const totalRevenue = transactions
    .filter((t) => t.category === 'revenue')
    .reduce((sum, t) => sum + t.amount, 0);

  const depositIn = transactions
    .filter((t) => t.type === 'deposit_in')
    .reduce((sum, t) => sum + t.amount, 0);

  const depositOut = transactions
    .filter((t) => t.type === 'deposit_refund')
    .reduce((sum, t) => sum + t.amount, 0);

  const depositLiabilityHeld = Math.max(0, depositIn - depositOut);

  const totalExpense = transactions
    .filter((t) => t.category === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const netOperatingProfit = totalRevenue - totalExpense;

  const filtered = transactions.filter((t) =>
    categoryTab === 'all' ? true : t.category === categoryTab
  );

  const effectiveExpenseTenantId = activeTenantId ?? (expenseTenantId || allTenants[0]?.id || '');

  const handleRecordExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !userProfile || !effectiveExpenseTenantId) return;
    if (expenseAmount <= 0 || !expenseNotes.trim()) {
      toast.error('Enter a valid expense amount and description.');
      return;
    }

    try {
      await addDoc(collection(db, 'transactions'), {
        tenantId: effectiveExpenseTenantId,
        type: 'operational_expense',
        category: 'expense',
        amount: Number(expenseAmount),
        paymentMethod: expenseMethod,
        notes: expenseNotes.trim(),
        verifiedBy: userProfile.uid,
        createdAt: Timestamp.now(),
      });
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      toast.success('Operational expense posted to immutable ledger.');
      setExpenseOpen(false);
      setExpenseNotes('');
      setExpenseAmount(150000);
    } catch (error) {
      console.error('Expense post error:', error);
      toast.error('Failed to record operational expense.');
    }
  };

  const handleExportCsv = () => {
    const header = [
      'Timestamp',
      'Type',
      'Category',
      'Amount_IDR',
      'Payment_Method',
      'Booking_ID',
      'Notes',
    ];
    const rows = filtered.map((tx) => [
      tx.createdAt.toDate().toISOString(),
      tx.type,
      tx.category,
      String(tx.amount),
      tx.paymentMethod,
      tx.bookingId ?? '',
      `"${(tx.notes ?? '').replace(/"/g, '""')}"`,
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ledger-${activeTenant?.slug ?? 'all-branches'}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const linkedBooking = selectedTx?.bookingId ? bookingsById[selectedTx.bookingId] ?? null : null;
  const verifier = selectedTx?.verifiedBy ? usersById[selectedTx.verifiedBy] ?? null : null;
  const linkedRenter = linkedBooking ? usersById[linkedBooking.userId] ?? null : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-zinc-950">
            Immutable Cash Flow Ledger
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Strict accounting separation: Security Deposits are isolated as Liability and never
            inflated into Operating Revenue. Click any entry to inspect full audit details.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={filtered.length === 0}
          >
            <Download className="h-3.5 w-3.5" strokeWidth={1.5} />
            Export CSV
          </Button>
          <Button size="sm" onClick={() => setExpenseOpen(true)}>
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
            Record Expense
          </Button>
        </div>
      </div>

      {/* Clickable KPI Cards to quick-filter Ledger */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          role="button"
          tabIndex={0}
          onClick={() => setCategoryTab('revenue')}
          className={`cursor-pointer shadow-none transition-colors hover:border-zinc-400 ${
            categoryTab === 'revenue' ? 'border-emerald-400 ring-1 ring-emerald-200' : ''
          }`}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-1.5">
            <CardTitle className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              Operating Revenue
            </CardTitle>
            <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" strokeWidth={1.5} />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold text-zinc-950">
              <CurrencyText amount={totalRevenue} />
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">
              Rentals, delivery fees &amp; fines
            </p>
          </CardContent>
        </Card>

        <Card
          role="button"
          tabIndex={0}
          onClick={() => setCategoryTab('liability')}
          className={`cursor-pointer border-blue-200 bg-blue-50/30 shadow-none transition-colors hover:border-blue-400 ${
            categoryTab === 'liability' ? 'border-blue-500 ring-1 ring-blue-200' : ''
          }`}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-1.5">
            <CardTitle className="font-mono text-[10px] uppercase tracking-wider text-blue-700">
              Deposit Liability Held
            </CardTitle>
            <Landmark className="h-3.5 w-3.5 text-blue-600" strokeWidth={1.5} />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold text-blue-950">
              <CurrencyText amount={depositLiabilityHeld} />
            </div>
            <p className="mt-1 text-[11px] text-blue-700">
              Refundable renter escrow (non-revenue)
            </p>
          </CardContent>
        </Card>

        <Card
          role="button"
          tabIndex={0}
          onClick={() => setCategoryTab('expense')}
          className={`cursor-pointer shadow-none transition-colors hover:border-zinc-400 ${
            categoryTab === 'expense' ? 'border-red-400 ring-1 ring-red-200' : ''
          }`}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-1.5">
            <CardTitle className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              Operational Expenses
            </CardTitle>
            <ArrowDownRight className="h-3.5 w-3.5 text-red-600" strokeWidth={1.5} />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold text-zinc-950">
              <CurrencyText amount={totalExpense} />
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">Maintenance, cleaning, fuel &amp; ops</p>
          </CardContent>
        </Card>

        <Card
          role="button"
          tabIndex={0}
          onClick={() => setCategoryTab('all')}
          className={`cursor-pointer shadow-none transition-colors hover:border-zinc-400 ${
            categoryTab === 'all' ? 'border-zinc-400' : ''
          }`}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-1.5">
            <CardTitle className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              Net Operating Profit
            </CardTitle>
            <Wallet className="h-3.5 w-3.5 text-zinc-400" strokeWidth={1.5} />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold text-zinc-950">
              <CurrencyText amount={netOperatingProfit} />
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">Revenue minus expenses</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={categoryTab} onValueChange={(v) => setCategoryTab(v as typeof categoryTab)}>
        <TabsList>
          <TabsTrigger value="all">All Entries ({transactions.length})</TabsTrigger>
          <TabsTrigger value="revenue">
            Revenue ({transactions.filter((t) => t.category === 'revenue').length})
          </TabsTrigger>
          <TabsTrigger value="liability">
            Liability ({transactions.filter((t) => t.category === 'liability').length})
          </TabsTrigger>
          <TabsTrigger value="expense">
            Expenses ({transactions.filter((t) => t.category === 'expense').length})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="rounded-md border border-zinc-200 bg-white p-8 text-center font-mono text-xs text-zinc-400">
          LOADING IMMUTABLE LEDGER...
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="No ledger entries recorded"
          description="Entries are automatically written when payments are verified, deposits refunded, fines assessed, or expenses logged."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="text-right">Amount (IDR)</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((tx) => {
              const isOutflow = tx.type === 'operational_expense' || tx.type === 'deposit_refund';
              return (
                <TableRow
                  key={tx.id}
                  onClick={() => setSelectedTx(tx)}
                  className="cursor-pointer"
                >
                  <TableCell className="font-mono text-[11px] text-zinc-500">
                    {formatDateTime(tx.createdAt)}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-zinc-900">{tx.type}</TableCell>
                  <TableCell>
                    <span
                      className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${
                        tx.category === 'revenue'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : tx.category === 'liability'
                            ? 'border-blue-200 bg-blue-50 text-blue-700'
                            : 'border-red-200 bg-red-50 text-red-700'
                      }`}
                    >
                      {tx.category}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-[11px] uppercase text-zinc-600">
                    {tx.paymentMethod}
                  </TableCell>
                  <TableCell className="max-w-[260px] truncate text-xs text-zinc-600">
                    {tx.notes ?? '—'}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    <CurrencyText
                      amount={tx.amount}
                      className={isOutflow ? 'text-red-700' : 'text-zinc-950'}
                    />
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => setSelectedTx(tx)}
                    >
                      <Eye className="h-3 w-3" strokeWidth={1.5} />
                      Detail
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* Transaction Audit Detail Modal */}
      <Dialog open={Boolean(selectedTx)} onOpenChange={(o) => !o && setSelectedTx(null)}>
        <DialogContent className="flex max-h-[88vh] max-w-xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b border-zinc-200 bg-zinc-50/80 px-6 py-4 pr-12">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="text-sm font-semibold text-zinc-950">
                {selectedTx ? TX_TYPE_LABELS[selectedTx.type] : 'Transaction Detail'}
              </DialogTitle>
              {selectedTx ? (
                <span
                  className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${
                    selectedTx.category === 'revenue'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : selectedTx.category === 'liability'
                        ? 'border-blue-200 bg-blue-50 text-blue-700'
                        : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {selectedTx.category}
                </span>
              ) : null}
            </div>
            <DialogDescription className="mt-1 font-mono text-[11px] text-zinc-500">
              TX ID: {selectedTx?.id} · {formatDateTime(selectedTx?.createdAt)}
            </DialogDescription>
          </DialogHeader>

          {selectedTx ? (
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5 text-xs">
              {/* Amount Banner */}
              <div className="flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-50/70 p-4">
                <div>
                  <p className="font-mono text-[10px] uppercase text-zinc-400">Nominal Transaksi</p>
                  <p className="mt-1 font-mono text-xl font-semibold text-zinc-950">
                    {selectedTx.type === 'operational_expense' ||
                    selectedTx.type === 'deposit_refund'
                      ? '- '
                      : '+ '}
                    <CurrencyText amount={selectedTx.amount} />
                  </p>
                </div>
                <div className="text-right font-mono text-[11px] text-zinc-600">
                  <p className="uppercase">{selectedTx.paymentMethod}</p>
                  <p className="mt-0.5 text-[10px] text-zinc-400">IMMUTABLE ENTRY</p>
                </div>
              </div>

              {/* Audit Metadata */}
              <div className="space-y-2 rounded-md border border-zinc-200 bg-white p-4">
                <div className="flex justify-between gap-3">
                  <span className="font-mono text-[10px] uppercase text-zinc-400">Kode Tipe</span>
                  <span className="font-mono text-zinc-900">{selectedTx.type}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="font-mono text-[10px] uppercase text-zinc-400">
                    Diverifikasi Oleh
                  </span>
                  <span className="inline-flex items-center gap-1 text-zinc-900">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" strokeWidth={1.5} />
                    {verifier ? `${verifier.displayName} (${verifier.email})` : selectedTx.verifiedBy}
                  </span>
                </div>
                <Separator />
                <div className="space-y-1">
                  <span className="font-mono text-[10px] uppercase text-zinc-400">
                    Catatan Lengkap
                  </span>
                  <p className="leading-relaxed text-zinc-800">{selectedTx.notes ?? '—'}</p>
                </div>
                {selectedTx.proofUrl ? (
                  <div className="pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() =>
                        setProofPreview({
                          url: selectedTx.proofUrl!,
                          label: `Bukti Transaksi — ${selectedTx.id}`,
                        })
                      }
                    >
                      <Eye className="h-3.5 w-3.5" strokeWidth={1.5} />
                      Preview Bukti Transfer
                    </Button>
                  </div>
                ) : null}
              </div>

              {/* Linked Booking Breakdown */}
              {linkedBooking ? (
                <div className="space-y-3 rounded-md border border-zinc-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-zinc-400" strokeWidth={1.5} />
                      <span className="font-mono text-xs font-semibold text-zinc-950">
                        {linkedBooking.invoiceNumber}
                      </span>
                      <StatusBadge status={linkedBooking.bookingStatus} />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px]"
                      onClick={() => setOpenBookingDetail(linkedBooking)}
                    >
                      Buka Detail Booking
                    </Button>
                  </div>

                  {linkedRenter ? (
                    <p className="text-[11px] text-zinc-600">
                      Penyewa:{' '}
                      <span className="font-medium text-zinc-900">{linkedRenter.displayName}</span>{' '}
                      <span className="font-mono text-zinc-400">({linkedRenter.email})</span>
                    </p>
                  ) : null}

                  <div className="space-y-1 rounded border border-zinc-100 bg-zinc-50 p-2.5 text-[11px]">
                    <div className="flex justify-between text-zinc-600">
                      <span>Sewa Alat (Net)</span>
                      <CurrencyText amount={linkedBooking.subtotal} />
                    </div>
                    <div className="flex justify-between text-zinc-600">
                      <span>Fee Antar-Jemput</span>
                      <CurrencyText amount={linkedBooking.deliveryFee} />
                    </div>
                    <div className="flex justify-between text-zinc-600">
                      <span>Deposit Jaminan (Liability)</span>
                      <CurrencyText amount={linkedBooking.deposit} />
                    </div>
                    {linkedBooking.overdueFine > 0 ? (
                      <div className="flex justify-between text-red-700">
                        <span>Denda Overdue</span>
                        <CurrencyText amount={linkedBooking.overdueFine} />
                      </div>
                    ) : null}
                    {linkedBooking.damageFine > 0 ? (
                      <div className="flex justify-between text-red-700">
                        <span>Denda Kerusakan</span>
                        <CurrencyText amount={linkedBooking.damageFine} />
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {linkedBooking.items.map((item) => (
                      <SerialNumberTag key={item.unitId} serialNumber={item.serialNumber} />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-zinc-200 bg-zinc-50/80 px-6 py-3.5">
            {linkedBooking ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="bg-white"
                onClick={() =>
                  generateInvoicePdf({
                    booking: linkedBooking,
                    tenant: activeTenant,
                    renter: linkedRenter,
                  })
                }
              >
                <FileDown className="h-3.5 w-3.5" strokeWidth={1.5} />
                Download A4 Invoice
              </Button>
            ) : (
              <span className="font-mono text-[10px] text-zinc-400">
                {selectedTx ? formatIDR(selectedTx.amount) : ''}
              </span>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="bg-white"
              onClick={() => setSelectedTx(null)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Record Operational Expense Modal */}
      <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Operational Expense</DialogTitle>
            <DialogDescription>
              Posts an immutable expense entry for{' '}
              {tenantById[effectiveExpenseTenantId]?.name ?? activeTenant?.name ?? 'cabang terpilih'}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRecordExpense} className="space-y-3">
            {isAllTenants ? (
              <div className="space-y-1">
                <Label>Cabang</Label>
                <Select value={effectiveExpenseTenantId} onValueChange={setExpenseTenantId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih cabang..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allTenants.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Amount (IDR)</Label>
                <Input
                  type="number"
                  className="font-mono"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label>Payment Method</Label>
                <Select
                  value={expenseMethod}
                  onValueChange={(v) => setExpenseMethod(v as Transaction['paymentMethod'])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="qris">QRIS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Expense Notes</Label>
              <Textarea
                placeholder="e.g., Sensor cleaning swabs & lens calibration for SN-A7IV-00412"
                value={expenseNotes}
                onChange={(e) => setExpenseNotes(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setExpenseOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Post Expense</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <BookingDetailModal
        open={Boolean(openBookingDetail)}
        onOpenChange={(open) => !open && setOpenBookingDetail(null)}
        booking={openBookingDetail}
        tenant={
          openBookingDetail
            ? tenantById[openBookingDetail.tenantId] ?? activeTenant
            : activeTenant
        }
        renter={openBookingDetail ? usersById[openBookingDetail.userId] ?? null : null}
      />

      <ImagePreviewModal
        open={Boolean(proofPreview)}
        onOpenChange={(open) => !open && setProofPreview(null)}
        images={proofPreview ? [proofPreview] : []}
        title="Bukti Transfer Ledger"
      />
    </div>
  );
}
