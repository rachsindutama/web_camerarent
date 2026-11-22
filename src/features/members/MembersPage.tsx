import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, doc, getDocs, Timestamp, updateDoc } from 'firebase/firestore';
import { Award, Search, Users } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { MEMBERSHIP_BENEFITS } from '@/lib/membership';
import { MembershipBadge } from '@/components/shared/MembershipBadge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { MembershipTier, UserProfile } from '@/types/schema';

export function MembersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [tierTab, setTierTab] = useState<'all' | MembershipTier>('all');
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);

  const { data: users = [], isLoading } = useQuery<UserProfile[]>({
    queryKey: ['members', 'users'],
    enabled: Boolean(db),
    queryFn: async () => {
      if (!db) return [];
      const snap = await getDocs(collection(db, 'users'));
      return snap.docs.map((d) => {
        const data = d.data();
        return {
          uid: d.id,
          email: data.email ?? '',
          displayName: data.displayName ?? 'Unnamed User',
          photoURL: data.photoURL,
          role: data.role ?? 'user',
          membershipTier: data.membershipTier === 'premium' ? 'premium' : 'general',
          tenantId: data.tenantId ?? null,
          phone: data.phone ?? '',
          nik: data.nik,
          kycStatus: data.kycStatus ?? 'unverified',
          kycDocs: data.kycDocs ?? [],
          isBlacklisted: Boolean(data.isBlacklisted),
          blacklistReason: data.blacklistReason,
          createdAt: (data.createdAt as Timestamp) ?? Timestamp.now(),
        };
      });
    },
  });

  const handleToggleTier = async (user: UserProfile, nextTier: MembershipTier) => {
    if (!db || user.membershipTier === nextTier) return;
    setUpdatingUid(user.uid);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        membershipTier: nextTier,
      });
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      await queryClient.invalidateQueries({ queryKey: ['superadmin', 'users'] });
      toast.success(
        `${user.displayName} updated to ${nextTier === 'premium' ? 'Premium Member' : 'General Member'}.`
      );
    } catch (error) {
      console.error('Update membership tier error:', error);
      toast.error('Failed to update membership tier. Check permissions.');
    } finally {
      setUpdatingUid(null);
    }
  };

  const filtered = users.filter((u) => {
    if (tierTab !== 'all' && u.membershipTier !== tierTab) return false;
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      u.displayName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.nik ?? '').includes(q) ||
      u.phone.includes(q)
    );
  });

  const generalCount = users.filter((u) => u.membershipTier === 'general').length;
  const premiumCount = users.filter((u) => u.membershipTier === 'premium').length;

  return (
    <div className="space-y-5">
      <div className="border-b border-zinc-200 pb-4">
        <h2 className="text-base font-semibold tracking-tight text-zinc-950">
          Member Directory &amp; Tier Management
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          All newly registered accounts default to <span className="font-mono">GENERAL</span>.
          Admins and Superadmins can upgrade trusted crews to{' '}
          <span className="font-mono">PREMIUM</span> or revert to General at any time.
        </p>
      </div>

      {/* Active Tier Perks Reference Strip */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card className="shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold">General Member (Default)</CardTitle>
            <MembershipBadge tier="general" />
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-y-1.5 text-[11px] text-zinc-600">
            <span>Rental Discount:</span>
            <span className="text-right font-mono text-zinc-900">
              {MEMBERSHIP_BENEFITS.general.rentalDiscountPercent}%
            </span>
            <span>Security Deposit:</span>
            <span className="text-right font-mono text-zinc-900">100% Full Liability</span>
            <span>Overdue Grace Bonus:</span>
            <span className="text-right font-mono text-zinc-900">+0 mins (branch base)</span>
            <span>Antar-Jemput Free Km:</span>
            <span className="text-right font-mono text-zinc-900">0 km</span>
            <span>Max Units / Booking:</span>
            <span className="text-right font-mono text-zinc-900">
              {MEMBERSHIP_BENEFITS.general.maxUnitsPerBooking} physical units
            </span>
            <span>Ops Queue Priority:</span>
            <span className="text-right font-mono text-zinc-500">Standard</span>
          </CardContent>
        </Card>

        <Card className="border-zinc-900/20 bg-zinc-50/70 shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-1.5 text-xs font-semibold">
              <Award className="h-3.5 w-3.5 text-zinc-900" strokeWidth={1.5} />
              Premium Member (Upgraded)
            </CardTitle>
            <MembershipBadge tier="premium" />
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-y-1.5 text-[11px] text-zinc-700">
            <span>Rental Discount:</span>
            <span className="text-right font-mono font-semibold text-emerald-700">
              {MEMBERSHIP_BENEFITS.premium.rentalDiscountPercent}% off gear &amp; kits
            </span>
            <span>Security Deposit:</span>
            <span className="text-right font-mono font-semibold text-emerald-700">
              50% reduced liability
            </span>
            <span>Overdue Grace Bonus:</span>
            <span className="text-right font-mono font-semibold text-emerald-700">
              +{MEMBERSHIP_BENEFITS.premium.extraOverdueGraceMinutes} mins extra
            </span>
            <span>Antar-Jemput Free Km:</span>
            <span className="text-right font-mono font-semibold text-emerald-700">
              First {MEMBERSHIP_BENEFITS.premium.freeDeliveryKm} km free
            </span>
            <span>Max Units / Booking:</span>
            <span className="text-right font-mono font-semibold text-emerald-700">Unlimited</span>
            <span>Ops Queue Priority:</span>
            <span className="text-right font-mono font-semibold text-zinc-950">
              Priority Badge (Bookings, Logistics, Chat)
            </span>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tierTab} onValueChange={(v) => setTierTab(v as typeof tierTab)}>
          <TabsList>
            <TabsTrigger value="all">All Members ({users.length})</TabsTrigger>
            <TabsTrigger value="general">General ({generalCount})</TabsTrigger>
            <TabsTrigger value="premium">Premium ({premiumCount})</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative w-full max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-400"
            strokeWidth={1.5}
          />
          <Input
            placeholder="Search name, email, or NIK..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-md border border-zinc-200 bg-white p-8 text-center font-mono text-xs text-zinc-400">
          LOADING MEMBER DIRECTORY...
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No members match this filter"
          description="Registered accounts will appear here with default General tier."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>NIK / Phone</TableHead>
              <TableHead>KYC &amp; Status</TableHead>
              <TableHead>Membership Tier</TableHead>
              <TableHead className="text-right">Set Tier</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((user) => (
              <TableRow key={user.uid}>
                <TableCell>
                  <p className="font-medium text-zinc-950">{user.displayName}</p>
                  <p className="font-mono text-[11px] text-zinc-500">{user.email}</p>
                </TableCell>
                <TableCell className="font-mono text-[11px]">
                  <div>{user.nik ?? '—'}</div>
                  <div className="text-zinc-500">{user.phone || '—'}</div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={user.kycStatus} />
                    {user.isBlacklisted ? <StatusBadge status="blacklisted" /> : null}
                  </div>
                </TableCell>
                <TableCell>
                  <MembershipBadge tier={user.membershipTier} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant={user.membershipTier === 'general' ? 'mono' : 'outline'}
                      disabled={updatingUid === user.uid || user.membershipTier === 'general'}
                      onClick={() => void handleToggleTier(user, 'general')}
                    >
                      General
                    </Button>
                    <Button
                      size="sm"
                      variant={user.membershipTier === 'premium' ? 'default' : 'outline'}
                      disabled={updatingUid === user.uid || user.membershipTier === 'premium'}
                      onClick={() => void handleToggleTier(user, 'premium')}
                    >
                      <Award className="h-3 w-3" strokeWidth={1.5} />
                      Premium
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

