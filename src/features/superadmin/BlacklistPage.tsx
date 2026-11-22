import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, doc, getDocs, Timestamp, updateDoc } from 'firebase/firestore';
import {
  CheckCircle2,
  Eye,
  Search,
  ShieldBan,
  ShieldCheck,
  UserCog,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { useTenant } from '@/hooks/useTenant';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { MembershipBadge } from '@/components/shared/MembershipBadge';
import {
  ImagePreviewModal,
  type PreviewImageItem,
} from '@/components/shared/ImagePreviewModal';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
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

export function BlacklistPage() {
  const queryClient = useQueryClient();
  const { allTenants } = useTenant();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'blacklisted' | 'pending_kyc'>('all');

  const [blacklistTarget, setBlacklistTarget] = useState<UserProfile | null>(null);
  const [blacklistReason, setBlacklistReason] = useState('');

  const [kycTarget, setKycTarget] = useState<UserProfile | null>(null);
  const [previewState, setPreviewState] = useState<{
    open: boolean;
    images: PreviewImageItem[];
    index: number;
  }>({ open: false, images: [], index: 0 });

  const [roleTarget, setRoleTarget] = useState<UserProfile | null>(null);
  const [selectedRole, setSelectedRole] = useState<UserRole>('user');
  const [selectedTenantId, setSelectedTenantId] = useState<string>('none');

  const { data: users = [], isLoading } = useQuery<UserProfile[]>({
    queryKey: ['superadmin', 'users'],
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

  const filtered = users.filter((u) => {
    if (tab === 'blacklisted' && !u.isBlacklisted) return false;
    if (tab === 'pending_kyc' && u.kycStatus !== 'pending') return false;
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      u.displayName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.nik ?? '').includes(q) ||
      u.phone.includes(q)
    );
  });

  const handleConfirmBlacklist = async () => {
    if (!db || !blacklistTarget) return;
    if (!blacklistTarget.isBlacklisted && blacklistReason.trim().length < 5) {
      toast.error('Provide a clear reason before blacklisting an account.');
      return;
    }
    try {
      const nextState = !blacklistTarget.isBlacklisted;
      await updateDoc(doc(db, 'users', blacklistTarget.uid), {
        isBlacklisted: nextState,
        blacklistReason: nextState ? blacklistReason.trim() : '',
      });
      await queryClient.invalidateQueries({ queryKey: ['superadmin', 'users'] });
      toast.success(
        nextState
          ? `${blacklistTarget.email} added to Global Blacklist.`
          : `${blacklistTarget.email} removed from Global Blacklist.`
      );
      setBlacklistTarget(null);
      setBlacklistReason('');
    } catch (error) {
      console.error('Blacklist update error:', error);
      toast.error('Failed to update blacklist status.');
    }
  };

  const handleKycDecision = async (user: UserProfile, decision: 'verified' | 'rejected') => {
    if (!db) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), { kycStatus: decision });
      await queryClient.invalidateQueries({ queryKey: ['superadmin', 'users'] });
      toast.success(`KYC for ${user.displayName} marked ${decision}.`);
      setKycTarget(null);
    } catch (error) {
      console.error('KYC decision error:', error);
      toast.error('Failed to update KYC status.');
    }
  };

  const handleToggleMembershipTier = async (user: UserProfile) => {
    if (!db) return;
    const nextTier: MembershipTier = user.membershipTier === 'premium' ? 'general' : 'premium';
    try {
      await updateDoc(doc(db, 'users', user.uid), { membershipTier: nextTier });
      await queryClient.invalidateQueries({ queryKey: ['superadmin', 'users'] });
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      toast.success(`${user.displayName} switched to ${nextTier.toUpperCase()}.`);
    } catch (error) {
      console.error('Membership tier toggle error:', error);
      toast.error('Failed to change membership tier.');
    }
  };

  const handleSaveRole = async () => {
    if (!db || !roleTarget) return;
    if (selectedRole === 'admin' && selectedTenantId === 'none') {
      toast.error('Select an assigned tenant for Tenant Admin role.');
      return;
    }
    try {
      await updateDoc(doc(db, 'users', roleTarget.uid), {
        role: selectedRole,
        tenantId: selectedRole === 'admin' ? selectedTenantId : null,
      });
      await queryClient.invalidateQueries({ queryKey: ['superadmin', 'users'] });
      toast.success(`Updated RBAC role for ${roleTarget.email}.`);
      setRoleTarget(null);
    } catch (error) {
      console.error('Role update error:', error);
      toast.error('Failed to update user role.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="border-b border-zinc-200 pb-4">
        <h2 className="text-base font-semibold tracking-tight text-zinc-950">
          Global Blacklist, KYC &amp; RBAC Registry
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Search renters by NIK or email to enforce cross-tenant bans, review identity dossiers, and
          assign branch admin permissions.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="all">All Users ({users.length})</TabsTrigger>
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
            placeholder="Search name, email, or 16-digit NIK..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-md border border-zinc-200 bg-white p-8 text-center font-mono text-xs text-zinc-400">
          LOADING USER REGISTRY...
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ShieldBan}
          title="No matching accounts"
          description="No users match your current filter or search query."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>NIK / Phone</TableHead>
              <TableHead>Role &amp; Tenant</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>KYC Status</TableHead>
              <TableHead>Blacklist</TableHead>
              <TableHead className="text-right">Actions</TableHead>
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
                    <button
                      type="button"
                      onClick={() => void handleToggleMembershipTier(user)}
                      title="Click to toggle General / Premium tier"
                      className="transition-opacity hover:opacity-75"
                    >
                      <MembershipBadge tier={user.membershipTier} />
                    </button>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={user.kycStatus} />
                  </TableCell>
                  <TableCell>
                    {user.isBlacklisted ? (
                      <div>
                        <StatusBadge status="blacklisted" />
                        {user.blacklistReason ? (
                          <p className="mt-1 max-w-[180px] truncate text-[11px] text-red-700">
                            {user.blacklistReason}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <span className="font-mono text-[11px] text-zinc-400">CLEAR</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1.5">
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
              {blacklistTarget?.isBlacklisted ? 'Remove Global Blacklist Flag' : 'Flag User on Global Blacklist'}
            </DialogTitle>
            <DialogDescription>
              {blacklistTarget?.displayName} ({blacklistTarget?.email})
            </DialogDescription>
          </DialogHeader>

          {blacklistTarget && !blacklistTarget.isBlacklisted ? (
            <div className="space-y-1.5">
              <Label htmlFor="ban-reason">Incident / Blacklist Reason</Label>
              <Textarea
                id="ban-reason"
                placeholder="e.g., Unreturned Sony FX3 body (INV/202611/4412) or unpaid damage liability."
                value={blacklistReason}
                onChange={(e) => setBlacklistReason(e.target.value)}
              />
            </div>
          ) : (
            <p className="text-xs text-zinc-600">
              Restoring this account will re-enable checkout across all active rental houses.
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setBlacklistTarget(null)}>
              Cancel
            </Button>
            <Button
              variant={blacklistTarget?.isBlacklisted ? 'default' : 'destructive'}
              onClick={() => void handleConfirmBlacklist()}
            >
              {blacklistTarget?.isBlacklisted ? 'Restore Access' : 'Enforce Global Ban'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* KYC Review Dialog */}
      <Dialog open={Boolean(kycTarget)} onOpenChange={(o) => !o && setKycTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>KYC Identity Review</DialogTitle>
            <DialogDescription>
              Verify National ID (NIK) and uploaded documentation before unlocking checkout.
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
                  <p className="text-[11px] text-zinc-500">
                    No files uploaded yet. Superadmin may still manually verify test accounts.
                  </p>
                )}
              </div>
            </div>
          ) : null}

          <DialogFooter className="items-center sm:justify-between">
            <div>
              {kycTarget ? <StatusBadge status={kycTarget.kycStatus} /> : null}
            </div>
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

      {/* RBAC Role Assignment Dialog */}
      <Dialog open={Boolean(roleTarget)} onOpenChange={(o) => !o && setRoleTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign RBAC Role &amp; Branch</DialogTitle>
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
                <Label>Assigned Rental House</Label>
                <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select branch..." />
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
              Cancel
            </Button>
            <Button onClick={() => void handleSaveRole()}>Update Permissions</Button>
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

