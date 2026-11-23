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
import { useI18n } from '@/hooks/useI18n';
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

export function FinancePage() {
  const { tx } = useI18n();
  const queryClient = useQueryClient();

  const txTypeLabels: Record<Transaction['type'], string> = {
    rental_income: tx('Rental & Delivery Income', 'Pendapatan Sewa & Ongkir'),
    deposit_in: tx('Security Deposit In', 'Deposit Jaminan Masuk'),
    deposit_refund: tx('Security Deposit Release / Refund', 'Pengembalian / Pelepasan Deposit'),
    damage_fine: tx('Damage Assessment Fine', 'Denda Kerusakan Alat'),
    overdue_fine: tx('Overdue Late Fine', 'Denda Keterlambatan'),
    operational_expense: tx('Operational Expense', 'Biaya Operasional'),
  };
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
        title={tx('No active rental branch selected', 'Belum ada cabang aktif')}
        description={tx(
          'Select a tenant branch to inspect its immutable financial ledger.',
          'Pilih cabang rental untuk memeriksa buku besar keuangan.'
        )}
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
      toast.error(
        tx(
          'Enter a valid expense amount and description.',
          'Masukkan nominal pengeluaran dan catatan yang valid.'
        )
      );
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
      toast.success(
        tx(
          'Operational expense posted to immutable ledger.',
          'Biaya operasional berhasil dicatat ke buku besar.'
        )
      );
      setExpenseOpen(false);
      setExpenseNotes('');
      setExpenseAmount(150000);
    } catch (error) {
      console.error('Expense post error:', error);
      toast.error(
        tx('Failed to record operational expense.', 'Gagal mencatat biaya operasional.')
      );
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
            {tx('Immutable Cash Flow Ledger', 'Buku Besar Cash Flow')}
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            {tx(
              'Strict accounting separation: Security Deposits are isolated as Liability and never inflated into Operating Revenue. Click any entry to inspect full audit details.',
              'Pemisahan akuntansi ketat: Deposit Jaminan dipisahkan sebagai Liabilitas dan tidak digabung ke Pendapatan Operasional. Klik entri untuk melihat detail audit lengkap.'
            )}
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
            {tx('Export CSV', 'Ekspor CSV')}
          </Button>
          <Button size="sm" onClick={() => setExpenseOpen(true)}>
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
            {tx('Record Expense', 'Catat Pengeluaran')}
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
              {tx('Operating Revenue', 'Pendapatan Operasional')}
            </CardTitle>
            <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" strokeWidth={1.5} />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold text-zinc-950">
              <CurrencyText amount={totalRevenue} />
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">
              {tx('Rentals, delivery fees & fines', 'Sewa, ongkir & denda')}
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
              {tx('Deposit Liability Held', 'Liabilitas Deposit Ditahan')}
            </CardTitle>
            <Landmark className="h-3.5 w-3.5 text-blue-600" strokeWidth={1.5} />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold text-blue-950">
              <CurrencyText amount={depositLiabilityHeld} />
            </div>
            <p className="mt-1 text-[11px] text-blue-700">
              {tx('Refundable renter escrow (non-revenue)', 'Deposit titipan penyewa (non-pendapatan)')}
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
              {tx('Operational Expenses', 'Biaya Operasional')}
            </CardTitle>
            <ArrowDownRight className="h-3.5 w-3.5 text-red-600" strokeWidth={1.5} />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold text-zinc-950">
              <CurrencyText amount={totalExpense} />
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">
              {tx('Maintenance, cleaning, fuel & ops', 'Perawatan, pembersihan, BBM & ops')}
            </p>
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
              {tx('Net Operating Profit', 'Laba Operasional Bersih')}
            </CardTitle>
            <Wallet className="h-3.5 w-3.5 text-zinc-400" strokeWidth={1.5} />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold text-zinc-950">
              <CurrencyText amount={netOperatingProfit} />
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">
              {tx('Revenue minus expenses', 'Pendapatan dikurangi biaya')}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={categoryTab} onValueChange={(v) => setCategoryTab(v as typeof categoryTab)}>
        <TabsList>
          <TabsTrigger value="all">
            {tx('All Entries', 'Semua Entri')} ({transactions.length})
          </TabsTrigger>
          <TabsTrigger value="revenue">
            {tx('Revenue', 'Pendapatan')} ({transactions.filter((t) => t.category === 'revenue').length})
          </TabsTrigger>
          <TabsTrigger value="liability">
            {tx('Liability', 'Liabilitas')} ({transactions.filter((t) => t.category === 'liability').length})
          </TabsTrigger>
          <TabsTrigger value="expense">
            {tx('Expenses', 'Pengeluaran')} ({transactions.filter((t) => t.category === 'expense').length})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="rounded-md border border-zinc-200 bg-white p-8 text-center font-mono text-xs text-zinc-400">
          {tx('LOADING IMMUTABLE LEDGER...', 'MEMUAT BUKU BESAR...')}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title={tx('No ledger entries recorded', 'Belum ada entri buku besar')}
          description={tx(
            'Entries are automatically written when payments are verified, deposits refunded, fines assessed, or expenses logged.',
            'Entri dicatat otomatis saat pembayaran diverifikasi, deposit dikembalikan, denda diterapkan, atau biaya dicatat.'
          )}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tx('Timestamp', 'Waktu')}</TableHead>
              <TableHead>{tx('Type', 'Tipe')}</TableHead>
              <TableHead>{tx('Category', 'Kategori')}</TableHead>
              <TableHead>{tx('Method', 'Metode')}</TableHead>
              <TableHead>{tx('Notes', 'Catatan')}</TableHead>
              <TableHead className="text-right">{tx('Amount (IDR)', 'Nominal (IDR)')}</TableHead>
              <TableHead className="text-right">{tx('Action', 'Aksi')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((entry) => {
              const isOutflow =
                entry.type === 'operational_expense' || entry.type === 'deposit_refund';
              return (
                <TableRow
                  key={entry.id}
                  onClick={() => setSelectedTx(entry)}
                  className="cursor-pointer"
                >
                  <TableCell className="font-mono text-[11px] text-zinc-500">
                    {formatDateTime(entry.createdAt)}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-zinc-900">
                    {entry.type}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${
                        entry.category === 'revenue'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : entry.category === 'liability'
                            ? 'border-blue-200 bg-blue-50 text-blue-700'
                            : 'border-red-200 bg-red-50 text-red-700'
                      }`}
                    >
                      {entry.category}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-[11px] uppercase text-zinc-600">
                    {entry.paymentMethod}
                  </TableCell>
                  <TableCell className="max-w-[260px] truncate text-xs text-zinc-600">
                    {entry.notes ?? '—'}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    <CurrencyText
                      amount={entry.amount}
                      className={isOutflow ? 'text-red-700' : 'text-zinc-950'}
                    />
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => setSelectedTx(entry)}
                    >
                      <Eye className="h-3 w-3" strokeWidth={1.5} />
                      {tx('Details', 'Detail')}
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
                {selectedTx
                  ? txTypeLabels[selectedTx.type]
                  : tx('Transaction Details', 'Detail Transaksi')}
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
                  <p className="font-mono text-[10px] uppercase text-zinc-400">
                    {tx('Transaction Amount', 'Nominal Transaksi')}
                  </p>
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
                  <p className="mt-0.5 text-[10px] text-zinc-400">
                    {tx('IMMUTABLE ENTRY', 'ENTRI PERMANEN')}
                  </p>
                </div>
              </div>

              {/* Audit Metadata */}
              <div className="space-y-2 rounded-md border border-zinc-200 bg-white p-4">
                <div className="flex justify-between gap-3">
                  <span className="font-mono text-[10px] uppercase text-zinc-400">
                    {tx('Type Code', 'Kode Tipe')}
                  </span>
                  <span className="font-mono text-zinc-900">{selectedTx.type}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="font-mono text-[10px] uppercase text-zinc-400">
                    {tx('Verified By', 'Diverifikasi Oleh')}
                  </span>
                  <span className="inline-flex items-center gap-1 text-zinc-900">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" strokeWidth={1.5} />
                    {verifier ? `${verifier.displayName} (${verifier.email})` : selectedTx.verifiedBy}
                  </span>
                </div>
                <Separator />
                <div className="space-y-1">
                  <span className="font-mono text-[10px] uppercase text-zinc-400">
                    {tx('Full Notes', 'Catatan Lengkap')}
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
                          label: `${tx('Transaction Receipt', 'Bukti Transaksi')} — ${selectedTx.id}`,
                        })
                      }
                    >
                      <Eye className="h-3.5 w-3.5" strokeWidth={1.5} />
                      {tx('Preview Transfer Receipt', 'Preview Bukti Transfer')}
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
                      {tx('Open Booking Details', 'Buka Detail Booking')}
                    </Button>
                  </div>

                  {linkedRenter ? (
                    <p className="text-[11px] text-zinc-600">
                      {tx('Renter:', 'Penyewa:')}{' '}
                      <span className="font-medium text-zinc-900">{linkedRenter.displayName}</span>{' '}
                      <span className="font-mono text-zinc-400">({linkedRenter.email})</span>
                    </p>
                  ) : null}

                  <div className="space-y-1 rounded border border-zinc-100 bg-zinc-50 p-2.5 text-[11px]">
                    <div className="flex justify-between text-zinc-600">
                      <span>{tx('Gear Rental (Net)', 'Sewa Alat (Net)')}</span>
                      <CurrencyText amount={linkedBooking.subtotal} />
                    </div>
                    <div className="flex justify-between text-zinc-600">
                      <span>{tx('Delivery Fee', 'Fee Antar-Jemput')}</span>
                      <CurrencyText amount={linkedBooking.deliveryFee} />
                    </div>
                    <div className="flex justify-between text-zinc-600">
                      <span>{tx('Security Deposit (Liability)', 'Deposit Jaminan (Liability)')}</span>
                      <CurrencyText amount={linkedBooking.deposit} />
                    </div>
                    {linkedBooking.overdueFine > 0 ? (
                      <div className="flex justify-between text-red-700">
                        <span>{tx('Overdue Fine', 'Denda Overdue')}</span>
                        <CurrencyText amount={linkedBooking.overdueFine} />
                      </div>
                    ) : null}
                    {linkedBooking.damageFine > 0 ? (
                      <div className="flex justify-between text-red-700">
                        <span>{tx('Damage Fine', 'Denda Kerusakan')}</span>
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
                {tx('Download A4 Invoice', 'Unduh Invoice A4')}
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
              {tx('Close', 'Tutup')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Record Operational Expense Modal */}
      <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tx('Record Operational Expense', 'Catat Biaya Operasional')}</DialogTitle>
            <DialogDescription>
              {tx('Posts an immutable expense entry for', 'Mencatat entri biaya permanen untuk')}{' '}
              {tenantById[effectiveExpenseTenantId]?.name ??
                activeTenant?.name ??
                tx('selected branch', 'cabang terpilih')}
              .
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRecordExpense} className="space-y-3">
            {isAllTenants ? (
              <div className="space-y-1">
                <Label>{tx('Branch', 'Cabang')}</Label>
                <Select value={effectiveExpenseTenantId} onValueChange={setExpenseTenantId}>
                  <SelectTrigger>
                    <SelectValue placeholder={tx('Select branch...', 'Pilih cabang...')} />
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
                <Label>{tx('Amount (IDR)', 'Nominal (IDR)')}</Label>
                <Input
                  type="number"
                  className="font-mono"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label>{tx('Payment Method', 'Metode Pembayaran')}</Label>
                <Select
                  value={expenseMethod}
                  onValueChange={(v) => setExpenseMethod(v as Transaction['paymentMethod'])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_transfer">{tx('Bank Transfer', 'Transfer Bank')}</SelectItem>
                    <SelectItem value="cash">{tx('Cash', 'Tunai')}</SelectItem>
                    <SelectItem value="qris">QRIS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>{tx('Expense Notes', 'Catatan Pengeluaran')}</Label>
              <Textarea
                placeholder={tx(
                  'e.g., Sensor cleaning swabs & lens calibration for SN-A7IV-00412',
                  'mis. Swab pembersih sensor & kalibrasi lensa untuk SN-A7IV-00412'
                )}
                value={expenseNotes}
                onChange={(e) => setExpenseNotes(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setExpenseOpen(false)}>
                {tx('Cancel', 'Batal')}
              </Button>
              <Button type="submit">{tx('Post Expense', 'Simpan Pengeluaran')}</Button>
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
        title={tx('Ledger Transfer Receipt', 'Bukti Transfer Ledger')}
      />
    </div>
  );
}
