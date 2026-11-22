import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { addDoc, collection, getDocs, query, Timestamp, where } from 'firebase/firestore';
import {
  ArrowDownRight,
  ArrowUpRight,
  Download,
  Landmark,
  Plus,
  ReceiptText,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { formatDateTime } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { CurrencyText } from '@/components/shared/CurrencyText';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import type { Transaction } from '@/types/schema';

export function FinancePage() {
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();
  const { activeTenantId, activeTenant } = useTenant();
  const [categoryTab, setCategoryTab] = useState<'all' | 'revenue' | 'liability' | 'expense'>('all');
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState(150000);
  const [expenseMethod, setExpenseMethod] = useState<Transaction['paymentMethod']>('bank_transfer');
  const [expenseNotes, setExpenseNotes] = useState('');

  const { data: transactions = [], isLoading } = useQuery<Transaction[]>({
    queryKey: ['transactions', activeTenantId],
    enabled: Boolean(db && activeTenantId),
    queryFn: async () => {
      if (!db || !activeTenantId) return [];
      const snap = await getDocs(
        query(collection(db, 'transactions'), where('tenantId', '==', activeTenantId))
      );
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Transaction)
        .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
    },
  });

  if (!activeTenantId || !activeTenant) {
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

  const handleRecordExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !userProfile || !activeTenantId) return;
    if (expenseAmount <= 0 || !expenseNotes.trim()) {
      toast.error('Enter a valid expense amount and description.');
      return;
    }

    try {
      await addDoc(collection(db, 'transactions'), {
        tenantId: activeTenantId,
        type: 'operational_expense',
        category: 'expense',
        amount: Number(expenseAmount),
        paymentMethod: expenseMethod,
        notes: expenseNotes.trim(),
        verifiedBy: userProfile.uid,
        createdAt: Timestamp.now(),
      });
      await queryClient.invalidateQueries({ queryKey: ['transactions', activeTenantId] });
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
    const header = ['Timestamp', 'Type', 'Category', 'Amount_IDR', 'Payment_Method', 'Booking_ID', 'Notes'];
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
    link.download = `ledger-${activeTenant.slug}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-zinc-950">
            Immutable Cash Flow Ledger
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Strict accounting separation: Security Deposits are isolated as Liability and never
            inflated into Operating Revenue. Ledger entries cannot be altered or deleted.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={filtered.length === 0}>
            <Download className="h-3.5 w-3.5" strokeWidth={1.5} />
            Export CSV
          </Button>
          <Button size="sm" onClick={() => setExpenseOpen(true)}>
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
            Record Expense
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-none">
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
            <p className="mt-1 text-[11px] text-zinc-500">Rentals + overdue &amp; damage fines</p>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50/30 shadow-none">
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
            <p className="mt-1 text-[11px] text-blue-700">Refundable renter escrow (non-revenue)</p>
          </CardContent>
        </Card>

        <Card className="shadow-none">
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

        <Card className="shadow-none">
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
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="liability">Liability (Deposits)</TabsTrigger>
          <TabsTrigger value="expense">Expenses</TabsTrigger>
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((tx) => (
              <TableRow key={tx.id}>
                <TableCell className="font-mono text-[11px] text-zinc-500">
                  {formatDateTime(tx.createdAt)}
                </TableCell>
                <TableCell className="font-mono text-[11px] text-zinc-900">
                  {tx.type}
                </TableCell>
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
                <TableCell className="max-w-[280px] truncate text-xs text-zinc-600">
                  {tx.notes ?? '—'}
                </TableCell>
                <TableCell className="text-right font-semibold">
                  <CurrencyText
                    amount={tx.amount}
                    className={
                      tx.type === 'operational_expense' || tx.type === 'deposit_refund'
                        ? 'text-red-700'
                        : 'text-zinc-950'
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Operational Expense</DialogTitle>
            <DialogDescription>
              Posts an immutable expense entry for {activeTenant.name}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRecordExpense} className="space-y-3">
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
    </div>
  );
}

