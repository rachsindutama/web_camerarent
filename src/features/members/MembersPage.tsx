import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, doc, getDocs, query, Timestamp, updateDoc, where } from 'firebase/firestore';
import {
  Award,
  CalendarClock,
  CheckCircle2,
  Eye,
  Pencil,
  Phone,
  Save,
  Search,
  ShieldBan,
  ShieldCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { MEMBERSHIP_BENEFITS } from '@/lib/membership';
import { formatDateTime } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { CurrencyText } from '@/components/shared/CurrencyText';
import {
  ImagePreviewModal,
  type PreviewImageItem,
} from '@/components/shared/ImagePreviewModal';
import { MembershipBadge } from '@/components/shared/MembershipBadge';
import { StatusBadge } from '@/components/shared/StatusBadge';
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
import type { Booking, KycStatus, MembershipTier, UserProfile } from '@/types/schema';

type FilterTab = 'all' | 'basic' | 'premium' | 'pending_kyc' | 'blacklisted';

export function MembersPage() {
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();
  const isSuperAdmin = userProfile?.role === 'superadmin';

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<FilterTab>('all');
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);

  // Governance modals (Superadmin) & Member Detail / Edit modal
  const [detailMemberUid, setDetailMemberUid] = useState<string | null>(null);
  const [isEditingMember, setIsEditingMember] = useState(false);
  const [savingMemberEdit, setSavingMemberEdit] = useState(false);
  const [memberEditForm, setMemberEditForm] = useState({
    displayName: '',
    phone: '',
    nik: '',
    membershipTier: 'basic' as MembershipTier,
    kycStatus: 'unverified' as KycStatus,
  });
  const [kycTarget, setKycTarget] = useState<UserProfile | null>(null);
  const [blacklistTarget, setBlacklistTarget] = useState<UserProfile | null>(null);
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

  const openMemberDetail = (member: UserProfile, startEdit = false) => {
    setDetailMemberUid(member.uid);
    setMemberEditForm({
      displayName: member.displayName,
      phone: member.phone || '',
      nik: member.nik || '',
      membershipTier: member.membershipTier,
      kycStatus: member.kycStatus,
    });
    setIsEditingMember(startEdit && isSuperAdmin);
  };

  const handleSaveMemberEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !detailMember || !isSuperAdmin) return;

    const cleanName = memberEditForm.displayName.trim();
    const cleanPhone = memberEditForm.phone.trim();
    const cleanNik = memberEditForm.nik.replace(/\D/g, '');

    if (cleanName.length < 2) {
      toast.error('Nama lengkap minimal 2 karakter.');
      return;
    }
    if (cleanNik.length > 0 && cleanNik.length !== 16) {
      toast.error('NIK harus 16 digit angka (atau kosongkan jika belum ada).');
      return;
    }

    setSavingMemberEdit(true);
    try {
      await updateDoc(doc(db, 'users', detailMember.uid), {
        displayName: cleanName,
        phone: cleanPhone,
        nik: cleanNik,
        membershipTier: memberEditForm.membershipTier,
        kycStatus: memberEditForm.kycStatus,
      });
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      await queryClient.invalidateQueries({ queryKey: ['staff-users'] });
      toast.success(`Profil member ${cleanName} berhasil diperbarui.`);
      setIsEditingMember(false);
    } catch (error) {
      console.error('Update member profile error:', error);
      toast.error('Gagal menyimpan perubahan profil member.');
    } finally {
      setSavingMemberEdit(false);
    }
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

  const handleSetTier = async (user: UserProfile, nextTier: MembershipTier) => {
    if (!db || user.membershipTier === nextTier) return;
    setUpdatingUid(user.uid);
    try {
      await updateDoc(doc(db, 'users', user.uid), { membershipTier: nextTier });
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      toast.success(
        `${user.displayName} diubah ke ${nextTier === 'premium' ? 'PREMIUM' : 'BASIC'}.`
      );
    } catch (error) {
      console.error('Update tier error:', error);
      toast.error('Gagal mengubah tier member.');
    } finally {
      setUpdatingUid(null);
    }
  };

  const handleKycDecision = async (user: UserProfile, decision: 'verified' | 'rejected') => {
    if (!db) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), { kycStatus: decision });
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      toast.success(`KYC ${user.displayName} ditandai ${decision}.`);
      setKycTarget(null);
    } catch (error) {
      console.error('KYC decision error:', error);
      toast.error('Gagal memperbarui status KYC.');
    }
  };

  const handleConfirmBlacklist = async () => {
    if (!db || !blacklistTarget) return;
    if (!blacklistTarget.isBlacklisted && blacklistReason.trim().length < 5) {
      toast.error('Isi alasan blacklist minimal 5 karakter.');
      return;
    }
    try {
      const nextState = !blacklistTarget.isBlacklisted;
      await updateDoc(doc(db, 'users', blacklistTarget.uid), {
        isBlacklisted: nextState,
        blacklistReason: nextState ? blacklistReason.trim() : '',
      });
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      toast.success(
        nextState
          ? `${blacklistTarget.email} dimasukkan ke Global Blacklist.`
          : `${blacklistTarget.email} dicabut dari Global Blacklist.`
      );
      setBlacklistTarget(null);
      setBlacklistReason('');
    } catch (error) {
      console.error('Blacklist error:', error);
      toast.error('Gagal memperbarui status blacklist.');
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

  return (
    <div className="space-y-5">
      <div className="border-b border-zinc-200 pb-4">
        <h2 className="text-base font-semibold tracking-tight text-zinc-950">Member</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Daftar penyewa terdaftar — kelola tier (<span className="font-mono">BASIC</span> /{' '}
          <span className="font-mono">PREMIUM</span>), verifikasi KYC, dan status Global Blacklist.
          Akun Admin &amp; Superadmin dikelola terpisah di menu Staff &amp; Karyawan.
        </p>
      </div>

      {/* Compact Benefit Comparison Reference */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card className="shadow-none">
          <CardHeader className="flex flex-row items-center justify-between py-2.5">
            <CardTitle className="text-xs font-semibold">Basic Member (Default)</CardTitle>
            <MembershipBadge tier="basic" />
          </CardHeader>
          <CardContent className="pb-3 text-[11px] text-zinc-600">
            Diskon 0% · Deposit 100% · Grace standar cabang · Ongkir penuh · Maks.{' '}
            <span className="font-mono font-medium text-zinc-900">
              {MEMBERSHIP_BENEFITS.basic.maxUnitsPerBooking} unit
            </span>
            /booking.
          </CardContent>
        </Card>

        <Card className="border-zinc-900/20 bg-zinc-50/70 shadow-none">
          <CardHeader className="flex flex-row items-center justify-between py-2.5">
            <CardTitle className="flex items-center gap-1.5 text-xs font-semibold">
              <Award className="h-3.5 w-3.5 text-zinc-900" strokeWidth={1.5} />
              Premium Member
            </CardTitle>
            <MembershipBadge tier="premium" />
          </CardHeader>
          <CardContent className="pb-3 text-[11px] text-zinc-700">
            Diskon <span className="font-mono font-semibold text-emerald-700">10%</span> · Deposit{' '}
            <span className="font-mono font-semibold text-emerald-700">-50%</span> · Grace{' '}
            <span className="font-mono font-semibold text-emerald-700">+60m</span> · Gratis ongkir{' '}
            <span className="font-mono font-semibold text-emerald-700">5 km</span> · Unlimited unit
            · Priority Badge.
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="all">Semua ({members.length})</TabsTrigger>
            <TabsTrigger value="basic">
              Basic ({members.filter((u) => u.membershipTier === 'basic').length})
            </TabsTrigger>
            <TabsTrigger value="premium">
              Premium ({members.filter((u) => u.membershipTier === 'premium').length})
            </TabsTrigger>
            <TabsTrigger value="pending_kyc">
              Pending KYC ({members.filter((u) => u.kycStatus === 'pending').length})
            </TabsTrigger>
            <TabsTrigger value="blacklisted">
              Blacklisted ({members.filter((u) => u.isBlacklisted).length})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative w-full max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-400"
            strokeWidth={1.5}
          />
          <Input
            placeholder="Cari nama, email, atau NIK 16 digit..."
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
          title="Tidak ada member yang cocok"
          description="Penyewa yang mendaftar via /register akan otomatis tampil di sini dengan tier Basic."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>NIK / Phone</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>KYC &amp; Blacklist</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((user) => (
              <TableRow
                key={user.uid}
                onClick={() => openMemberDetail(user, false)}
                className="cursor-pointer"
              >
                <TableCell>
                  <p className="font-medium text-zinc-950">{user.displayName}</p>
                  <p className="font-mono text-[11px] text-zinc-500">{user.email}</p>
                </TableCell>
                <TableCell className="font-mono text-[11px]">
                  <div>{user.nik ?? 'No NIK'}</div>
                  <div className="text-zinc-500">{user.phone || '—'}</div>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1.5">
                    <MembershipBadge tier={user.membershipTier} />
                    <button
                      type="button"
                      disabled={updatingUid === user.uid}
                      onClick={() =>
                        void handleSetTier(
                          user,
                          user.membershipTier === 'premium' ? 'basic' : 'premium'
                        )
                      }
                      className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-zinc-700 hover:bg-zinc-50"
                      title="Ubah tier member"
                    >
                      {user.membershipTier === 'premium' ? 'Set Basic' : 'Set Premium'}
                    </button>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <StatusBadge status={user.kycStatus} />
                    {user.isBlacklisted ? (
                      <div>
                        <StatusBadge status="blacklisted" />
                        {user.blacklistReason ? (
                          <p className="mt-0.5 max-w-[180px] truncate text-[10px] text-red-700">
                            {user.blacklistReason}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="inline-flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openMemberDetail(user, false)}
                    >
                      <Eye className="h-3 w-3" strokeWidth={1.5} />
                      Detail
                    </Button>
                    {isSuperAdmin ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openMemberDetail(user, true)}
                        >
                          <Pencil className="h-3 w-3" strokeWidth={1.5} />
                          Edit
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setKycTarget(user)}>
                          <ShieldCheck className="h-3 w-3" strokeWidth={1.5} />
                          KYC
                        </Button>
                        <Button
                          variant={user.isBlacklisted ? 'outline' : 'destructive'}
                          size="sm"
                          onClick={() => {
                            setBlacklistTarget(user);
                            setBlacklistReason(user.blacklistReason ?? '');
                          }}
                        >
                          <ShieldBan className="h-3 w-3" strokeWidth={1.5} />
                          {user.isBlacklisted ? 'Lift' : 'Ban'}
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant={user.membershipTier === 'premium' ? 'outline' : 'default'}
                        disabled={updatingUid === user.uid}
                        onClick={() =>
                          void handleSetTier(
                            user,
                            user.membershipTier === 'premium' ? 'basic' : 'premium'
                          )
                        }
                      >
                        <Award className="h-3 w-3" strokeWidth={1.5} />
                        {user.membershipTier === 'premium' ? 'Turunkan ke Basic' : 'Upgrade Premium'}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Blacklist Dialog */}
      <Dialog open={Boolean(blacklistTarget)} onOpenChange={(o) => !o && setBlacklistTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {blacklistTarget?.isBlacklisted
                ? 'Cabut Status Global Blacklist'
                : 'Masukkan ke Global Blacklist'}
            </DialogTitle>
            <DialogDescription>
              {blacklistTarget?.displayName} ({blacklistTarget?.email})
            </DialogDescription>
          </DialogHeader>

          {blacklistTarget && !blacklistTarget.isBlacklisted ? (
            <div className="space-y-1.5">
              <Label htmlFor="ban-reason">Alasan Blacklist / Insiden</Label>
              <Textarea
                id="ban-reason"
                placeholder="mis. Unit Sony FX3 tidak dikembalikan / denda kerusakan belum dibayar."
                value={blacklistReason}
                onChange={(e) => setBlacklistReason(e.target.value)}
              />
            </div>
          ) : (
            <p className="text-xs text-zinc-600">
              Mencabut status blacklist akan mengembalikan akses booking akun ini di semua cabang.
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setBlacklistTarget(null)}>
              Batal
            </Button>
            <Button
              variant={blacklistTarget?.isBlacklisted ? 'default' : 'destructive'}
              onClick={() => void handleConfirmBlacklist()}
            >
              {blacklistTarget?.isBlacklisted ? 'Pulihkan Akses' : 'Terapkan Global Ban'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* KYC Identity Review Dialog */}
      <Dialog open={Boolean(kycTarget)} onOpenChange={(o) => !o && setKycTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>KYC Identity Review</DialogTitle>
            <DialogDescription>
              Verifikasi NIK 16 digit dan dokumen KTP/Selfie sebelum membuka akses checkout.
            </DialogDescription>
          </DialogHeader>

          {kycTarget ? (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 font-mono text-[11px]">
                <div>
                  <span className="text-zinc-400">NAME: </span>
                  <span className="text-zinc-900">{kycTarget.displayName}</span>
                </div>
                <div>
                  <span className="text-zinc-400">STATUS: </span>
                  <span className="uppercase text-zinc-900">{kycTarget.kycStatus}</span>
                </div>
                <div>
                  <span className="text-zinc-400">NIK: </span>
                  <span className="text-zinc-900">{kycTarget.nik ?? 'Not submitted'}</span>
                </div>
                <div>
                  <span className="text-zinc-400">PHONE: </span>
                  <span className="text-zinc-900">{kycTarget.phone || '—'}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Uploaded Documents ({kycTarget.kycDocs?.length ?? 0})</Label>
                {kycTarget.kycDocs && kycTarget.kycDocs.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2.5">
                    {kycTarget.kycDocs.map((url, idx) => (
                      <button
                        key={url}
                        type="button"
                        onClick={() =>
                          setPreviewState({
                            open: true,
                            images: (kycTarget.kycDocs ?? []).map((u, i) => ({
                              url: u,
                              label: `KYC_DOC_${i + 1} — ${kycTarget.displayName}`,
                            })),
                            index: idx,
                          })
                        }
                        className="group overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 text-left transition-colors hover:border-zinc-400"
                      >
                        <div className="relative h-28 w-full overflow-hidden bg-zinc-100">
                          <img
                            src={url}
                            alt={`KYC_DOC_${idx + 1}`}
                            className="h-full w-full object-cover transition-transform duration-150 group-hover:scale-105"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/0 transition-colors group-hover:bg-zinc-950/35">
                            <span className="inline-flex items-center gap-1 rounded bg-white/95 px-2 py-1 font-mono text-[10px] font-medium text-zinc-900 opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                              <Eye className="h-3 w-3" strokeWidth={1.5} />
                              Preview
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between px-2.5 py-1.5 font-mono text-[10px] text-zinc-600">
                          <span>KYC_DOC_{idx + 1}</span>
                          <Eye className="h-3 w-3 text-zinc-400" strokeWidth={1.5} />
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-zinc-500">Belum ada dokumen KTP yang diunggah.</p>
                )}
              </div>
            </div>
          ) : null}

          <DialogFooter className="items-center sm:justify-between">
            <div>{kycTarget ? <StatusBadge status={kycTarget.kycStatus} /> : null}</div>
            <div className="flex items-center gap-2">
              {kycTarget?.kycStatus !== 'rejected' ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => kycTarget && void handleKycDecision(kycTarget, 'rejected')}
                >
                  <XCircle className="h-3.5 w-3.5" strokeWidth={1.5} />
                  {kycTarget?.kycStatus === 'verified' ? 'Revoke / Reject' : 'Reject'}
                </Button>
              ) : null}

              {kycTarget?.kycStatus !== 'verified' ? (
                <Button
                  size="sm"
                  onClick={() => kycTarget && void handleKycDecision(kycTarget, 'verified')}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Approve &amp; Verify KYC
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setKycTarget(null)}>
                  Close
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Member Detail & Edit Modal */}
      <Dialog
        open={Boolean(detailMember)}
        onOpenChange={(open) => {
          if (!open) {
            setDetailMemberUid(null);
            setIsEditingMember(false);
          }
        }}
      >
        <DialogContent className="flex max-h-[88vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b border-zinc-200 bg-zinc-50/80 px-6 py-4 pr-12">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="text-base font-semibold text-zinc-950">
                {isEditingMember ? `Edit Profil — ${detailMember?.displayName}` : detailMember?.displayName}
              </DialogTitle>
              {detailMember ? <MembershipBadge tier={detailMember.membershipTier} /> : null}
              {detailMember ? <StatusBadge status={detailMember.kycStatus} /> : null}
              {detailMember?.isBlacklisted ? <StatusBadge status="blacklisted" /> : null}
            </div>
            <DialogDescription className="mt-1 font-mono text-[11px] text-zinc-500">
              {detailMember?.email} · Terdaftar {formatDateTime(detailMember?.createdAt)}
            </DialogDescription>
          </DialogHeader>

          {detailMember ? (
            isEditingMember && isSuperAdmin ? (
              <form
                id="edit-member-form"
                onSubmit={handleSaveMemberEdit}
                className="flex-1 space-y-4 overflow-y-auto px-6 py-5 text-xs"
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="member-edit-name">Nama Lengkap</Label>
                    <Input
                      id="member-edit-name"
                      value={memberEditForm.displayName}
                      onChange={(e) =>
                        setMemberEditForm((prev) => ({ ...prev, displayName: e.target.value }))
                      }
                      placeholder="Nama sesuai KTP"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="member-edit-nik">NIK (16 Digit)</Label>
                    <Input
                      id="member-edit-nik"
                      className="font-mono"
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
                    <Label htmlFor="member-edit-phone">No. HP / WhatsApp</Label>
                    <Input
                      id="member-edit-phone"
                      className="font-mono"
                      value={memberEditForm.phone}
                      onChange={(e) =>
                        setMemberEditForm((prev) => ({ ...prev, phone: e.target.value }))
                      }
                      placeholder="0812xxxxxxxx"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Membership Tier</Label>
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
                        <SelectItem value="basic">Basic (Default)</SelectItem>
                        <SelectItem value="premium">Premium</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Status KYC</Label>
                    <Select
                      value={memberEditForm.kycStatus}
                      onValueChange={(v) =>
                        setMemberEditForm((prev) => ({ ...prev, kycStatus: v as KycStatus }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unverified">Unverified</SelectItem>
                        <SelectItem value="pending">Pending Review</SelectItem>
                        <SelectItem value="verified">KYC Verified</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-[10px] text-zinc-500">
                  EMAIL AKUN (GOOGLE AUTH): {detailMember.email} · UID: {detailMember.uid}
                </div>
              </form>
            ) : (
              <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5 text-xs">
                {detailMember.isBlacklisted ? (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-900">
                    <p className="font-mono text-[10px] font-semibold uppercase text-red-700">
                      Global Blacklist Active
                    </p>
                    <p className="mt-1 text-xs">
                      {detailMember.blacklistReason || 'Akun diblokir oleh governance platform.'}
                    </p>
                  </div>
                ) : null}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 rounded-md border border-zinc-200 bg-white p-3.5 font-mono text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-sans text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                        Identitas Member
                      </p>
                      {isSuperAdmin ? (
                        <button
                          type="button"
                          onClick={() => openMemberDetail(detailMember, true)}
                          className="inline-flex items-center gap-1 font-sans text-[11px] font-medium text-primary hover:underline"
                        >
                          <Pencil className="h-3 w-3" strokeWidth={1.5} />
                          Edit
                        </button>
                      ) : null}
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-zinc-400">NIK</span>
                      <span className="text-zinc-950">{detailMember.nik || '—'}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-zinc-400">WHATSAPP / HP</span>
                      <span className="inline-flex items-center gap-1 text-zinc-950">
                        <Phone className="h-3 w-3 text-zinc-400" strokeWidth={1.5} />
                        {detailMember.phone || '—'}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-zinc-400">UID</span>
                      <span className="truncate text-zinc-600">{detailMember.uid}</span>
                    </div>
                  </div>

                  <div className="space-y-1.5 rounded-md border border-zinc-200 bg-white p-3.5">
                    <p className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                      <CalendarClock className="h-3.5 w-3.5" strokeWidth={1.5} />
                      Ringkasan Aktivitas Sewa
                    </p>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="rounded border border-zinc-100 bg-zinc-50 p-2">
                        <p className="font-mono text-[9px] uppercase text-zinc-400">Total Booking</p>
                        <p className="mt-0.5 font-mono text-sm font-semibold text-zinc-950">
                          {detailMemberBookings.length}
                        </p>
                      </div>
                      <div className="rounded border border-zinc-100 bg-zinc-50 p-2">
                        <p className="font-mono text-[9px] uppercase text-zinc-400">Total Transaksi</p>
                        <p className="mt-0.5 text-sm font-semibold text-zinc-950">
                          <CurrencyText
                            amount={detailMemberBookings
                              .filter((b) => b.bookingStatus !== 'cancelled')
                              .reduce((s, b) => s + b.subtotal + b.deliveryFee, 0)}
                          />
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Uploaded KYC Docs */}
                <div className="space-y-2 rounded-md border border-zinc-200 bg-white p-3.5">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Dokumen KYC ({detailMember.kycDocs?.length ?? 0})
                  </p>
                  {detailMember.kycDocs && detailMember.kycDocs.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {detailMember.kycDocs.map((url, idx) => (
                        <button
                          key={url}
                          type="button"
                          onClick={() =>
                            setPreviewState({
                              open: true,
                              images: (detailMember.kycDocs ?? []).map((u, i) => ({
                                url: u,
                                label: `KYC_DOC_${i + 1} — ${detailMember.displayName}`,
                              })),
                              index: idx,
                            })
                          }
                          className="group overflow-hidden rounded border border-zinc-200 bg-zinc-50 text-left hover:border-zinc-400"
                        >
                          <img
                            src={url}
                            alt={`KYC_${idx + 1}`}
                            className="h-24 w-full object-cover transition-transform group-hover:scale-105"
                          />
                          <div className="flex items-center justify-between px-2 py-1 font-mono text-[10px] text-zinc-600">
                            <span>KYC_DOC_{idx + 1}</span>
                            <Eye className="h-3 w-3 text-zinc-400" strokeWidth={1.5} />
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-zinc-400">Belum ada dokumen KYC yang diunggah.</p>
                  )}
                </div>

                {/* Recent Bookings */}
                {detailMemberBookings.length > 0 ? (
                  <div className="space-y-2 rounded-md border border-zinc-200 bg-white p-3.5">
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                      Riwayat Booking Terakhir
                    </p>
                    <div className="divide-y divide-zinc-100">
                      {detailMemberBookings.slice(0, 5).map((b) => (
                        <div
                          key={b.id}
                          className="flex flex-wrap items-center justify-between gap-2 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-zinc-900">
                              {b.invoiceNumber}
                            </span>
                            <StatusBadge status={b.bookingStatus} />
                          </div>
                          <div className="text-right font-mono text-[11px]">
                            <CurrencyText amount={b.totalAmount} className="font-medium text-zinc-900" />
                            <span className="ml-2 text-zinc-400">{formatDateTime(b.startDate)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )
          ) : null}

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-zinc-200 bg-zinc-50/80 px-6 py-3.5">
            {detailMember ? (
              isEditingMember && isSuperAdmin ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="bg-white"
                    onClick={() => setIsEditingMember(false)}
                  >
                    Batal
                  </Button>
                  <Button
                    type="submit"
                    form="edit-member-form"
                    size="sm"
                    disabled={savingMemberEdit}
                  >
                    <Save className="h-3.5 w-3.5" strokeWidth={1.5} />
                    {savingMemberEdit ? 'Menyimpan...' : 'Simpan Perubahan'}
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    {isSuperAdmin ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="bg-white"
                        onClick={() => openMemberDetail(detailMember, true)}
                      >
                        <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                        Edit Profil
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant={detailMember.membershipTier === 'premium' ? 'outline' : 'default'}
                      disabled={updatingUid === detailMember.uid}
                      onClick={() =>
                        void handleSetTier(
                          detailMember,
                          detailMember.membershipTier === 'premium' ? 'basic' : 'premium'
                        )
                      }
                    >
                      <Award className="h-3.5 w-3.5" strokeWidth={1.5} />
                      {detailMember.membershipTier === 'premium' ? 'Set Basic' : 'Upgrade Premium'}
                    </Button>
                    {isSuperAdmin ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="bg-white"
                          onClick={() => setKycTarget(detailMember)}
                        >
                          <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.5} />
                          Review KYC
                        </Button>
                        <Button
                          size="sm"
                          variant={detailMember.isBlacklisted ? 'outline' : 'destructive'}
                          onClick={() => {
                            setBlacklistTarget(detailMember);
                            setBlacklistReason(detailMember.blacklistReason ?? '');
                          }}
                        >
                          <ShieldBan className="h-3.5 w-3.5" strokeWidth={1.5} />
                          {detailMember.isBlacklisted ? 'Cabut Ban' : 'Ban Member'}
                        </Button>
                      </>
                    ) : null}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-white"
                    onClick={() => {
                      setDetailMemberUid(null);
                      setIsEditingMember(false);
                    }}
                  >
                    Close
                  </Button>
                </>
              )
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <ImagePreviewModal
        open={previewState.open}
        onOpenChange={(open) => setPreviewState((prev) => ({ ...prev, open }))}
        images={previewState.images}
        initialIndex={previewState.index}
        title="KYC Document Inspection"
      />
    </div>
  );
}
