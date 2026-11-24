import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Search,
  UserCog,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { formatDateTime } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { useTenant } from '@/hooks/useTenant';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { WhatsAppButton } from '@/components/shared/WhatsAppButton';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import type { TenantStaff, UserProfile, UserRole } from '@/types/schema';

type TeamFilterRole = 'all' | 'superadmin' | 'admin' | 'staff';

const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  staff: 'Staff',
  user: 'User',
};

function getInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || 'S'
  );
}

export function StaffPage() {
  const { tx } = useI18n();
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();
  const { activeTenantId, activeTenant, allTenants, isAllTenants, tenantById } = useTenant();
  const isSuperAdmin = userProfile?.role === 'superadmin';

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<TeamFilterRole>('all');

  // Legacy tenant_staff Detail & Edit Dialog
  const [detailStaffId, setDetailStaffId] = useState<string | null>(null);
  const [staffModalTab, setStaffModalTab] = useState<'detail' | 'edit'>('detail');
  const [savingStaffEdit, setSavingStaffEdit] = useState(false);
  const [editStaffForm, setEditStaffForm] = useState({
    name: '',
    phone: '',
    vehicleInfo: '',
  });

  // Assign Role Dialog (Superadmin) + Searchable Paginated Account Picker
  const [assignRoleOpen, setAssignRoleOpen] = useState(false);
  const [selectedUserUid, setSelectedUserUid] = useState('');
  const [assignRole, setAssignRole] = useState<UserRole>('staff');
  const [assignTenantId, setAssignTenantId] = useState('');
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [accountSearch, setAccountSearch] = useState('');
  const [accountRoleFilter, setAccountRoleFilter] = useState<'all' | UserRole>('all');
  const [accountPage, setAccountPage] = useState(1);
  const ACCOUNT_PAGE_SIZE = 5;

  // Account Detail & Edit Dialog (Superadmin / Admin / Staff)
  const [detailAccountUid, setDetailAccountUid] = useState<string | null>(null);
  const [accountModalTab, setAccountModalTab] = useState<'detail' | 'edit'>('detail');
  const [savingAccountEdit, setSavingAccountEdit] = useState(false);
  const [accountEditForm, setAccountEditForm] = useState({
    displayName: '',
    phone: '',
    nik: '',
    role: 'staff' as UserRole,
    tenantId: '',
  });

  const { data: branchStaff = [], isLoading: loadingStaff } = useQuery<TenantStaff[]>({
    queryKey: ['tenant_staff', isAllTenants ? 'all' : activeTenantId],
    enabled: Boolean(db && (isAllTenants || activeTenantId)),
    queryFn: async () => {
      if (!db || (!isAllTenants && !activeTenantId)) return [];
      const q = isAllTenants
        ? collection(db, 'tenant_staff')
        : query(collection(db, 'tenant_staff'), where('tenantId', '==', activeTenantId));
      const snap = await getDocs(q);
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as TenantStaff)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const { data: allUsers = [], isLoading: loadingUsers } = useQuery<UserProfile[]>({
    queryKey: ['staff-users', isAllTenants ? 'all' : activeTenantId],
    enabled: Boolean(db && (isAllTenants || activeTenantId)),
    queryFn: async () => {
      if (!db) return [];
      const snap = await getDocs(collection(db, 'users'));
      return snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as UserProfile);
    },
  });

  if (!isAllTenants && (!activeTenantId || !activeTenant)) {
    return (
      <EmptyState
        icon={Users}
        title={tx('No active branch selected', 'Belum ada cabang aktif')}
        description={tx(
          'Select a rental branch in the topbar first to manage staff and admins.',
          'Pilih cabang rental di bagian atas terlebih dahulu untuk mengelola staff dan admin.'
        )}
      />
    );
  }

  const teamAccounts = allUsers.filter(
    (u) =>
      u.role === 'superadmin' ||
      ((u.role === 'admin' || u.role === 'staff') &&
        (isAllTenants || u.tenantId === activeTenantId))
  );

  const accountUidSet = new Set(teamAccounts.map((u) => u.uid));
  const standaloneStaff = branchStaff.filter((s) => !s.userId || !accountUidSet.has(s.userId));

  type UnifiedTeamRow =
    | { kind: 'account'; key: string; sortRank: number; name: string; account: UserProfile }
    | { kind: 'legacy_staff'; key: string; sortRank: number; name: string; staff: TenantStaff };

  const unifiedTeam: UnifiedTeamRow[] = [
    ...teamAccounts.map((account) => ({
      kind: 'account' as const,
      key: `acc-${account.uid}`,
      sortRank: account.role === 'superadmin' ? 0 : account.role === 'admin' ? 1 : 2,
      name: account.displayName,
      account,
    })),
    ...standaloneStaff.map((staff) => ({
      kind: 'legacy_staff' as const,
      key: `staff-${staff.id}`,
      sortRank: 2,
      name: staff.name,
      staff,
    })),
  ].sort((a, b) => a.sortRank - b.sortRank || a.name.localeCompare(b.name));

  const superadminCount = teamAccounts.filter((u) => u.role === 'superadmin').length;
  const adminCount = teamAccounts.filter((u) => u.role === 'admin').length;
  const staffCount =
    teamAccounts.filter((u) => u.role === 'staff').length + standaloneStaff.length;

  const filteredTeam = unifiedTeam.filter((row) => {
    const q = search.trim().toLowerCase();
    if (row.kind === 'account') {
      const a = row.account;
      if (roleFilter !== 'all' && roleFilter !== a.role) return false;
      if (!q) return true;
      return (
        a.displayName.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        (a.phone ?? '').toLowerCase().includes(q) ||
        (a.nik ?? '').toLowerCase().includes(q)
      );
    }
    const s = row.staff;
    if (roleFilter !== 'all' && roleFilter !== 'staff') return false;
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      (s.email ?? '').toLowerCase().includes(q) ||
      s.phone.toLowerCase().includes(q) ||
      (s.vehicleInfo ?? '').toLowerCase().includes(q)
    );
  });

  const assignableUsers = allUsers
    .filter((u) => u.uid !== userProfile?.uid)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const filteredAssignableUsers = assignableUsers.filter((u) => {
    if (accountRoleFilter !== 'all' && u.role !== accountRoleFilter) return false;
    const q = accountSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      u.displayName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.nik ?? '').includes(q) ||
      (u.phone ?? '').includes(q)
    );
  });

  const totalAccountPages = Math.max(
    1,
    Math.ceil(filteredAssignableUsers.length / ACCOUNT_PAGE_SIZE)
  );
  const safeAccountPage = Math.min(accountPage, totalAccountPages);
  const paginatedAssignableUsers = filteredAssignableUsers.slice(
    (safeAccountPage - 1) * ACCOUNT_PAGE_SIZE,
    safeAccountPage * ACCOUNT_PAGE_SIZE
  );

  const selectedAssignableUser =
    assignableUsers.find((u) => u.uid === selectedUserUid) ?? null;
  const detailStaff = branchStaff.find((s) => s.id === detailStaffId) ?? null;
  const detailAccount = allUsers.find((u) => u.uid === detailAccountUid) ?? null;
  const fallbackTenantId = activeTenantId ?? allTenants[0]?.id ?? '';
  const isLoadingTeam = loadingStaff || loadingUsers;

  const canEditAccount = (acc: UserProfile) => isSuperAdmin || acc.uid === userProfile?.uid;

  const openAssignRoleDialog = () => {
    setSelectedUserUid('');
    setAssignRole('staff');
    setAssignTenantId(fallbackTenantId);
    setAccountPickerOpen(false);
    setAccountSearch('');
    setAccountRoleFilter('all');
    setAccountPage(1);
    setAssignRoleOpen(true);
  };

  const openStaffDetail = (staff: TenantStaff) => {
    setDetailStaffId(staff.id);
    setStaffModalTab('detail');
    setEditStaffForm({
      name: staff.name,
      phone: staff.phone,
      vehicleInfo: staff.vehicleInfo ?? '',
    });
  };

  const openAccountDetail = (acc: UserProfile) => {
    setDetailAccountUid(acc.uid);
    setAccountModalTab('detail');
    setAccountEditForm({
      displayName: acc.displayName,
      phone: acc.phone || '',
      nik: acc.nik || '',
      role: acc.role,
      tenantId: acc.tenantId || fallbackTenantId,
    });
  };

  const handleSaveStaffEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !detailStaff) return;
    if (!editStaffForm.name.trim() || !editStaffForm.phone.trim()) {
      toast.error(
        tx('Name and WhatsApp / phone number are required.', 'Nama dan nomor HP/WhatsApp wajib diisi.')
      );
      return;
    }

    setSavingStaffEdit(true);
    try {
      await updateDoc(doc(db, 'tenant_staff', detailStaff.id), {
        name: editStaffForm.name.trim(),
        phone: editStaffForm.phone.trim(),
        vehicleInfo: editStaffForm.vehicleInfo.trim(),
      });
      await queryClient.invalidateQueries({ queryKey: ['tenant_staff'] });
      toast.success(
        tx(`${editStaffForm.name.trim()}'s record saved.`, `Data ${editStaffForm.name.trim()} disimpan.`)
      );
      setStaffModalTab('detail');
    } catch (error) {
      console.error('Update staff error:', error);
      toast.error(tx('Failed to save staff changes.', 'Gagal menyimpan perubahan data staff.'));
    } finally {
      setSavingStaffEdit(false);
    }
  };

  const handleToggleStaffActive = async (staff: TenantStaff) => {
    if (!db) return;
    await updateDoc(doc(db, 'tenant_staff', staff.id), { isActive: !staff.isActive });
    await queryClient.invalidateQueries({ queryKey: ['tenant_staff'] });
    toast.success(
      !staff.isActive
        ? tx(`${staff.name} is now active.`, `${staff.name} kini aktif.`)
        : tx(`${staff.name} is now inactive.`, `${staff.name} kini nonaktif.`)
    );
  };

  const handleDeleteStaff = async (staff: TenantStaff) => {
    if (!db) return;
    await deleteDoc(doc(db, 'tenant_staff', staff.id));
    await queryClient.invalidateQueries({ queryKey: ['tenant_staff'] });
    setDetailStaffId(null);
    toast.success(tx(`Staff ${staff.name} deleted.`, `Staff ${staff.name} dihapus.`));
  };

  const handleSaveAccountEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !detailAccount || !canEditAccount(detailAccount)) return;

    const cleanName = accountEditForm.displayName.trim();
    const cleanPhone = accountEditForm.phone.trim();
    const cleanNik = accountEditForm.nik.replace(/\D/g, '');

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

    const needsBranch = accountEditForm.role === 'admin' || accountEditForm.role === 'staff';
    if (isSuperAdmin && needsBranch && !accountEditForm.tenantId) {
      toast.error(tx('Select a branch for this role.', 'Pilih cabang untuk role ini.'));
      return;
    }

    setSavingAccountEdit(true);
    try {
      const isSelf = detailAccount.uid === userProfile?.uid;
      const nextRole = isSelf ? detailAccount.role : accountEditForm.role;
      const nextNeedsBranch = nextRole === 'admin' || nextRole === 'staff';

      const payload: {
        displayName: string;
        phone: string;
        nik: string;
        role?: UserRole;
        tenantId?: string | null;
      } = {
        displayName: cleanName,
        phone: cleanPhone,
        nik: cleanNik,
      };
      if (isSuperAdmin) {
        payload.role = nextRole;
        payload.tenantId = nextNeedsBranch ? accountEditForm.tenantId || fallbackTenantId : null;
      }

      await updateDoc(doc(db, 'users', detailAccount.uid), payload);
      await queryClient.invalidateQueries({ queryKey: ['staff-users'] });
      await queryClient.invalidateQueries({ queryKey: ['tenant_admin_staff'] });
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      toast.success(tx(`${cleanName}'s profile saved.`, `Profil ${cleanName} disimpan.`));
      if (payload.role === 'user') {
        setDetailAccountUid(null);
      } else {
        setAccountModalTab('detail');
      }
    } catch (error) {
      console.error('Update account profile error:', error);
      toast.error(
        tx('Failed to save account profile changes.', 'Gagal menyimpan perubahan profil akun.')
      );
    } finally {
      setSavingAccountEdit(false);
    }
  };

  const handleAssignAccountRole = async () => {
    if (!db || !selectedUserUid) return;
    const needsBranch = assignRole === 'admin' || assignRole === 'staff';
    if (needsBranch && !assignTenantId) {
      toast.error(tx('Select a branch for this role.', 'Pilih cabang untuk role ini.'));
      return;
    }
    try {
      await updateDoc(doc(db, 'users', selectedUserUid), {
        role: assignRole,
        tenantId: needsBranch ? assignTenantId : null,
      });
      await queryClient.invalidateQueries({ queryKey: ['staff-users'] });
      await queryClient.invalidateQueries({ queryKey: ['tenant_admin_staff'] });
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      const branchLabel =
        allTenants.find((t) => t.id === assignTenantId)?.name ??
        activeTenant?.name ??
        tx('Branch', 'Cabang');
      const roleSummary = needsBranch
        ? `${ROLE_LABELS[assignRole]} (${branchLabel})`
        : ROLE_LABELS[assignRole];
      toast.success(
        tx(`Account role updated to ${roleSummary}.`, `Role akun diperbarui menjadi ${roleSummary}.`)
      );
      setAssignRoleOpen(false);
      setSelectedUserUid('');
    } catch (error) {
      console.error('Assign role error:', error);
      toast.error(tx('Failed to update account role.', 'Gagal memperbarui role akun.'));
    }
  };

  const handleRevokeAccess = async (acc: UserProfile) => {
    if (!db) return;
    try {
      await updateDoc(doc(db, 'users', acc.uid), {
        role: 'user',
        tenantId: null,
      });
      await queryClient.invalidateQueries({ queryKey: ['staff-users'] });
      await queryClient.invalidateQueries({ queryKey: ['tenant_admin_staff'] });
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      setDetailAccountUid(null);
      toast.success(
        tx(
          `${ROLE_LABELS[acc.role]} access revoked from ${acc.displayName}.`,
          `Akses ${ROLE_LABELS[acc.role]} dicabut dari ${acc.displayName}.`
        )
      );
    } catch (error) {
      console.error('Revoke access error:', error);
      toast.error(tx('Failed to revoke access.', 'Gagal mencabut akses.'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            {tx('Staff & Admins', 'Staff & Admin')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {tx('Branch', 'Cabang')}{' '}
            <span className="font-medium text-foreground">
              {isAllTenants ? tx('All Branches', 'Semua Cabang') : activeTenant?.name}
            </span>{' '}
            —{' '}
            {tx(
              'manage Superadmin, Admin, and Staff accounts in one directory.',
              'kelola akun Superadmin, Admin, dan Staff dalam satu daftar.'
            )}
          </p>
        </div>
        {isSuperAdmin ? (
          <Button size="sm" onClick={openAssignRoleDialog}>
            <UserCog className="h-3.5 w-3.5" strokeWidth={1.5} />
            {tx('Assign Account Role', 'Atur Role Akun')}
          </Button>
        ) : null}
      </div>

      {/* Unified Search, Role Filter & Summary */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-64">
              <Search
                className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
                strokeWidth={1.5}
              />
              <Input
                placeholder={tx('Search name, email, phone, NIK...', 'Cari nama, email, HP, NIK...')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={roleFilter}
              onValueChange={(v) => setRoleFilter(v as TeamFilterRole)}
            >
              <SelectTrigger className="h-9 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {tx('All Roles', 'Semua Role')} ({unifiedTeam.length})
                </SelectItem>
                <SelectItem value="superadmin">Superadmin ({superadminCount})</SelectItem>
                <SelectItem value="admin">Admin ({adminCount})</SelectItem>
                <SelectItem value="staff">Staff ({staffCount})</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <span className="text-xs text-muted-foreground">
            {unifiedTeam.length} {tx('total', 'total')} · {superadminCount} Superadmin ·{' '}
            {adminCount} Admin · {staffCount} Staff
          </span>
        </div>

        {isLoadingTeam ? (
          <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
            {tx('Loading team directory...', 'Memuat daftar tim...')}
          </div>
        ) : filteredTeam.length === 0 ? (
          <EmptyState
            icon={Users}
            title={tx(
              `No matching accounts in ${isAllTenants ? 'all branches' : activeTenant?.name}`,
              `Tidak ada akun yang cocok di ${isAllTenants ? 'semua cabang' : activeTenant?.name}`
            )}
            description={tx(
              'Try clearing your search filter or assign an account role.',
              'Coba hapus filter pencarian atau atur role akun.'
            )}
            action={
              isSuperAdmin ? (
                <Button size="sm" onClick={openAssignRoleDialog}>
                  <UserCog className="h-3.5 w-3.5" strokeWidth={1.5} />
                  {tx('Assign Account Role', 'Atur Role Akun')}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tx('Account', 'Akun')}</TableHead>
                <TableHead>{tx('Role', 'Role')}</TableHead>
                <TableHead>{tx('Contact & NIK', 'Kontak & NIK')}</TableHead>
                <TableHead>{tx('Status', 'Status')}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTeam.map((row) => {
                if (row.kind === 'account') {
                  const acc = row.account;
                  const branchName =
                    acc.tenantId && tenantById[acc.tenantId]
                      ? tenantById[acc.tenantId].name
                      : null;

                  return (
                    <TableRow
                      key={row.key}
                      onClick={() => openAccountDetail(acc)}
                      className="group cursor-pointer"
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                              acc.role === 'superadmin'
                                ? 'bg-zinc-900 text-white'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {getInitials(acc.displayName)}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">
                              {acc.displayName}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {acc.email}
                              {isAllTenants && branchName ? ` · ${branchName}` : ''}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${
                            acc.role === 'superadmin'
                              ? 'bg-primary text-primary-foreground'
                              : acc.role === 'admin'
                                ? 'bg-secondary text-secondary-foreground'
                                : 'border border-zinc-200 bg-zinc-50 text-zinc-700'
                          }`}
                        >
                          {ROLE_LABELS[acc.role]}
                          {isAllTenants && branchName && acc.role !== 'superadmin'
                            ? ` · ${branchName}`
                            : ''}
                        </span>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        <div className="text-xs font-medium text-foreground">
                          {acc.phone || '—'}
                        </div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {acc.nik ? `NIK ${acc.nik}` : '—'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status="active" label={tx('Active', 'Aktif')} />
                      </TableCell>
                      <TableCell className="text-right">
                        <ChevronRight
                          className="ml-auto h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                          strokeWidth={1.5}
                        />
                      </TableCell>
                    </TableRow>
                  );
                }

                const staff = row.staff;
                const staffBranch = tenantById[staff.tenantId]?.name;
                return (
                  <TableRow
                    key={row.key}
                    onClick={() => openStaffDetail(staff)}
                    className="group cursor-pointer"
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                          {getInitials(staff.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{staff.name}</p>
                          {staff.email || (isAllTenants && staffBranch) ? (
                            <p className="truncate text-xs text-muted-foreground">
                              {[staff.email, isAllTenants ? staffBranch : undefined]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-medium text-zinc-700">
                        Staff
                      </span>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      <div className="text-xs font-medium text-foreground">{staff.phone}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {staff.vehicleInfo || '—'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={staff.isActive ? 'active' : 'suspended'}
                        label={staff.isActive ? tx('Active', 'Aktif') : tx('Inactive', 'Nonaktif')}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <ChevronRight
                        className="ml-auto h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                        strokeWidth={1.5}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Assign Account Role Dialog (4 Roles: User, Staff, Admin, Superadmin) */}
      <Dialog
        open={assignRoleOpen}
        onOpenChange={(open) => {
          setAssignRoleOpen(open);
          if (!open) setAccountPickerOpen(false);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tx('Assign Account Role', 'Atur Role Akun')}</DialogTitle>
            <DialogDescription>
              {tx(
                'Choose a registered account and assign one of 4 roles: User, Staff, Admin, or Superadmin.',
                'Pilih akun terdaftar dan tetapkan salah satu dari 4 role: User, Staff, Admin, atau Superadmin.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{tx('Registered Account', 'Akun Terdaftar')}</Label>
              <button
                type="button"
                onClick={() => setAccountPickerOpen((prev) => !prev)}
                className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-xs shadow-sm transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <span
                  className={
                    selectedAssignableUser
                      ? 'truncate font-medium text-foreground'
                      : 'truncate text-muted-foreground'
                  }
                >
                  {selectedAssignableUser
                    ? `${selectedAssignableUser.displayName} (${selectedAssignableUser.email})`
                    : tx('Select registered account...', 'Pilih akun terdaftar...')}
                </span>
                <ChevronsUpDown
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  strokeWidth={1.5}
                />
              </button>

              {accountPickerOpen ? (
                <div className="space-y-2.5 rounded-md border bg-popover p-2.5 shadow-md">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search
                        className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground"
                        strokeWidth={1.5}
                      />
                      <Input
                        placeholder={tx('Search name, email, or NIK...', 'Cari nama, email, atau NIK...')}
                        value={accountSearch}
                        onChange={(e) => {
                          setAccountSearch(e.target.value);
                          setAccountPage(1);
                        }}
                        className="h-8 pl-8 text-xs"
                      />
                    </div>
                    <Select
                      value={accountRoleFilter}
                      onValueChange={(v) => {
                        setAccountRoleFilter(v as 'all' | UserRole);
                        setAccountPage(1);
                      }}
                    >
                      <SelectTrigger className="h-8 w-28 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{tx('All', 'Semua')}</SelectItem>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="staff">Staff</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="superadmin">Superadmin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {paginatedAssignableUsers.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">
                      {tx('No matching accounts.', 'Tidak ada akun yang cocok.')}
                    </p>
                  ) : (
                    <div className="divide-y divide-border rounded-md border">
                      {paginatedAssignableUsers.map((u) => {
                        const isSelected = u.uid === selectedUserUid;
                        return (
                          <button
                            key={u.uid}
                            type="button"
                            onClick={() => {
                              setSelectedUserUid(u.uid);
                              setAssignRole(u.role === 'user' ? 'staff' : u.role);
                              setAssignTenantId(u.tenantId || fallbackTenantId);
                              setAccountPickerOpen(false);
                            }}
                            className={`flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-xs transition-colors hover:bg-muted/60 ${
                              isSelected ? 'bg-muted/50' : ''
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium text-foreground">
                                {u.displayName}
                              </p>
                              <p className="truncate text-[11px] text-muted-foreground">
                                {u.email}
                                {u.nik ? ` · ${u.nik}` : ''}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
                                {ROLE_LABELS[u.role]}
                              </span>
                              {isSelected ? (
                                <Check className="h-3.5 w-3.5 text-foreground" strokeWidth={2} />
                              ) : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-0.5 text-[11px] text-muted-foreground">
                    <span className="tabular-nums">
                      {filteredAssignableUsers.length === 0
                        ? tx('0 accounts', '0 akun')
                        : `${(safeAccountPage - 1) * ACCOUNT_PAGE_SIZE + 1}–${Math.min(
                            safeAccountPage * ACCOUNT_PAGE_SIZE,
                            filteredAssignableUsers.length
                          )} ${tx('of', 'dari')} ${filteredAssignableUsers.length}`}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="mr-1 tabular-nums">
                        {safeAccountPage}/{totalAccountPages}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 px-1.5 text-[11px]"
                        disabled={safeAccountPage <= 1}
                        onClick={() => setAccountPage((p) => Math.max(1, p - 1))}
                      >
                        <ChevronLeft className="h-3 w-3" strokeWidth={1.5} />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 px-1.5 text-[11px]"
                        disabled={safeAccountPage >= totalAccountPages}
                        onClick={() => setAccountPage((p) => Math.min(totalAccountPages, p + 1))}
                      >
                        <ChevronRight className="h-3 w-3" strokeWidth={1.5} />
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label>{tx('Role', 'Role')}</Label>
              <Select value={assignRole} onValueChange={(v) => setAssignRole(v as UserRole)}>
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

            {assignRole === 'admin' || assignRole === 'staff' ? (
              <div className="space-y-1.5">
                <Label>{tx('Assigned Branch', 'Cabang Ditugaskan')}</Label>
                <Select value={assignTenantId} onValueChange={setAssignTenantId}>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignRoleOpen(false)}>
              {tx('Cancel', 'Batal')}
            </Button>
            <Button disabled={!selectedUserUid} onClick={() => void handleAssignAccountRole()}>
              {tx('Save Role', 'Simpan Role')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Legacy tenant_staff Detail & Edit Dialog */}
      <Dialog open={Boolean(detailStaff)} onOpenChange={(o) => !o && setDetailStaffId(null)}>
        <DialogContent className="max-w-md gap-5">
          {detailStaff ? (
            <>
              <DialogHeader>
                <div className="flex items-start gap-3 pr-6">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-foreground">
                    {getInitials(detailStaff.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="truncate">{detailStaff.name}</DialogTitle>
                    <DialogDescription className="mt-1">
                      Staff ·{' '}
                      {tenantById[detailStaff.tenantId]?.name ??
                        activeTenant?.name ??
                        tx('Branch', 'Cabang')}
                    </DialogDescription>
                    <div className="mt-2">
                      <StatusBadge
                        status={detailStaff.isActive ? 'active' : 'suspended'}
                        label={
                          detailStaff.isActive ? tx('Active', 'Aktif') : tx('Inactive', 'Nonaktif')
                        }
                      />
                    </div>
                  </div>
                </div>
              </DialogHeader>

              <Tabs
                value={staffModalTab}
                onValueChange={(v) => setStaffModalTab(v as 'detail' | 'edit')}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="detail">{tx('Details', 'Detail')}</TabsTrigger>
                  <TabsTrigger value="edit">{tx('Edit', 'Edit')}</TabsTrigger>
                </TabsList>

                <TabsContent value="detail" className="mt-4 space-y-5">
                  <dl className="divide-y divide-border text-sm">
                    {detailStaff.email ? (
                      <div className="flex items-center justify-between gap-4 py-2.5">
                        <dt className="shrink-0 text-muted-foreground">Email</dt>
                        <dd className="truncate font-mono text-xs text-foreground">
                          {detailStaff.email}
                        </dd>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between py-2.5">
                      <dt className="text-muted-foreground">
                        {tx('WhatsApp / Phone', 'WhatsApp / HP')}
                      </dt>
                      <dd className="tabular-nums font-medium text-foreground">
                        {detailStaff.phone}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between py-2.5">
                      <dt className="text-muted-foreground">{tx('Vehicle / Notes', 'Kendaraan / Catatan')}</dt>
                      <dd className="text-foreground">{detailStaff.vehicleInfo || '—'}</dd>
                    </div>
                    <div className="flex items-center justify-between py-2.5">
                      <dt className="text-muted-foreground">{tx('Added', 'Ditambahkan')}</dt>
                      <dd className="tabular-nums text-xs text-muted-foreground">
                        {formatDateTime(detailStaff.createdAt)}
                      </dd>
                    </div>
                  </dl>

                  <div className="space-y-3 border-t pt-4">
                    <WhatsAppButton
                      phone={detailStaff.phone}
                      message={tx(
                        `Hello ${detailStaff.name}, operational coordination from ${tenantById[detailStaff.tenantId]?.name ?? activeTenant?.name ?? 'Branch'}.`,
                        `Halo ${detailStaff.name}, koordinasi operasional dari ${tenantById[detailStaff.tenantId]?.name ?? activeTenant?.name ?? 'Cabang'}.`
                      )}
                      className="w-full"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleToggleStaffActive(detailStaff)}
                      >
                        {detailStaff.isActive
                          ? tx('Deactivate', 'Nonaktifkan')
                          : tx('Activate', 'Aktifkan')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => void handleDeleteStaff(detailStaff)}
                      >
                        {tx('Delete', 'Hapus')}
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="edit" className="mt-4">
                  <form onSubmit={handleSaveStaffEdit} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="staff-edit-name">{tx('Full Name', 'Nama Lengkap')}</Label>
                      <Input
                        id="staff-edit-name"
                        value={editStaffForm.name}
                        onChange={(e) =>
                          setEditStaffForm((prev) => ({ ...prev, name: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="staff-edit-phone">
                        {tx('WhatsApp / Phone', 'WhatsApp / HP')}
                      </Label>
                      <Input
                        id="staff-edit-phone"
                        value={editStaffForm.phone}
                        onChange={(e) =>
                          setEditStaffForm((prev) => ({ ...prev, phone: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="staff-edit-vehicle">
                        {tx('Vehicle & Plate (Optional)', 'Kendaraan & Plat Nomor (Opsional)')}
                      </Label>
                      <Input
                        id="staff-edit-vehicle"
                        value={editStaffForm.vehicleInfo}
                        onChange={(e) =>
                          setEditStaffForm((prev) => ({ ...prev, vehicleInfo: e.target.value }))
                        }
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setStaffModalTab('detail')}
                      >
                        {tx('Cancel', 'Batal')}
                      </Button>
                      <Button type="submit" size="sm" disabled={savingStaffEdit}>
                        {savingStaffEdit
                          ? tx('Saving...', 'Menyimpan...')
                          : tx('Save Changes', 'Simpan Perubahan')}
                      </Button>
                    </div>
                  </form>
                </TabsContent>
              </Tabs>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Account Detail & Edit Dialog (Superadmin / Admin / Staff) */}
      <Dialog open={Boolean(detailAccount)} onOpenChange={(o) => !o && setDetailAccountUid(null)}>
        <DialogContent className="max-w-md gap-5">
          {detailAccount ? (
            <>
              <DialogHeader>
                <div className="flex items-start gap-3 pr-6">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-foreground">
                    {getInitials(detailAccount.displayName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="truncate">{detailAccount.displayName}</DialogTitle>
                    <DialogDescription className="mt-1 truncate">
                      {detailAccount.email}
                    </DialogDescription>
                    <div className="mt-2">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                          detailAccount.role === 'superadmin'
                            ? 'bg-primary text-primary-foreground'
                            : detailAccount.role === 'admin'
                              ? 'bg-secondary text-secondary-foreground'
                              : 'border border-zinc-200 bg-zinc-50 text-zinc-700'
                        }`}
                      >
                        {ROLE_LABELS[detailAccount.role]}
                      </span>
                    </div>
                  </div>
                </div>
              </DialogHeader>

              <Tabs
                value={accountModalTab}
                onValueChange={(v) => setAccountModalTab(v as 'detail' | 'edit')}
              >
                <TabsList
                  className={`grid w-full ${canEditAccount(detailAccount) ? 'grid-cols-2' : 'grid-cols-1'}`}
                >
                  <TabsTrigger value="detail">{tx('Details', 'Detail')}</TabsTrigger>
                  {canEditAccount(detailAccount) ? (
                    <TabsTrigger value="edit">{tx('Edit Profile', 'Edit Profil')}</TabsTrigger>
                  ) : null}
                </TabsList>

                <TabsContent value="detail" className="mt-4 space-y-5">
                  <dl className="divide-y divide-border text-sm">
                    <div className="flex items-center justify-between py-2.5">
                      <dt className="text-muted-foreground">{tx('Branch', 'Cabang')}</dt>
                      <dd className="font-medium text-foreground">
                        {detailAccount.role === 'superadmin'
                          ? tx('All Branches (Global)', 'Semua Cabang (Global)')
                          : allTenants.find((t) => t.id === detailAccount.tenantId)?.name ??
                            activeTenant?.name ??
                            '—'}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between py-2.5">
                      <dt className="text-muted-foreground">
                        {tx('WhatsApp / Phone', 'WhatsApp / HP')}
                      </dt>
                      <dd className="tabular-nums font-medium text-foreground">
                        {detailAccount.phone || '—'}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between py-2.5">
                      <dt className="text-muted-foreground">NIK</dt>
                      <dd className="font-mono text-xs font-medium text-foreground">
                        {detailAccount.nik || '—'}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-4 py-2.5">
                      <dt className="shrink-0 text-muted-foreground">UID</dt>
                      <dd className="truncate font-mono text-xs text-muted-foreground">
                        {detailAccount.uid}
                      </dd>
                    </div>
                  </dl>

                  {detailAccount.phone ||
                  (isSuperAdmin && detailAccount.role !== 'superadmin') ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
                      <WhatsAppButton
                        phone={detailAccount.phone}
                        message={tx(
                          `Hello ${detailAccount.displayName}, CameraRent coordination.`,
                          `Halo ${detailAccount.displayName}, koordinasi CameraRent.`
                        )}
                        className={
                          isSuperAdmin && detailAccount.role !== 'superadmin'
                            ? undefined
                            : 'w-full'
                        }
                      />
                      {isSuperAdmin && detailAccount.role !== 'superadmin' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => void handleRevokeAccess(detailAccount)}
                        >
                          {tx('Revoke Access', 'Cabut Akses')}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </TabsContent>

                {canEditAccount(detailAccount) ? (
                  <TabsContent value="edit" className="mt-4">
                    <form onSubmit={handleSaveAccountEdit} className="space-y-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="acc-edit-name">{tx('Full Name', 'Nama Lengkap')}</Label>
                        <Input
                          id="acc-edit-name"
                          value={accountEditForm.displayName}
                          onChange={(e) =>
                            setAccountEditForm((prev) => ({
                              ...prev,
                              displayName: e.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="acc-edit-phone">
                            {tx('WhatsApp / Phone', 'WhatsApp / HP')}
                          </Label>
                          <Input
                            id="acc-edit-phone"
                            value={accountEditForm.phone}
                            onChange={(e) =>
                              setAccountEditForm((prev) => ({ ...prev, phone: e.target.value }))
                            }
                            placeholder="0812xxxxxxxx"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="acc-edit-nik">
                            {tx('National ID / NIK (16 Digits)', 'NIK (16 Digit)')}
                          </Label>
                          <Input
                            id="acc-edit-nik"
                            className="font-mono text-xs"
                            maxLength={16}
                            value={accountEditForm.nik}
                            onChange={(e) =>
                              setAccountEditForm((prev) => ({
                                ...prev,
                                nik: e.target.value.replace(/\D/g, '').slice(0, 16),
                              }))
                            }
                            placeholder="3174xxxxxxxxxxxx"
                          />
                        </div>
                      </div>

                      {isSuperAdmin ? (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label>{tx('Role', 'Role')}</Label>
                            <Select
                              value={accountEditForm.role}
                              disabled={detailAccount.uid === userProfile?.uid}
                              onValueChange={(v) =>
                                setAccountEditForm((prev) => ({ ...prev, role: v as UserRole }))
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

                          {accountEditForm.role === 'admin' || accountEditForm.role === 'staff' ? (
                            <div className="space-y-1.5">
                              <Label>{tx('Assigned Branch', 'Cabang Ditugaskan')}</Label>
                              <Select
                                value={accountEditForm.tenantId}
                                onValueChange={(v) =>
                                  setAccountEditForm((prev) => ({ ...prev, tenantId: v }))
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
                      ) : null}

                      <div className="flex justify-end gap-2 pt-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setAccountModalTab('detail')}
                        >
                          {tx('Cancel', 'Batal')}
                        </Button>
                        <Button type="submit" size="sm" disabled={savingAccountEdit}>
                          {savingAccountEdit
                            ? tx('Saving...', 'Menyimpan...')
                            : tx('Save Changes', 'Simpan Perubahan')}
                        </Button>
                      </div>
                    </form>
                  </TabsContent>
                ) : null}
              </Tabs>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
