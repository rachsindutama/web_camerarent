import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, doc, getDocs, Timestamp, updateDoc } from 'firebase/firestore';
import {
  Award,
  CheckCircle2,
  Eye,
  Search,
  ShieldBan,
  ShieldCheck,
  UserCog,
  Users,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { MEMBERSHIP_BENEFITS } from '@/lib/membership';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
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
import type { MembershipTier, UserProfile, UserRole } from '@/types/schema';

type FilterTab = 'all' | 'general' | 'premium' | 'pending_kyc' | 'blacklisted';

export function MembersPage() {
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();
  const { allTenants } = useTenant();
  const isSuperAdmin = userProfile?.role === 'superadmin';

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<FilterTab>('all');
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);

  // Superadmin governance modals
  const [kycTarget, setKycTarget] = useState<UserProfile | null>(null);
  const [blacklistTarget, setBlacklistTarget] = useState<UserProfile | null>(null);
  const [blacklistReason, setBlacklistReason] = useState('');
  const [roleTarget, setRoleTarget] = useState<UserProfile | null>(null);
  const [selectedRole, setSelectedRole] = useState<UserRole>('user');
  const [selectedTenantId, setSelectedTenantId] = useState<string>('none');
  const [previewState, setPreviewState] = useState<{
    open: boolean;
    images: PreviewImageItem[];
    index: number;
  }>({ open: false, images: [], index: 0 });

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

  const handleSetTier = async (user: UserProfile, nextTier: MembershipTier) => {
    if (!db || user.membershipTier === nextTier) return;
    setUpdatingUid(user.uid);
    try {
      await updateDoc(doc(db, 'users', user.uid), { membershipTier: nextTier });
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      toast.success(
        `${user.displayName} diubah ke ${nextTier === 'premium' ? 'PREMIUM' : 'GENERAL'}.`
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

  const handleSaveRole = async () => {
    if (!db || !roleTarget) return;
    if (selectedRole === 'admin' && selectedTenantId === 'none') {
      toast.error('Pilih cabang untuk role Tenant Admin.');
      return;
    }
    try {
      await updateDoc(doc(db, 'users', roleTarget.uid), {
        role: selectedRole,
        tenantId: selectedRole === 'admin' ? selectedTenantId : null,
      });
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      await queryClient.invalidateQueries({ queryKey: ['staff-users'] });
      toast.success(`Role ${roleTarget.email} diperbarui.`);
      setRoleTarget(null);
    } catch (error) {
      console.error('Role update error:', error);
      toast.error('Gagal mengubah role akun.');
    }
  };

  const filtered = users.filter((u) => {
    if (tab === 'general' && u.membershipTier !== 'general') return false;
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
        <h2 className="text-base font-semibold tracking-tight text-zinc-950">
          Members, Tiers, KYC &amp; Global Blacklist
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Satu pusat kendali untuk mengelola tier member (<span className="font-mono">GENERAL</span>{' '}
          / <span className="font-mono">PREMIUM</span>), verifikasi KYC, role akun, dan status
          Global Blacklist lintas cabang.
        </p>
      </div>

      {/* Compact Benefit Comparison Reference */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card className="shadow-none">
          <CardHeader className="flex flex-row items-center justify-between py-2.5">
            <CardTitle className="text-xs font-semibold">General Member (Default)</CardTitle>
            <MembershipBadge tier="general" />
          </CardHeader>
          <CardContent className="pb-3 text-[11px] text-zinc-600">
            Diskon 0% · Deposit 100% · Grace standar cabang · Ongkir penuh · Maks.{' '}
            <span className="font-mono font-medium text-zinc-900">
              {MEMBERSHIP_BENEFITS.general.maxUnitsPerBooking} unit
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
            <TabsTrigger value="all">Semua ({users.length})</TabsTrigger>
            <TabsTrigger value="general">
              General ({users.filter((u) => u.membershipTier === 'general').length})
            </TabsTrigger>
            <TabsTrigger value="premium">
              Premium ({users.filter((u) => u.membershipTier === 'premium').length})
            </TabsTrigger>
            <TabsTrigger value="pending_kyc">
              Pending KYC ({users.filter((u) => u.kycStatus === 'pending').length})
            </TabsTrigger>
            <TabsTrigger value="blacklisted">
              Blacklisted ({users.filter((u) => u.isBlacklisted).length})
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
          LOADING MEMBER &amp; GOVERNANCE REGISTRY...
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Tidak ada akun yang cocok"
          description="Ubah filter tab atau kata kunci pencarian."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>NIK / Phone</TableHead>
              <TableHead>Role &amp; Cabang</TableHead>
              <TableHead>Member Tier</TableHead>
              <TableHead>KYC &amp; Blacklist</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((user) => {
              const tenantName = allTenants.find((t) => t.id === user.tenantId)?.name;
              return (
                <TableRow key={user.uid}>
                  <TableCell>
                    <p className="font-medium text-zinc-950">{user.displayName}</p>
                    <p className="font-mono text-[11px] text-zinc-500">{user.email}</p>
                  </TableCell>
                  <TableCell className="font-mono text-[11px]">
                    <div>{user.nik ?? 'No NIK'}</div>
                    <div className="text-zinc-500">{user.phone || '—'}</div>
                  </TableCell>
                  <TableCell>
                    <span className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] uppercase text-zinc-700">
                      {user.role}
                    </span>
                    {tenantName ? (
                      <p className="mt-1 text-[11px] text-zinc-500">{tenantName}</p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <MembershipBadge tier={user.membershipTier} />
                      <button
                        type="button"
                        disabled={updatingUid === user.uid}
                        onClick={() =>
                          void handleSetTier(
                            user,
                            user.membershipTier === 'premium' ? 'general' : 'premium'
                          )
                        }
                        className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-zinc-700 hover:bg-zinc-50"
                        title="Ubah tier member"
                      >
                        {user.membershipTier === 'premium' ? 'Set General' : 'Set Premium'}
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
                            <p className="mt-0.5 max-w-[160px] truncate text-[10px] text-red-700">
                              {user.blacklistReason}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1.5">
                      {isSuperAdmin ? (
                        <>
                          <Button variant="outline" size="sm" onClick={() => setKycTarget(user)}>
                            <ShieldCheck className="h-3 w-3" strokeWidth={1.5} />
                            KYC
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setRoleTarget(user);
                              setSelectedRole(user.role);
                              setSelectedTenantId(user.tenantId ?? 'none');
                            }}
                          >
                            <UserCog className="h-3 w-3" strokeWidth={1.5} />
                            Role
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
                              user.membershipTier === 'premium' ? 'general' : 'premium'
                            )
                          }
                        >
                          <Award className="h-3 w-3" strokeWidth={1.5} />
                          {user.membershipTier === 'premium' ? 'Turunkan ke General' : 'Upgrade Premium'}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
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

      {/* Role Assignment Dialog */}
      <Dialog open={Boolean(roleTarget)} onOpenChange={(o) => !o && setRoleTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign RBAC Role &amp; Cabang</DialogTitle>
            <DialogDescription>{roleTarget?.email}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as UserRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Renter (user)</SelectItem>
                  <SelectItem value="admin">Tenant Admin (admin)</SelectItem>
                  <SelectItem value="superadmin">Platform Superadmin (superadmin)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedRole === 'admin' ? (
              <div className="space-y-1.5">
                <Label>Cabang Rental</Label>
                <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih cabang..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
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

          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleTarget(null)}>
              Batal
            </Button>
            <Button onClick={() => void handleSaveRole()}>Simpan Role</Button>
          </DialogFooter>
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
