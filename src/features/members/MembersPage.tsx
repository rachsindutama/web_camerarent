import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, doc, getDocs, query, Timestamp, updateDoc, where } from 'firebase/firestore';
import { ChevronRight, Eye, Search, Settings, Users } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { formatTierSummaryParts } from '@/lib/membership';
import { formatDateTime } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { usePlatformSettings } from '@/hooks/usePlatformSettings';
import { useTenant } from '@/hooks/useTenant';
import { CurrencyText } from '@/components/shared/CurrencyText';
import {
  ImagePreviewModal,
  type PreviewImageItem,
} from '@/components/shared/ImagePreviewModal';
import { MembershipBadge } from '@/components/shared/MembershipBadge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { WhatsAppButton } from '@/components/shared/WhatsAppButton';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import type { Booking, KycStatus, MembershipTier, UserProfile, UserRole } from '@/types/schema';

type FilterTab = 'all' | 'basic' | 'premium' | 'pending_kyc' | 'blacklisted';
type DetailTab = 'overview' | 'edit' | 'access';

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || 'M';
}

export function MembersPage() {
  const { tx } = useI18n();
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();
  const { settings } = usePlatformSettings();
  const { allTenants, activeTenantId } = useTenant();
  const isSuperAdmin = userProfile?.role === 'superadmin';

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<FilterTab>('all');
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);

  // Unified Member Detail Dialog
  const [detailMemberUid, setDetailMemberUid] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [savingMemberEdit, setSavingMemberEdit] = useState(false);
  const [memberEditForm, setMemberEditForm] = useState({
    displayName: '',
    phone: '',
    nik: '',
    role: 'user' as UserRole,
    tenantId: '',
    membershipTier: 'basic' as MembershipTier,
    kycStatus: 'unverified' as KycStatus,
  });
  const [blacklistReason, setBlacklistReason] = useState('');
  const [previewState, setPreviewState] = useState<{
    open: boolean;
    images: PreviewImageItem[];
    index: number;
  }>({ open: false, images: [], index: 0 });

  // Strictly renter accounts (role === 'user'); admin & superadmin live in Staff & Karyawan
  const { data: members = [], isLoading } = useQuery<UserProfile[]>({
    queryKey: ['members', 'users'],
    enabled: Boolean(db),
    queryFn: async () => {
      if (!db) return [];
      const snap = await getDocs(collection(db, 'users'));
      return snap.docs
        .map((d) => {
          const data = d.data();
          return {
            uid: d.id,
            email: data.email ?? '',
            displayName: data.displayName ?? 'Unnamed Member',
            photoURL: data.photoURL,
            role: data.role ?? 'user',
            membershipTier: data.membershipTier === 'premium' ? 'premium' : 'basic',
            tenantId: data.tenantId ?? null,
            phone: data.phone ?? '',
            nik: data.nik,
            kycStatus: data.kycStatus ?? 'unverified',
            kycDocs: data.kycDocs ?? [],
            isBlacklisted: Boolean(data.isBlacklisted),
            blacklistReason: data.blacklistReason,
            createdAt: (data.createdAt as Timestamp) ?? Timestamp.now(),
          } as UserProfile;
        })
        .filter((u) => u.role === 'user');
    },
  });

  const detailMember = members.find((m) => m.uid === detailMemberUid) ?? null;

  const openMemberDetail = (member: UserProfile) => {
    setDetailMemberUid(member.uid);
    setDetailTab('overview');
    setMemberEditForm({
      displayName: member.displayName,
      phone: member.phone || '',
      nik: member.nik || '',
      role: member.role,
      tenantId: member.tenantId || activeTenantId || allTenants[0]?.id || '',
      membershipTier: member.membershipTier,
      kycStatus: member.kycStatus,
    });
    setBlacklistReason(member.blacklistReason ?? '');
  };

  const { data: detailMemberBookings = [] } = useQuery<Booking[]>({
    queryKey: ['member-bookings', detailMemberUid],
    enabled: Boolean(db && detailMemberUid),
    queryFn: async () => {
      if (!db || !detailMemberUid) return [];
      const snap = await getDocs(
        query(collection(db, 'bookings'), where('userId', '==', detailMemberUid))
      );
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Booking)
        .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
    },
  });

  const handleSaveMemberEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !detailMember || !isSuperAdmin) return;

    const cleanName = memberEditForm.displayName.trim();
    const cleanPhone = memberEditForm.phone.trim();
    const cleanNik = memberEditForm.nik.replace(/\D/g, '');

    if (cleanName.length < 2) {
      toast.error(tx('Full name must be at least 2 characters.', 'Nama lengkap minimal 2 karakter.'));
      return;
    }
    if (cleanNik.length > 0 && cleanNik.length !== 16) {
      toast.error(
        tx(
          'National ID (NIK) must be 16 digits (or leave blank if unavailable).',
          'NIK harus 16 digit angka (atau kosongkan jika belum ada).'
        )
      );
      return;
    }
    const needsBranch = memberEditForm.role === 'admin' || memberEditForm.role === 'staff';
    if (needsBranch && !memberEditForm.tenantId) {
      toast.error(tx('Select a branch for this role.', 'Pilih cabang untuk role ini.'));
      return;
    }

    setSavingMemberEdit(true);
    try {
      await updateDoc(doc(db, 'users', detailMember.uid), {
        displayName: cleanName,
        phone: cleanPhone,
        nik: cleanNik,
        role: memberEditForm.role,
        tenantId: needsBranch ? memberEditForm.tenantId : null,
        membershipTier: memberEditForm.membershipTier,
        kycStatus: memberEditForm.kycStatus,
      });
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      await queryClient.invalidateQueries({ queryKey: ['staff-users'] });
      await queryClient.invalidateQueries({ queryKey: ['tenant_admin_staff'] });
      const roleName =
        memberEditForm.role === 'superadmin'
          ? 'Superadmin'
          : memberEditForm.role === 'admin'
            ? 'Admin'
            : 'Staff';
      toast.success(
        memberEditForm.role !== 'user'
          ? tx(
              `${cleanName} promoted to ${roleName} (view in Staff & Employees).`,
              `${cleanName} dipromosikan ke ${roleName} (lihat di menu Staff & Karyawan).`
            )
          : tx(`${cleanName}'s profile saved.`, `Profil ${cleanName} disimpan.`)
      );
      if (memberEditForm.role !== 'user') {
        setDetailMemberUid(null);
      } else {
        setDetailTab('overview');
      }
    } catch (error) {
      console.error('Update member profile error:', error);
      toast.error(
        tx('Failed to save member profile changes.', 'Gagal menyimpan perubahan profil member.')
      );
    } finally {
      setSavingMemberEdit(false);
    }
  };

  const handleSetTier = async (user: UserProfile, nextTier: MembershipTier) => {
    if (!db || user.membershipTier === nextTier) return;
    setUpdatingUid(user.uid);
    try {
      await updateDoc(doc(db, 'users', user.uid), { membershipTier: nextTier });
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      setMemberEditForm((prev) => ({ ...prev, membershipTier: nextTier }));
      toast.success(
        tx(
          `${user.displayName} updated to ${nextTier === 'premium' ? 'Premium' : 'Basic'}.`,
          `${user.displayName} diubah ke ${nextTier === 'premium' ? 'Premium' : 'Basic'}.`
        )
      );
    } catch (error) {
      console.error('Update tier error:', error);
      toast.error(tx('Failed to update member tier.', 'Gagal mengubah tier member.'));
    } finally {
      setUpdatingUid(null);
    }
  };

  const handleKycDecision = async (user: UserProfile, decision: 'verified' | 'rejected') => {
    if (!db) return;
    setUpdatingUid(user.uid);
    try {
      await updateDoc(doc(db, 'users', user.uid), { kycStatus: decision });
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      setMemberEditForm((prev) => ({ ...prev, kycStatus: decision }));
      toast.success(
        decision === 'verified'
          ? tx(`${user.displayName}'s KYC verified.`, `KYC ${user.displayName} diverifikasi.`)
          : tx(`${user.displayName}'s KYC rejected.`, `KYC ${user.displayName} ditolak.`)
      );
    } catch (error) {
      console.error('KYC decision error:', error);
      toast.error(tx('Failed to update KYC status.', 'Gagal memperbarui status KYC.'));
    } finally {
      setUpdatingUid(null);
    }
  };

  const handleToggleBlacklist = async (user: UserProfile) => {
    if (!db) return;
    const nextState = !user.isBlacklisted;
    if (nextState && blacklistReason.trim().length < 5) {
      toast.error(
        tx('Enter a blacklist reason (at least 5 characters).', 'Isi alasan blacklist minimal 5 karakter.')
      );
      return;
    }
    setUpdatingUid(user.uid);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        isBlacklisted: nextState,
        blacklistReason: nextState ? blacklistReason.trim() : '',
      });
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      if (!nextState) setBlacklistReason('');
      toast.success(
        nextState
          ? tx(`${user.displayName} added to Global Blacklist.`, `${user.displayName} dimasukkan ke Global Blacklist.`)
          : tx(`${user.displayName} removed from Global Blacklist.`, `${user.displayName} dicabut dari Global Blacklist.`)
      );
    } catch (error) {
      console.error('Blacklist error:', error);
      toast.error(tx('Failed to update blacklist status.', 'Gagal memperbarui status blacklist.'));
    } finally {
      setUpdatingUid(null);
    }
  };

  const filtered = members.filter((u) => {
    if (tab === 'basic' && u.membershipTier !== 'basic') return false;
    if (tab === 'premium' && u.membershipTier !== 'premium') return false;
    if (tab === 'pending_kyc' && u.kycStatus !== 'pending') return false;
    if (tab === 'blacklisted' && !u.isBlacklisted) return false;
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      u.displayName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.nik ?? '').includes(q) ||
      u.phone.includes(q)
    );
  });

  const totalSpend = detailMemberBookings
    .filter((b) => b.bookingStatus !== 'cancelled')
    .reduce((sum, b) => sum + b.subtotal + b.deliveryFee, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            {tx('Members', 'Member')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {tx(
              'Manage renters, Basic & Premium tiers, KYC verification, and Global Blacklist status.',
              'Kelola data penyewa, tier Basic & Premium, verifikasi KYC, dan status Global Blacklist.'
            )}
          </p>
        </div>
        {isSuperAdmin ? (
          <Button asChild variant="outline" size="sm">
            <Link to="/superadmin/settings">
              <Settings className="h-3.5 w-3.5" strokeWidth={1.5} />
              {tx('Manage Benefits & Delivery', 'Atur Benefit & Ongkir')}
            </Link>
          </Button>
        ) : null}
      </div>

      {/* Tier Benefit Reference Strip (Live from Platform Settings) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">Basic</p>
            <MembershipBadge tier="basic" />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {formatTierSummaryParts(settings.tiers.basic).join(' · ')}.
          </p>
        </div>

        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">Premium</p>
            <MembershipBadge tier="premium" />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {formatTierSummaryParts(settings.tiers.premium).join(' · ')}.
          </p>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="all">
              {tx('All', 'Semua')} ({members.length})
            </TabsTrigger>
            <TabsTrigger value="basic">
              Basic ({members.filter((u) => u.membershipTier === 'basic').length})
            </TabsTrigger>
            <TabsTrigger value="premium">
              Premium ({members.filter((u) => u.membershipTier === 'premium').length})
            </TabsTrigger>
            <TabsTrigger value="pending_kyc">
              {tx('Pending KYC', 'Menunggu KYC')} ({members.filter((u) => u.kycStatus === 'pending').length})
            </TabsTrigger>
            <TabsTrigger value="blacklisted">
              {tx('Blacklisted', 'Diblokir')} ({members.filter((u) => u.isBlacklisted).length})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative w-full max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
            strokeWidth={1.5}
          />
          <Input
            placeholder={tx('Search name, email, or NIK...', 'Cari nama, email, atau NIK...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Member Table */}
      {isLoading ? (
        <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
          {tx('Loading member directory...', 'Memuat daftar member...')}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={tx('No members found', 'Tidak ada member ditemukan')}
          description={tx(
            'Renters who sign up via the registration page will appear here.',
            'Penyewa yang mendaftar melalui halaman registrasi akan tampil di sini.'
          )}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tx('Member', 'Member')}</TableHead>
              <TableHead>{tx('NIK & WhatsApp', 'NIK & WhatsApp')}</TableHead>
              <TableHead>{tx('Tier', 'Tier')}</TableHead>
              <TableHead>{tx('Status', 'Status')}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((user) => (
              <TableRow
                key={user.uid}
                onClick={() => openMemberDetail(user)}
                className="group cursor-pointer"
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                      {getInitials(user.displayName)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{user.displayName}</p>
                      <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="tabular-nums">
                  <div className="text-xs font-medium text-foreground">{user.nik || '—'}</div>
                  <div className="text-xs text-muted-foreground">{user.phone || '—'}</div>
                </TableCell>
                <TableCell>
                  <MembershipBadge tier={user.membershipTier} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={user.kycStatus} />
                    {user.isBlacklisted ? <StatusBadge status="blacklisted" /> : null}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <ChevronRight
                    className="ml-auto h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                    strokeWidth={1.5}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Clean shadcn/ui Member Detail & Management Dialog */}
      <Dialog
        open={Boolean(detailMember)}
        onOpenChange={(open) => {
          if (!open) setDetailMemberUid(null);
        }}
      >
        <DialogContent className="max-w-lg gap-5">
          {detailMember ? (
            <>
              <DialogHeader>
                <div className="flex items-start gap-3 pr-6">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-foreground">
                    {getInitials(detailMember.displayName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="truncate">{detailMember.displayName}</DialogTitle>
                    <DialogDescription className="mt-1 truncate">
                      {detailMember.email}
                    </DialogDescription>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <MembershipBadge tier={detailMember.membershipTier} />
                      <StatusBadge status={detailMember.kycStatus} />
                      {detailMember.isBlacklisted ? <StatusBadge status="blacklisted" /> : null}
                    </div>
                  </div>
                </div>
              </DialogHeader>

              <Tabs value={detailTab} onValueChange={(v) => setDetailTab(v as DetailTab)}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="overview">{tx('Overview', 'Ringkasan')}</TabsTrigger>
                  {isSuperAdmin ? (
                    <TabsTrigger value="edit">{tx('Edit Profile', 'Edit Profil')}</TabsTrigger>
                  ) : null}
                  <TabsTrigger value="access">
                    {isSuperAdmin ? tx('KYC & Access', 'KYC & Akses') : 'Tier'}
                  </TabsTrigger>
                </TabsList>

                {/* Tab 1: Overview */}
                <TabsContent value="overview" className="mt-4 space-y-5">
                  {detailMember.isBlacklisted ? (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-xs text-destructive">
                      <p className="font-medium">
                        {tx('Account blocked (Global Blacklist)', 'Akun diblokir (Global Blacklist)')}
                      </p>
                      <p className="mt-0.5 text-destructive/80">
                        {detailMember.blacklistReason ||
                          tx('Blocked by platform administrator.', 'Diblokir oleh administrator platform.')}
                      </p>
                    </div>
                  ) : null}

                  <dl className="divide-y divide-border text-sm">
                    <div className="flex items-center justify-between py-2.5">
                      <dt className="text-muted-foreground">NIK</dt>
                      <dd className="font-mono text-xs font-medium text-foreground">
                        {detailMember.nik || '—'}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between py-2.5">
                      <dt className="text-muted-foreground">{tx('WhatsApp / Phone', 'WhatsApp / HP')}</dt>
                      <dd className="tabular-nums font-medium text-foreground">
                        {detailMember.phone || '—'}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between py-2.5">
                      <dt className="text-muted-foreground">{tx('Registered', 'Terdaftar')}</dt>
                      <dd className="text-xs text-foreground">
                        {formatDateTime(detailMember.createdAt)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between py-2.5">
                      <dt className="text-muted-foreground">{tx('Total Bookings', 'Total Booking')}</dt>
                      <dd className="tabular-nums font-medium text-foreground">
                        {detailMemberBookings.length} {tx('bookings', 'transaksi')}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between py-2.5">
                      <dt className="text-muted-foreground">{tx('Total Spend', 'Total Belanja')}</dt>
                      <dd className="font-medium text-foreground">
                        <CurrencyText amount={totalSpend} />
                      </dd>
                    </div>
                  </dl>

                  {detailMemberBookings.length > 0 ? (
                    <div className="space-y-2 border-t pt-4">
                      <p className="text-xs font-medium text-muted-foreground">
                        {tx('Recent Bookings', 'Booking Terakhir')}
                      </p>
                      <div className="divide-y divide-border">
                        {detailMemberBookings.slice(0, 4).map((b) => (
                          <div
                            key={b.id}
                            className="flex items-center justify-between gap-2 py-2 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-medium text-foreground">
                                {b.invoiceNumber}
                              </span>
                              <StatusBadge status={b.bookingStatus} />
                            </div>
                            <CurrencyText
                              amount={b.totalAmount}
                              className="font-medium text-foreground"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {detailMember.phone ? (
                    <div className="border-t pt-4">
                      <WhatsAppButton
                        phone={detailMember.phone}
                        message={tx(
                          `Hello ${detailMember.displayName}, reaching out from the CameraRent team.`,
                          `Halo ${detailMember.displayName}, kami dari tim CameraRent.`
                        )}
                        className="w-full"
                      />
                    </div>
                  ) : null}
                </TabsContent>

                {/* Tab 2: Edit Profile (Superadmin) */}
                {isSuperAdmin ? (
                  <TabsContent value="edit" className="mt-4">
                    <form onSubmit={handleSaveMemberEdit} className="space-y-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="member-edit-name">{tx('Full Name', 'Nama Lengkap')}</Label>
                        <Input
                          id="member-edit-name"
                          value={memberEditForm.displayName}
                          onChange={(e) =>
                            setMemberEditForm((prev) => ({
                              ...prev,
                              displayName: e.target.value,
                            }))
                          }
                          placeholder={tx('Full legal name', 'Nama sesuai KTP')}
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="member-edit-nik">
                            {tx('National ID / NIK (16 Digits)', 'NIK (16 Digit)')}
                          </Label>
                          <Input
                            id="member-edit-nik"
                            className="font-mono text-xs"
                            maxLength={16}
                            value={memberEditForm.nik}
                            onChange={(e) =>
                              setMemberEditForm((prev) => ({
                                ...prev,
                                nik: e.target.value.replace(/\D/g, '').slice(0, 16),
                              }))
                            }
                            placeholder="3174xxxxxxxxxxxx"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="member-edit-phone">
                            {tx('WhatsApp / Phone', 'WhatsApp / HP')}
                          </Label>
                          <Input
                            id="member-edit-phone"
                            value={memberEditForm.phone}
                            onChange={(e) =>
                              setMemberEditForm((prev) => ({ ...prev, phone: e.target.value }))
                            }
                            placeholder="0812xxxxxxxx"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label>{tx('Access Role', 'Role Akses')}</Label>
                          <Select
                            value={memberEditForm.role}
                            onValueChange={(v) =>
                              setMemberEditForm((prev) => ({
                                ...prev,
                                role: v as UserRole,
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="user">User</SelectItem>
                              <SelectItem value="staff">Staff</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="superadmin">Superadmin</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {memberEditForm.role === 'admin' || memberEditForm.role === 'staff' ? (
                          <div className="space-y-1.5">
                            <Label>{tx('Assigned Branch', 'Cabang Ditugaskan')}</Label>
                            <Select
                              value={memberEditForm.tenantId}
                              onValueChange={(v) =>
                                setMemberEditForm((prev) => ({ ...prev, tenantId: v }))
                              }
                            >
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
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label>{tx('Membership Tier', 'Membership Tier')}</Label>
                          <Select
                            value={memberEditForm.membershipTier}
                            onValueChange={(v) =>
                              setMemberEditForm((prev) => ({
                                ...prev,
                                membershipTier: v as MembershipTier,
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="basic">Basic</SelectItem>
                              <SelectItem value="premium">Premium</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>{tx('KYC Status', 'Status KYC')}</Label>
                          <Select
                            value={memberEditForm.kycStatus}
                            onValueChange={(v) =>
                              setMemberEditForm((prev) => ({
                                ...prev,
                                kycStatus: v as KycStatus,
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unverified">{tx('Unverified', 'Belum Verifikasi')}</SelectItem>
                              <SelectItem value="pending">{tx('KYC Pending', 'KYC Menunggu')}</SelectItem>
                              <SelectItem value="verified">{tx('KYC Verified', 'KYC Terverifikasi')}</SelectItem>
                              <SelectItem value="rejected">{tx('KYC Rejected', 'KYC Ditolak')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setDetailTab('overview')}
                        >
                          {tx('Cancel', 'Batal')}
                        </Button>
                        <Button type="submit" disabled={savingMemberEdit}>
                          {savingMemberEdit
                            ? tx('Saving...', 'Menyimpan...')
                            : tx('Save Changes', 'Simpan Perubahan')}
                        </Button>
                      </div>
                    </form>
                  </TabsContent>
                ) : null}

                {/* Tab 3: Tier, KYC & Blacklist */}
                <TabsContent value="access" className="mt-4 space-y-5">
                  {/* Membership Tier */}
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {tx('Membership Tier', 'Membership Tier')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {tx('Switch renter membership level.', 'Ubah level keanggotaan penyewa.')}
                      </p>
                    </div>
                    <div className="inline-flex rounded-lg border bg-muted/60 p-1">
                      <button
                        type="button"
                        disabled={updatingUid === detailMember.uid}
                        onClick={() => void handleSetTier(detailMember, 'basic')}
                        className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                          detailMember.membershipTier === 'basic'
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Basic
                      </button>
                      <button
                        type="button"
                        disabled={updatingUid === detailMember.uid}
                        onClick={() => void handleSetTier(detailMember, 'premium')}
                        className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                          detailMember.membershipTier === 'premium'
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Premium
                      </button>
                    </div>
                  </div>

                  {/* KYC Verification (Superadmin) */}
                  {isSuperAdmin ? (
                    <div className="space-y-3 border-t pt-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {tx('KYC Documents', 'Dokumen KYC')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {detailMember.kycDocs?.length ?? 0}{' '}
                            {tx('file(s) uploaded', 'berkas terunggah')}
                          </p>
                        </div>
                        <StatusBadge status={detailMember.kycStatus} />
                      </div>

                      {detailMember.kycDocs && detailMember.kycDocs.length > 0 ? (
                        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                          {detailMember.kycDocs.map((url, idx) => (
                            <button
                              key={url}
                              type="button"
                              onClick={() =>
                                setPreviewState({
                                  open: true,
                                  images: (detailMember.kycDocs ?? []).map((u, i) => ({
                                    url: u,
                                    label: `${tx('KYC Document', 'Dokumen KYC')} ${i + 1} — ${detailMember.displayName}`,
                                  })),
                                  index: idx,
                                })
                              }
                              className="group overflow-hidden rounded-md border bg-muted/40 text-left transition-colors hover:border-foreground/30"
                            >
                              <img
                                src={url}
                                alt={`KYC ${idx + 1}`}
                                className="h-20 w-full object-cover"
                              />
                              <div className="flex items-center justify-between px-2 py-1 text-[11px] text-muted-foreground">
                                <span>
                                  {tx('Document', 'Dokumen')} {idx + 1}
                                </span>
                                <Eye className="h-3 w-3" strokeWidth={1.5} />
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {tx(
                            'No ID card / selfie documents uploaded yet.',
                            'Belum ada dokumen KTP / selfie yang diunggah.'
                          )}
                        </p>
                      )}

                      <div className="flex items-center gap-2">
                        {detailMember.kycStatus !== 'verified' ? (
                          <Button
                            size="sm"
                            disabled={updatingUid === detailMember.uid}
                            onClick={() => void handleKycDecision(detailMember, 'verified')}
                          >
                            {tx('Verify KYC', 'Verifikasi KYC')}
                          </Button>
                        ) : null}
                        {detailMember.kycStatus !== 'rejected' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={updatingUid === detailMember.uid}
                            onClick={() => void handleKycDecision(detailMember, 'rejected')}
                          >
                            {detailMember.kycStatus === 'verified'
                              ? tx('Revoke Verification', 'Cabut Verifikasi')
                              : tx('Reject KYC', 'Tolak KYC')}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {/* Global Blacklist Danger Zone (Superadmin) */}
                  {isSuperAdmin ? (
                    <div className="space-y-3 border-t pt-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">Global Blacklist</p>
                        <p className="text-xs text-muted-foreground">
                          {detailMember.isBlacklisted
                            ? tx(
                                'This account is currently blocked across all branches.',
                                'Akun ini sedang diblokir di seluruh cabang.'
                              )
                            : tx(
                                'Globally block this renter for severe policy violations.',
                                'Blokir akses penyewa secara global jika terjadi pelanggaran berat.'
                              )}
                        </p>
                      </div>

                      {!detailMember.isBlacklisted ? (
                        <Textarea
                          placeholder={tx(
                            'Enter blacklist reason (min. 5 characters)...',
                            'Tulis alasan blacklist (min. 5 karakter)...'
                          )}
                          value={blacklistReason}
                          onChange={(e) => setBlacklistReason(e.target.value)}
                          rows={2}
                        />
                      ) : null}

                      <Button
                        size="sm"
                        variant={detailMember.isBlacklisted ? 'outline' : 'destructive'}
                        disabled={updatingUid === detailMember.uid}
                        onClick={() => void handleToggleBlacklist(detailMember)}
                      >
                        {detailMember.isBlacklisted
                          ? tx('Remove from Global Blacklist', 'Cabut dari Global Blacklist')
                          : tx('Apply Global Blacklist', 'Terapkan Global Blacklist')}
                      </Button>
                    </div>
                  ) : null}
                </TabsContent>
              </Tabs>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <ImagePreviewModal
        open={previewState.open}
        onOpenChange={(open) => setPreviewState((prev) => ({ ...prev, open }))}
        images={previewState.images}
        initialIndex={previewState.index}
        title={tx('KYC Documents', 'Dokumen KYC')}
      />
    </div>
  );
}
