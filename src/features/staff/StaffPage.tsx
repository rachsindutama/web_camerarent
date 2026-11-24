import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  Timestamp,
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
import type { StaffRole, TenantStaff, UserProfile, UserRole } from '@/types/schema';

type UnifiedAccountRole = UserRole | StaffRole;

function isOperationalStaffRole(role: string): role is StaffRole {
  return role === 'courier' || role === 'technician' || role === 'admin_ops';
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || 'S';
}

export function StaffPage() {
  const { tx } = useI18n();
  const queryClient = useQueryClient();
  const staffRoleLabels: Record<StaffRole, string> = {
    courier: tx('Delivery Courier', 'Kurir Antar-Jemput'),
    technician: tx('Gear Technician / QC', 'Teknisi / QC Gear'),
    admin_ops: tx('Operations Admin', 'Admin Operasional'),
  };
  const { userProfile } = useAuth();
  const { activeTenantId, activeTenant, allTenants, isAllTenants, tenantById } = useTenant();
  const isSuperAdmin = userProfile?.role === 'superadmin';

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<
    'all' | 'superadmin' | 'admin' | StaffRole
  >('all');

  // Operational Staff Detail & Edit Dialog
  const [detailStaffId, setDetailStaffId] = useState<string | null>(null);
  const [staffModalTab, setStaffModalTab] = useState<'detail' | 'edit'>('detail');
  const [savingStaffEdit, setSavingStaffEdit] = useState(false);
  const [editStaffForm, setEditStaffForm] = useState({
    name: '',
    phone: '',
    role: 'courier' as StaffRole,
    vehicleInfo: '',
  });

  // Assign RBAC Role Dialog (Superadmin) + Searchable Paginated Account Picker
  const [assignAdminOpen, setAssignAdminOpen] = useState(false);
  const [selectedUserUid, setSelectedUserUid] = useState('');
  const [assignRole, setAssignRole] = useState<UnifiedAccountRole>('admin');
  const [assignTenantId, setAssignTenantId] = useState('');
  const [assignVehicleInfo, setAssignVehicleInfo] = useState('');
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [accountSearch, setAccountSearch] = useState('');
  const [accountRoleFilter, setAccountRoleFilter] = useState<'all' | UserRole>('all');
  const [accountPage, setAccountPage] = useState(1);
  const ACCOUNT_PAGE_SIZE = 5;

  // Admin / Superadmin Detail & Edit Dialog
  const [detailAdminUid, setDetailAdminUid] = useState<string | null>(null);
  const [adminModalTab, setAdminModalTab] = useState<'detail' | 'edit'>('detail');
  const [savingAdminEdit, setSavingAdminEdit] = useState(false);
  const [adminEditForm, setAdminEditForm] = useState({
    displayName: '',
    phone: '',
    nik: '',
    role: 'admin' as UnifiedAccountRole,
    tenantId: '',
    vehicleInfo: '',
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

  const { data: allUsers = [], isLoading: loadingAdmins } = useQuery<UserProfile[]>({
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
          'Select a rental branch in the topbar first to manage staff and branch admins.',
          'Pilih cabang rental di bagian atas terlebih dahulu untuk mengelola karyawan dan admin.'
        )}
      />
    );
  }

  const branchAdmins = allUsers.filter(
    (u) =>
      u.role === 'superadmin' ||
      (u.role === 'admin' && (isAllTenants || u.tenantId === activeTenantId))
  );
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
  const detailAdmin = allUsers.find((u) => u.uid === detailAdminUid) ?? null;

  // Map linked operational staff records by userId so one account never duplicates in the table
  const linkedStaffByUid = branchStaff.reduce<Record<string, TenantStaff>>((acc, s) => {
    if (s.userId) acc[s.userId] = s;
    return acc;
  }, {});
  const detailAdminLinkedStaff = detailAdmin ? linkedStaffByUid[detailAdmin.uid] ?? null : null;

  const fallbackTenantId = activeTenantId ?? allTenants[0]?.id ?? '';

  const canEditAdminAccount = (admin: UserProfile) =>
    isSuperAdmin || admin.uid === userProfile?.uid;

  const openAssignRoleDialog = () => {
    setSelectedUserUid('');
    setAssignRole('admin');
    setAssignTenantId(fallbackTenantId);
    setAssignVehicleInfo('');
    setAccountPickerOpen(false);
    setAccountSearch('');
    setAccountRoleFilter('all');
    setAccountPage(1);
    setAssignAdminOpen(true);
  };

  const openStaffDetail = (staff: TenantStaff) => {
    setDetailStaffId(staff.id);
    setStaffModalTab('detail');
    setEditStaffForm({
      name: staff.name,
      phone: staff.phone,
      role: staff.role,
      vehicleInfo: staff.vehicleInfo ?? '',
    });
  };

  const openAdminDetail = (admin: UserProfile) => {
    const linked = linkedStaffByUid[admin.uid] ?? null;
    setDetailAdminUid(admin.uid);
    setAdminModalTab('detail');
    setAdminEditForm({
      displayName: admin.displayName,
      phone: admin.phone || '',
      nik: admin.nik || '',
      role: linked ? linked.role : admin.role,
      tenantId: admin.tenantId || linked?.tenantId || fallbackTenantId,
      vehicleInfo: linked?.vehicleInfo ?? '',
    });
  };

  const getEffectiveRoleLabel = (role: UnifiedAccountRole, tenantId?: string | null): string => {
    if (role === 'superadmin') return 'Superadmin';
    if (role === 'admin') {
      return isAllTenants && tenantId && tenantById[tenantId]
        ? `Admin · ${tenantById[tenantId].name}`
        : 'Branch Admin';
    }
    if (isOperationalStaffRole(role)) return staffRoleLabels[role];
    return 'Member';
  };

  const syncLinkedStaffRecord = async (params: {
    uid: string;
    name: string;
    email: string;
    phone: string;
    nextRole: UnifiedAccountRole;
    tenantId: string;
    vehicleInfo?: string;
  }) => {
    if (!db) return;
    const existingSnap = await getDocs(
      query(collection(db, 'tenant_staff'), where('userId', '==', params.uid))
    );

    if (isOperationalStaffRole(params.nextRole)) {
      const targetDocRef =
        existingSnap.docs[0]?.ref ?? doc(db, 'tenant_staff', `user_${params.uid}`);
      const existingData = existingSnap.docs[0]?.data() as Partial<TenantStaff> | undefined;
      await setDoc(
        targetDocRef,
        {
          tenantId: params.tenantId,
          userId: params.uid,
          name: params.name,
          email: params.email,
          phone: params.phone,
          role: params.nextRole,
          vehicleInfo: (params.vehicleInfo ?? '').trim(),
          isActive: existingData?.isActive ?? true,
          createdAt: existingData?.createdAt ?? Timestamp.now(),
        },
        { merge: true }
      );
      // Clean up any accidental extra duplicates
      for (const extraDoc of existingSnap.docs.slice(1)) {
        await deleteDoc(extraDoc.ref);
      }
    } else {
      for (const linkedDoc of existingSnap.docs) {
        await deleteDoc(linkedDoc.ref);
      }
    }
  };

  type UnifiedTeamRow =
    | {
        kind: 'admin';
        key: string;
        sortRank: number;
        name: string;
        admin: UserProfile;
        linkedStaff: TenantStaff | null;
      }
    | { kind: 'staff'; key: string; sortRank: number; name: string; staff: TenantStaff };

  const adminUidSet = new Set(branchAdmins.map((a) => a.uid));
  const standaloneStaff = branchStaff.filter((s) => !s.userId || !adminUidSet.has(s.userId));

  const unifiedTeam: UnifiedTeamRow[] = [
    ...branchAdmins.map((admin) => {
      const linkedStaff = linkedStaffByUid[admin.uid] ?? null;
      return {
        kind: 'admin' as const,
        key: `admin-${admin.uid}`,
        sortRank: admin.role === 'superadmin' ? 0 : linkedStaff ? 2 : 1,
        name: admin.displayName,
        admin,
        linkedStaff,
      };
    }),
    ...standaloneStaff.map((staff) => ({
      kind: 'staff' as const,
      key: `staff-${staff.id}`,
      sortRank: 2,
      name: staff.name,
      staff,
    })),
  ].sort((a, b) => a.sortRank - b.sortRank || a.name.localeCompare(b.name));

  const operationalCount =
    standaloneStaff.length +
    branchAdmins.filter((a) => Boolean(linkedStaffByUid[a.uid])).length;
  const pureAdminCount = branchAdmins.length - branchAdmins.filter((a) => Boolean(linkedStaffByUid[a.uid])).length;

  const filteredTeam = unifiedTeam.filter((row) => {
    const q = search.trim().toLowerCase();
    if (row.kind === 'admin') {
      const a = row.admin;
      const effectiveRole: UnifiedAccountRole = row.linkedStaff ? row.linkedStaff.role : a.role;
      if (roleFilter !== 'all' && roleFilter !== effectiveRole) return false;
      if (!q) return true;
      return (
        a.displayName.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        (a.phone ?? '').toLowerCase().includes(q) ||
        (a.nik ?? '').toLowerCase().includes(q) ||
        (row.linkedStaff?.vehicleInfo ?? '').toLowerCase().includes(q)
      );
    }
    const s = row.staff;
    if (roleFilter !== 'all' && roleFilter !== s.role) return false;
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      (s.email ?? '').toLowerCase().includes(q) ||
      s.phone.toLowerCase().includes(q) ||
      (s.vehicleInfo ?? '').toLowerCase().includes(q)
    );
  });

  const isLoadingTeam = loadingStaff || loadingAdmins;

  const handleSaveStaffEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !detailStaff) return;
    if (!editStaffForm.name.trim() || !editStaffForm.phone.trim()) {
      toast.error(
        tx(
          'Staff name and WhatsApp / phone number are required.',
          'Nama dan nomor HP/WhatsApp karyawan wajib diisi.'
        )
      );
      return;
    }

    setSavingStaffEdit(true);
    try {
      await updateDoc(doc(db, 'tenant_staff', detailStaff.id), {
        name: editStaffForm.name.trim(),
        phone: editStaffForm.phone.trim(),
        role: editStaffForm.role,
        vehicleInfo: editStaffForm.vehicleInfo.trim(),
      });
      await queryClient.invalidateQueries({ queryKey: ['tenant_staff'] });
      toast.success(
        tx(`${editStaffForm.name.trim()}'s record saved.`, `Data ${editStaffForm.name.trim()} disimpan.`)
      );
      setStaffModalTab('detail');
    } catch (error) {
      console.error('Update staff error:', error);
      toast.error(
        tx('Failed to save staff changes.', 'Gagal menyimpan perubahan data karyawan.')
      );
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
    toast.success(tx(`Staff ${staff.name} deleted.`, `Karyawan ${staff.name} dihapus.`));
  };

  const handleSaveAdminEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !detailAdmin || !canEditAdminAccount(detailAdmin)) return;

    const cleanName = adminEditForm.displayName.trim();
    const cleanPhone = adminEditForm.phone.trim();
    const cleanNik = adminEditForm.nik.replace(/\D/g, '');

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

    const needsBranch =
      adminEditForm.role === 'admin' || isOperationalStaffRole(adminEditForm.role);
    if (isSuperAdmin && needsBranch && !adminEditForm.tenantId) {
      toast.error(
        tx('Select a branch for this staff/admin role.', 'Pilih cabang untuk role staff/admin ini.')
      );
      return;
    }

    setSavingAdminEdit(true);
    try {
      const isSelf = detailAdmin.uid === userProfile?.uid;
      const nextUnifiedRole: UnifiedAccountRole = isSelf
        ? detailAdminLinkedStaff
          ? detailAdminLinkedStaff.role
          : detailAdmin.role
        : adminEditForm.role;
      const nextUserRole: UserRole = isOperationalStaffRole(nextUnifiedRole)
        ? 'admin'
        : nextUnifiedRole;
      const targetTenantId =
        nextUserRole === 'admin' ? adminEditForm.tenantId || fallbackTenantId : null;

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
        payload.role = nextUserRole;
        payload.tenantId = targetTenantId;
      }

      await updateDoc(doc(db, 'users', detailAdmin.uid), payload);

      if (isSuperAdmin) {
        await syncLinkedStaffRecord({
          uid: detailAdmin.uid,
          name: cleanName,
          email: detailAdmin.email,
          phone: cleanPhone,
          nextRole: nextUnifiedRole,
          tenantId: targetTenantId ?? fallbackTenantId,
          vehicleInfo: adminEditForm.vehicleInfo,
        });
      }

      await queryClient.invalidateQueries({ queryKey: ['staff-users'] });
      await queryClient.invalidateQueries({ queryKey: ['tenant_staff'] });
      await queryClient.invalidateQueries({ queryKey: ['tenant_admin_staff'] });
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      toast.success(tx(`${cleanName}'s profile saved.`, `Profil ${cleanName} disimpan.`));
      if (payload.role === 'user') {
        setDetailAdminUid(null);
      } else {
        setAdminModalTab('detail');
      }
    } catch (error) {
      console.error('Update admin profile error:', error);
      toast.error(
        tx('Failed to save account profile changes.', 'Gagal menyimpan perubahan profil akun.')
      );
    } finally {
      setSavingAdminEdit(false);
    }
  };

  const handleAssignAccountRole = async () => {
    if (!db || !selectedUserUid) return;
    const targetUser = assignableUsers.find((u) => u.uid === selectedUserUid);
    if (!targetUser) return;

    const needsBranch = assignRole === 'admin' || isOperationalStaffRole(assignRole);
    if (needsBranch && !assignTenantId) {
      toast.error(
        tx('Select a branch for this staff/admin role.', 'Pilih cabang untuk role staff/admin ini.')
      );
      return;
    }

    const nextUserRole: UserRole = isOperationalStaffRole(assignRole) ? 'admin' : assignRole;
    const targetTenantId = needsBranch ? assignTenantId : null;

    try {
      await updateDoc(doc(db, 'users', selectedUserUid), {
        role: nextUserRole,
        tenantId: targetTenantId,
      });

      await syncLinkedStaffRecord({
        uid: selectedUserUid,
        name: targetUser.displayName,
        email: targetUser.email,
        phone: targetUser.phone || '',
        nextRole: assignRole,
        tenantId: targetTenantId ?? fallbackTenantId,
        vehicleInfo: assignVehicleInfo,
      });

      await queryClient.invalidateQueries({ queryKey: ['staff-users'] });
      await queryClient.invalidateQueries({ queryKey: ['tenant_staff'] });
      await queryClient.invalidateQueries({ queryKey: ['tenant_admin_staff'] });
      await queryClient.invalidateQueries({ queryKey: ['members'] });

      const branchLabel =
        allTenants.find((t) => t.id === assignTenantId)?.name ??
        activeTenant?.name ??
        tx('Branch', 'Cabang');
      const roleLabel =
        assignRole === 'superadmin'
          ? 'Superadmin'
          : assignRole === 'admin'
            ? `Branch Admin (${branchLabel})`
            : isOperationalStaffRole(assignRole)
              ? `${staffRoleLabels[assignRole]} (${branchLabel})`
              : 'Member (User)';

      toast.success(
        tx(`Account role updated to ${roleLabel}.`, `Role akun diperbarui menjadi ${roleLabel}.`)
      );
      setAssignAdminOpen(false);
      setSelectedUserUid('');
      setAssignVehicleInfo('');
    } catch (error) {
      console.error('Assign role error:', error);
      toast.error(tx('Failed to update account role.', 'Gagal memperbarui role akun.'));
    }
  };

  const handleRevokeBranchAdmin = async (adminUser: UserProfile) => {
    if (!db) return;
    try {
      await updateDoc(doc(db, 'users', adminUser.uid), {
        role: 'user',
        tenantId: null,
      });
      await syncLinkedStaffRecord({
        uid: adminUser.uid,
        name: adminUser.displayName,
        email: adminUser.email,
        phone: adminUser.phone || '',
        nextRole: 'user',
        tenantId: fallbackTenantId,
      });
      await queryClient.invalidateQueries({ queryKey: ['staff-users'] });
      await queryClient.invalidateQueries({ queryKey: ['tenant_staff'] });
      await queryClient.invalidateQueries({ queryKey: ['tenant_admin_staff'] });
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      setDetailAdminUid(null);
      toast.success(
        tx(
          `Branch staff/admin access revoked from ${adminUser.displayName}.`,
          `Akses staff/admin cabang dicabut dari ${adminUser.displayName}.`
        )
      );
    } catch (error) {
      console.error('Revoke branch admin error:', error);
      toast.error(tx('Failed to revoke access.', 'Gagal mencabut akses.'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            {tx('Staff & Employees', 'Staff & Karyawan')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {tx('Branch', 'Cabang')}{' '}
            <span className="font-medium text-foreground">
              {isAllTenants ? tx('All Branches', 'Semua Cabang') : activeTenant?.name}
            </span>{' '}
            —{' '}
            {tx(
              'manage delivery couriers, QC technicians, and branch admin accounts.',
              'kelola kurir antar-jemput, teknisi QC, dan akun admin cabang.'
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
                placeholder={tx(
                  'Search name, email, phone, NIK, plate...',
                  'Cari nama, email, HP, NIK, plat...'
                )}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={roleFilter}
              onValueChange={(v) => setRoleFilter(v as typeof roleFilter)}
            >
              <SelectTrigger className="h-9 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {tx('All Roles', 'Semua Role')} ({unifiedTeam.length})
                </SelectItem>
                <SelectItem value="superadmin">Superadmin</SelectItem>
                <SelectItem value="admin">Branch Admin</SelectItem>
                <SelectItem value="courier">{staffRoleLabels.courier}</SelectItem>
                <SelectItem value="technician">{staffRoleLabels.technician}</SelectItem>
                <SelectItem value="admin_ops">{staffRoleLabels.admin_ops}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <span className="text-xs text-muted-foreground">
            {unifiedTeam.length} {tx('total', 'total')} · {pureAdminCount}{' '}
            {tx('admins', 'admin')} · {operationalCount} {tx('operational', 'operasional')}
          </span>
        </div>

        {isLoadingTeam ? (
          <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
            {tx('Loading team directory...', 'Memuat daftar tim & karyawan...')}
          </div>
        ) : filteredTeam.length === 0 ? (
          <EmptyState
            icon={Users}
            title={tx(
              `No matching team members in ${isAllTenants ? 'all branches' : activeTenant?.name}`,
              `Tidak ada anggota tim yang cocok di ${isAllTenants ? 'semua cabang' : activeTenant?.name}`
            )}
            description={tx(
              'Try clearing your search filter or assign a branch admin / operational staff account.',
              'Coba hapus filter pencarian atau atur role akun admin / karyawan operasional.'
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
                <TableHead>{tx('Account / Employee', 'Akun / Karyawan')}</TableHead>
                <TableHead>{tx('Role', 'Role / Jabatan')}</TableHead>
                <TableHead>{tx('Contact & Details', 'Kontak & Detail')}</TableHead>
                <TableHead>{tx('Status', 'Status')}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTeam.map((row) => {
                if (row.kind === 'admin') {
                  const admin = row.admin;
                  const linked = row.linkedStaff;
                  const effectiveRole: UnifiedAccountRole = linked ? linked.role : admin.role;
                  const branchName =
                    admin.tenantId && tenantById[admin.tenantId]
                      ? tenantById[admin.tenantId].name
                      : null;

                  return (
                    <TableRow
                      key={row.key}
                      onClick={() => openAdminDetail(admin)}
                      className="group cursor-pointer"
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                              linked
                                ? 'bg-muted text-muted-foreground'
                                : 'bg-zinc-900 text-white'
                            }`}
                          >
                            {getInitials(admin.displayName)}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">
                              {admin.displayName}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {admin.email}
                              {isAllTenants && branchName ? ` · ${branchName}` : ''}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${
                            effectiveRole === 'superadmin'
                              ? 'bg-primary text-primary-foreground'
                              : isOperationalStaffRole(effectiveRole)
                                ? 'border border-zinc-200 bg-zinc-50 text-zinc-700'
                                : 'bg-secondary text-secondary-foreground'
                          }`}
                        >
                          {getEffectiveRoleLabel(effectiveRole, admin.tenantId)}
                        </span>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        <div className="text-xs font-medium text-foreground">
                          {admin.phone || '—'}
                        </div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {linked?.vehicleInfo
                            ? linked.vehicleInfo
                            : admin.nik
                              ? `NIK ${admin.nik}`
                              : '—'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={linked && !linked.isActive ? 'suspended' : 'active'}
                          label={
                            linked && !linked.isActive
                              ? tx('Inactive', 'Nonaktif')
                              : tx('Active', 'Aktif')
                          }
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
                        {staffRoleLabels[staff.role]}
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

      {/* Assign RBAC Role & Branch Dialog */}
      <Dialog
        open={assignAdminOpen}
        onOpenChange={(open) => {
          setAssignAdminOpen(open);
          if (!open) setAccountPickerOpen(false);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tx('Assign Account Role & Access', 'Atur Role & Akses Akun')}</DialogTitle>
            <DialogDescription>
              {tx(
                'Assign a registered account as Member, Branch Admin, or Superadmin.',
                'Tetapkan role login akun terdaftar sebagai Member, Branch Admin, atau Superadmin.'
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
                <div className="rounded-md border bg-popover p-2.5 shadow-md space-y-2.5">
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
                      <SelectTrigger className="h-8 w-24 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{tx('All', 'Semua')}</SelectItem>
                        <SelectItem value="user">User</SelectItem>
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
                              const linked = linkedStaffByUid[u.uid];
                              setSelectedUserUid(u.uid);
                              setAssignRole(
                                linked ? linked.role : u.role === 'user' ? 'admin' : u.role
                              );
                              setAssignTenantId(u.tenantId || linked?.tenantId || fallbackTenantId);
                              setAssignVehicleInfo(linked?.vehicleInfo ?? '');
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
                                {u.role}
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
              <Label>{tx('Role / Position', 'Role / Jabatan')}</Label>
              <Select
                value={assignRole}
                onValueChange={(v) => setAssignRole(v as UnifiedAccountRole)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="superadmin">Platform Superadmin</SelectItem>
                  <SelectItem value="admin">Branch Admin</SelectItem>
                  <SelectItem value="courier">{staffRoleLabels.courier}</SelectItem>
                  <SelectItem value="technician">{staffRoleLabels.technician}</SelectItem>
                  <SelectItem value="admin_ops">{staffRoleLabels.admin_ops}</SelectItem>
                  <SelectItem value="user">
                    {tx('Member / Renter (Revoke Staff)', 'Member / Penyewa (Cabut Staff)')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {assignRole === 'admin' || isOperationalStaffRole(assignRole) ? (
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

            {assignRole === 'courier' ? (
              <div className="space-y-1.5">
                <Label>{tx('Vehicle & Plate (Optional)', 'Kendaraan & Plat Nomor (Opsional)')}</Label>
                <Input
                  placeholder={tx('e.g. Honda Vario · L 4412 XY', 'mis. Honda Vario · L 4412 XY')}
                  value={assignVehicleInfo}
                  onChange={(e) => setAssignVehicleInfo(e.target.value)}
                />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignAdminOpen(false)}>
              {tx('Cancel', 'Batal')}
            </Button>
            <Button disabled={!selectedUserUid} onClick={() => void handleAssignAccountRole()}>
              {tx('Save Role', 'Simpan Role')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Operational Staff Detail & Edit Dialog */}
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
                      {staffRoleLabels[detailStaff.role]} ·{' '}
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
                        <dt className="shrink-0 text-muted-foreground">
                          {tx('Account Email', 'Email Akun')}
                        </dt>
                        <dd className="truncate text-foreground">{detailStaff.email}</dd>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between py-2.5">
                      <dt className="text-muted-foreground">{tx('Role', 'Jabatan')}</dt>
                      <dd className="font-medium text-foreground">
                        {staffRoleLabels[detailStaff.role]}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between py-2.5">
                      <dt className="text-muted-foreground">
                        {tx('WhatsApp / Phone', 'WhatsApp / HP')}
                      </dt>
                      <dd className="tabular-nums font-medium text-foreground">
                        {detailStaff.phone || '—'}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between py-2.5">
                      <dt className="text-muted-foreground">
                        {tx('Vehicle / Plate', 'Kendaraan / Plat')}
                      </dt>
                      <dd className="text-foreground">{detailStaff.vehicleInfo || '—'}</dd>
                    </div>
                    <div className="flex items-center justify-between py-2.5">
                      <dt className="text-muted-foreground">{tx('Registered', 'Terdaftar')}</dt>
                      <dd className="text-xs text-foreground">
                        {formatDateTime(detailStaff.createdAt)}
                      </dd>
                    </div>
                  </dl>

                  <div className="space-y-2.5 border-t pt-4">
                    <WhatsAppButton
                      phone={detailStaff.phone}
                      message={tx(
                        `Hello ${detailStaff.name}, branch operational coordination for ${tenantById[detailStaff.tenantId]?.name ?? activeTenant?.name ?? 'CameraRent'}.`,
                        `Halo ${detailStaff.name}, koordinasi operasional cabang ${tenantById[detailStaff.tenantId]?.name ?? activeTenant?.name ?? 'CameraRent'}.`
                      )}
                      className="w-full"
                    />
                    <div className="flex items-center justify-between">
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
                        {tx('Delete Employee', 'Hapus Karyawan')}
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="edit" className="mt-4">
                  <form onSubmit={handleSaveStaffEdit} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label>{tx('Full Name', 'Nama Lengkap')}</Label>
                      <Input
                        value={editStaffForm.name}
                        onChange={(e) =>
                          setEditStaffForm((prev) => ({ ...prev, name: e.target.value }))
                        }
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>{tx('WhatsApp / Phone', 'WhatsApp / HP')}</Label>
                        <Input
                          value={editStaffForm.phone}
                          onChange={(e) =>
                            setEditStaffForm((prev) => ({ ...prev, phone: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>{tx('Role', 'Jabatan')}</Label>
                        <Select
                          value={editStaffForm.role}
                          onValueChange={(v) =>
                            setEditStaffForm((prev) => ({ ...prev, role: v as StaffRole }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="courier">{staffRoleLabels.courier}</SelectItem>
                            <SelectItem value="technician">{staffRoleLabels.technician}</SelectItem>
                            <SelectItem value="admin_ops">{staffRoleLabels.admin_ops}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>{tx('Vehicle / Plate Number', 'Kendaraan / Plat Nomor')}</Label>
                      <Input
                        value={editStaffForm.vehicleInfo}
                        onChange={(e) =>
                          setEditStaffForm((prev) => ({ ...prev, vehicleInfo: e.target.value }))
                        }
                        placeholder={tx('Optional', 'Opsional')}
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setStaffModalTab('detail')}
                      >
                        {tx('Cancel', 'Batal')}
                      </Button>
                      <Button type="submit" disabled={savingStaffEdit}>
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

      {/* Admin / Superadmin Account Detail & Edit Dialog */}
      <Dialog open={Boolean(detailAdmin)} onOpenChange={(o) => !o && setDetailAdminUid(null)}>
        <DialogContent className="max-w-md gap-5">
          {detailAdmin ? (
            <>
              <DialogHeader>
                <div className="flex items-start gap-3 pr-6">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-foreground">
                    {getInitials(detailAdmin.displayName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="truncate">{detailAdmin.displayName}</DialogTitle>
                    <DialogDescription className="mt-1 truncate">
                      {detailAdmin.email}
                    </DialogDescription>
                    <div className="mt-2">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                          detailAdmin.role === 'superadmin'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-secondary-foreground'
                        }`}
                      >
                        {detailAdminLinkedStaff
                          ? staffRoleLabels[detailAdminLinkedStaff.role]
                          : detailAdmin.role === 'superadmin'
                            ? 'Superadmin'
                            : 'Branch Admin'}
                      </span>
                    </div>
                  </div>
                </div>
              </DialogHeader>

              <Tabs
                value={adminModalTab}
                onValueChange={(v) => setAdminModalTab(v as 'detail' | 'edit')}
              >
                <TabsList
                  className={`grid w-full ${canEditAdminAccount(detailAdmin) ? 'grid-cols-2' : 'grid-cols-1'}`}
                >
                  <TabsTrigger value="detail">{tx('Details', 'Detail')}</TabsTrigger>
                  {canEditAdminAccount(detailAdmin) ? (
                    <TabsTrigger value="edit">{tx('Edit Profile', 'Edit Profil')}</TabsTrigger>
                  ) : null}
                </TabsList>

                <TabsContent value="detail" className="mt-4 space-y-5">
                  <dl className="divide-y divide-border text-sm">
                    <div className="flex items-center justify-between py-2.5">
                      <dt className="text-muted-foreground">{tx('Branch', 'Cabang')}</dt>
                      <dd className="font-medium text-foreground">
                        {detailAdmin.role === 'superadmin'
                          ? tx('All Branches (Global)', 'Semua Cabang (Global)')
                          : allTenants.find((t) => t.id === detailAdmin.tenantId)?.name ??
                            activeTenant?.name ??
                            '—'}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between py-2.5">
                      <dt className="text-muted-foreground">
                        {tx('WhatsApp / Phone', 'WhatsApp / HP')}
                      </dt>
                      <dd className="tabular-nums font-medium text-foreground">
                        {detailAdmin.phone || '—'}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between py-2.5">
                      <dt className="text-muted-foreground">NIK</dt>
                      <dd className="font-mono text-xs font-medium text-foreground">
                        {detailAdmin.nik || '—'}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-4 py-2.5">
                      <dt className="shrink-0 text-muted-foreground">UID</dt>
                      <dd className="truncate font-mono text-xs text-muted-foreground">
                        {detailAdmin.uid}
                      </dd>
                    </div>
                  </dl>

                  {detailAdmin.phone || (isSuperAdmin && detailAdmin.role === 'admin') ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
                      <WhatsAppButton
                        phone={detailAdmin.phone}
                        message={tx(
                          `Hello ${detailAdmin.displayName}, CameraRent coordination.`,
                          `Halo ${detailAdmin.displayName}, koordinasi CameraRent.`
                        )}
                        className={
                          isSuperAdmin && detailAdmin.role === 'admin' ? undefined : 'w-full'
                        }
                      />
                      {isSuperAdmin && detailAdmin.role === 'admin' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => void handleRevokeBranchAdmin(detailAdmin)}
                        >
                          {tx('Revoke Admin Access', 'Cabut Akses Admin')}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </TabsContent>

                {canEditAdminAccount(detailAdmin) ? (
                  <TabsContent value="edit" className="mt-4">
                    <form onSubmit={handleSaveAdminEdit} className="space-y-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="admin-edit-name">{tx('Full Name', 'Nama Lengkap')}</Label>
                        <Input
                          id="admin-edit-name"
                          value={adminEditForm.displayName}
                          onChange={(e) =>
                            setAdminEditForm((prev) => ({
                              ...prev,
                              displayName: e.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="admin-edit-phone">
                            {tx('WhatsApp / Phone', 'WhatsApp / HP')}
                          </Label>
                          <Input
                            id="admin-edit-phone"
                            value={adminEditForm.phone}
                            onChange={(e) =>
                              setAdminEditForm((prev) => ({ ...prev, phone: e.target.value }))
                            }
                            placeholder="0812xxxxxxxx"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="admin-edit-nik">
                            {tx('National ID / NIK (16 Digits)', 'NIK (16 Digit)')}
                          </Label>
                          <Input
                            id="admin-edit-nik"
                            className="font-mono text-xs"
                            maxLength={16}
                            value={adminEditForm.nik}
                            onChange={(e) =>
                              setAdminEditForm((prev) => ({
                                ...prev,
                                nik: e.target.value.replace(/\D/g, '').slice(0, 16),
                              }))
                            }
                            placeholder="3174xxxxxxxxxxxx"
                          />
                        </div>
                      </div>

                      {isSuperAdmin ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <Label>{tx('Role / Position', 'Role / Jabatan')}</Label>
                              <Select
                                value={adminEditForm.role}
                                disabled={detailAdmin.uid === userProfile?.uid}
                                onValueChange={(v) =>
                                  setAdminEditForm((prev) => ({
                                    ...prev,
                                    role: v as UnifiedAccountRole,
                                  }))
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="superadmin">Platform Superadmin</SelectItem>
                                  <SelectItem value="admin">Branch Admin</SelectItem>
                                  <SelectItem value="courier">{staffRoleLabels.courier}</SelectItem>
                                  <SelectItem value="technician">
                                    {staffRoleLabels.technician}
                                  </SelectItem>
                                  <SelectItem value="admin_ops">
                                    {staffRoleLabels.admin_ops}
                                  </SelectItem>
                                  <SelectItem value="user">
                                    {tx('Member / Renter (Revoke)', 'Member / Penyewa (Cabut)')}
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {adminEditForm.role === 'admin' ||
                            isOperationalStaffRole(adminEditForm.role) ? (
                              <div className="space-y-1.5">
                                <Label>{tx('Assigned Branch', 'Cabang Ditugaskan')}</Label>
                                <Select
                                  value={adminEditForm.tenantId}
                                  onValueChange={(v) =>
                                    setAdminEditForm((prev) => ({ ...prev, tenantId: v }))
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue
                                      placeholder={tx('Select branch...', 'Pilih cabang...')}
                                    />
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

                          {adminEditForm.role === 'courier' ? (
                            <div className="space-y-1.5">
                              <Label>
                                {tx(
                                  'Vehicle & Plate (Optional)',
                                  'Kendaraan & Plat Nomor (Opsional)'
                                )}
                              </Label>
                              <Input
                                placeholder={tx(
                                  'e.g. Honda Vario · L 4412 XY',
                                  'mis. Honda Vario · L 4412 XY'
                                )}
                                value={adminEditForm.vehicleInfo}
                                onChange={(e) =>
                                  setAdminEditForm((prev) => ({
                                    ...prev,
                                    vehicleInfo: e.target.value,
                                  }))
                                }
                              />
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="flex justify-end gap-2 pt-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setAdminModalTab('detail')}
                        >
                          {tx('Cancel', 'Batal')}
                        </Button>
                        <Button type="submit" disabled={savingAdminEdit}>
                          {savingAdminEdit
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
