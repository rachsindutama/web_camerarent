import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { BadgeCheck, ChevronRight, Plus, Search, UserCog, Users } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { formatDateTime } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
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

const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  courier: 'Kurir Antar-Jemput',
  technician: 'Teknisi / QC Gear',
  admin_ops: 'Admin Operasional',
};

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || 'S';
}

export function StaffPage() {
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();
  const { activeTenantId, activeTenant, allTenants } = useTenant();
  const isSuperAdmin = userProfile?.role === 'superadmin';

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | StaffRole>('all');

  // Create Staff Dialog (requires exact 16-digit NIK lookup from registered users)
  const [createStaffOpen, setCreateStaffOpen] = useState(false);
  const [staffNikQuery, setStaffNikQuery] = useState('');
  const [newStaffForm, setNewStaffForm] = useState({
    userId: '',
    phone: '',
    role: 'courier' as StaffRole,
    vehicleInfo: '',
  });

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

  // Assign RBAC Role Dialog (Superadmin)
  const [assignAdminOpen, setAssignAdminOpen] = useState(false);
  const [selectedUserUid, setSelectedUserUid] = useState('');
  const [assignRole, setAssignRole] = useState<UserRole>('admin');
  const [assignTenantId, setAssignTenantId] = useState('');

  // Admin / Superadmin Detail & Edit Dialog
  const [detailAdminUid, setDetailAdminUid] = useState<string | null>(null);
  const [adminModalTab, setAdminModalTab] = useState<'detail' | 'edit'>('detail');
  const [savingAdminEdit, setSavingAdminEdit] = useState(false);
  const [adminEditForm, setAdminEditForm] = useState({
    displayName: '',
    phone: '',
    nik: '',
    role: 'admin' as UserRole,
    tenantId: '',
  });

  const { data: branchStaff = [], isLoading: loadingStaff } = useQuery<TenantStaff[]>({
    queryKey: ['tenant_staff', activeTenantId],
    enabled: Boolean(db && activeTenantId),
    queryFn: async () => {
      if (!db || !activeTenantId) return [];
      const snap = await getDocs(
        query(collection(db, 'tenant_staff'), where('tenantId', '==', activeTenantId))
      );
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as TenantStaff)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const { data: allUsers = [], isLoading: loadingAdmins } = useQuery<UserProfile[]>({
    queryKey: ['staff-users', activeTenantId],
    enabled: Boolean(db && activeTenantId),
    queryFn: async () => {
      if (!db) return [];
      const snap = await getDocs(collection(db, 'users'));
      return snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as UserProfile);
    },
  });

  if (!activeTenantId || !activeTenant) {
    return (
      <EmptyState
        icon={Users}
        title="Belum ada cabang aktif"
        description="Pilih cabang rental di bagian atas terlebih dahulu untuk mengelola karyawan dan admin."
      />
    );
  }

  const branchAdmins = allUsers.filter(
    (u) =>
      u.role === 'superadmin' ||
      (u.role === 'admin' && u.tenantId === activeTenantId)
  );
  const assignableUsers = allUsers.filter((u) => u.uid !== userProfile?.uid);
  const detailStaff = branchStaff.find((s) => s.id === detailStaffId) ?? null;
  const detailAdmin = allUsers.find((u) => u.uid === detailAdminUid) ?? null;

  const canEditAdminAccount = (admin: UserProfile) =>
    isSuperAdmin || admin.uid === userProfile?.uid;

  const openAssignRoleDialog = () => {
    setSelectedUserUid('');
    setAssignRole('admin');
    setAssignTenantId(activeTenantId);
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
    setDetailAdminUid(admin.uid);
    setAdminModalTab('detail');
    setAdminEditForm({
      displayName: admin.displayName,
      phone: admin.phone || '',
      nik: admin.nik || '',
      role: admin.role,
      tenantId: admin.tenantId || activeTenantId,
    });
  };

  const existingStaffUids = new Set(branchStaff.map((s) => s.userId).filter(Boolean));
  const cleanStaffNikQuery = staffNikQuery.replace(/\D/g, '');
  const exactNikMatchedUsers =
    cleanStaffNikQuery.length === 16
      ? allUsers.filter((u) => (u.nik ?? '').replace(/\D/g, '') === cleanStaffNikQuery)
      : [];
  const staffCandidateUsers = exactNikMatchedUsers
    .filter((u) => !existingStaffUids.has(u.uid))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const nikAlreadyAssignedInBranch =
    cleanStaffNikQuery.length === 16 &&
    exactNikMatchedUsers.length > 0 &&
    staffCandidateUsers.length === 0;
  const selectedCandidateUser = staffCandidateUsers[0] ?? null;

  const filteredStaff = branchStaff.filter((s) => {
    if (roleFilter !== 'all' && s.role !== roleFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      (s.email ?? '').toLowerCase().includes(q) ||
      s.phone.toLowerCase().includes(q) ||
      (s.vehicleInfo ?? '').toLowerCase().includes(q)
    );
  });

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !activeTenantId) return;
    if (!selectedCandidateUser) {
      toast.error('Pilih akun user yang akan ditambahkan sebagai karyawan.');
      return;
    }
    const cleanPhone = (newStaffForm.phone || selectedCandidateUser.phone || '').trim();
    if (!cleanPhone) {
      toast.error('Nomor WhatsApp / HP wajib diisi.');
      return;
    }

    try {
      await addDoc(collection(db, 'tenant_staff'), {
        tenantId: activeTenantId,
        userId: selectedCandidateUser.uid,
        email: selectedCandidateUser.email,
        name: selectedCandidateUser.displayName,
        phone: cleanPhone,
        role: newStaffForm.role,
        vehicleInfo: newStaffForm.vehicleInfo.trim(),
        isActive: true,
        createdAt: Timestamp.now(),
      });
      await queryClient.invalidateQueries({ queryKey: ['tenant_staff', activeTenantId] });
      toast.success(`${selectedCandidateUser.displayName} ditambahkan ke ${activeTenant.name}.`);
      setCreateStaffOpen(false);
      setStaffNikQuery('');
      setNewStaffForm({ userId: '', phone: '', role: 'courier', vehicleInfo: '' });
    } catch (error) {
      console.error('Create staff error:', error);
      toast.error('Gagal menambahkan karyawan.');
    }
  };

  const handleSaveStaffEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !activeTenantId || !detailStaff) return;
    if (!editStaffForm.name.trim() || !editStaffForm.phone.trim()) {
      toast.error('Nama dan nomor HP/WhatsApp karyawan wajib diisi.');
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
      await queryClient.invalidateQueries({ queryKey: ['tenant_staff', activeTenantId] });
      toast.success(`Data ${editStaffForm.name.trim()} disimpan.`);
      setStaffModalTab('detail');
    } catch (error) {
      console.error('Update staff error:', error);
      toast.error('Gagal menyimpan perubahan data karyawan.');
    } finally {
      setSavingStaffEdit(false);
    }
  };

  const handleToggleStaffActive = async (staff: TenantStaff) => {
    if (!db || !activeTenantId) return;
    await updateDoc(doc(db, 'tenant_staff', staff.id), { isActive: !staff.isActive });
    await queryClient.invalidateQueries({ queryKey: ['tenant_staff', activeTenantId] });
    toast.success(`${staff.name} kini ${!staff.isActive ? 'aktif' : 'nonaktif'}.`);
  };

  const handleDeleteStaff = async (staff: TenantStaff) => {
    if (!db || !activeTenantId) return;
    await deleteDoc(doc(db, 'tenant_staff', staff.id));
    await queryClient.invalidateQueries({ queryKey: ['tenant_staff', activeTenantId] });
    setDetailStaffId(null);
    toast.success(`Karyawan ${staff.name} dihapus.`);
  };

  const handleSaveAdminEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !detailAdmin || !canEditAdminAccount(detailAdmin)) return;

    const cleanName = adminEditForm.displayName.trim();
    const cleanPhone = adminEditForm.phone.trim();
    const cleanNik = adminEditForm.nik.replace(/\D/g, '');

    if (cleanName.length < 2) {
      toast.error('Nama lengkap minimal 2 karakter.');
      return;
    }
    if (cleanNik.length > 0 && cleanNik.length !== 16) {
      toast.error('NIK harus 16 digit angka (atau kosongkan jika belum ada).');
      return;
    }

    if (isSuperAdmin && adminEditForm.role === 'admin' && !adminEditForm.tenantId) {
      toast.error('Pilih cabang untuk role Branch Admin.');
      return;
    }

    setSavingAdminEdit(true);
    try {
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
        const isSelf = detailAdmin.uid === userProfile?.uid;
        const nextRole = isSelf ? detailAdmin.role : adminEditForm.role;
        payload.role = nextRole;
        payload.tenantId = nextRole === 'admin' ? adminEditForm.tenantId || activeTenantId : null;
      }

      await updateDoc(doc(db, 'users', detailAdmin.uid), payload);
      await queryClient.invalidateQueries({ queryKey: ['staff-users'] });
      await queryClient.invalidateQueries({ queryKey: ['tenant_admin_staff'] });
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      toast.success(`Profil ${cleanName} disimpan.`);
      if (payload.role === 'user') {
        setDetailAdminUid(null);
      } else {
        setAdminModalTab('detail');
      }
    } catch (error) {
      console.error('Update admin profile error:', error);
      toast.error('Gagal menyimpan perubahan profil akun.');
    } finally {
      setSavingAdminEdit(false);
    }
  };

  const handleAssignAccountRole = async () => {
    if (!db || !selectedUserUid) return;
    if (assignRole === 'admin' && !assignTenantId) {
      toast.error('Pilih cabang untuk role Branch Admin.');
      return;
    }
    try {
      await updateDoc(doc(db, 'users', selectedUserUid), {
        role: assignRole,
        tenantId: assignRole === 'admin' ? assignTenantId : null,
      });
      await queryClient.invalidateQueries({ queryKey: ['staff-users'] });
      await queryClient.invalidateQueries({ queryKey: ['tenant_admin_staff'] });
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      const roleLabel =
        assignRole === 'superadmin'
          ? 'Superadmin'
          : assignRole === 'admin'
            ? `Branch Admin (${allTenants.find((t) => t.id === assignTenantId)?.name ?? activeTenant.name})`
            : 'Member (User)';
      toast.success(`Role akun diperbarui menjadi ${roleLabel}.`);
      setAssignAdminOpen(false);
      setSelectedUserUid('');
    } catch (error) {
      console.error('Assign role error:', error);
      toast.error('Gagal memperbarui role akun.');
    }
  };

  const handleRevokeBranchAdmin = async (adminUser: UserProfile) => {
    if (!db) return;
    try {
      await updateDoc(doc(db, 'users', adminUser.uid), {
        role: 'user',
        tenantId: null,
      });
      await queryClient.invalidateQueries({ queryKey: ['staff-users'] });
      await queryClient.invalidateQueries({ queryKey: ['tenant_admin_staff'] });
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      setDetailAdminUid(null);
      toast.success(`Akses Admin cabang dicabut dari ${adminUser.displayName}.`);
    } catch (error) {
      console.error('Revoke branch admin error:', error);
      toast.error('Gagal mencabut akses Admin.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Staff &amp; Karyawan
          </h2>
          <p className="text-sm text-muted-foreground">
            Cabang <span className="font-medium text-foreground">{activeTenant.name}</span> — kelola
            kurir antar-jemput, teknisi QC, dan akun admin cabang.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSuperAdmin ? (
            <Button variant="outline" size="sm" onClick={openAssignRoleDialog}>
              <UserCog className="h-3.5 w-3.5" strokeWidth={1.5} />
              Atur Role Akun
            </Button>
          ) : null}
          <Button size="sm" onClick={() => setCreateStaffOpen(true)}>
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
            Tambah Karyawan
          </Button>
        </div>
      </div>

      <Tabs defaultValue="employees">
        <TabsList>
          <TabsTrigger value="employees">
            Karyawan Operasional ({branchStaff.length})
          </TabsTrigger>
          <TabsTrigger value="admins">
            Admin &amp; Superadmin ({branchAdmins.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Operational Staff */}
        <TabsContent value="employees" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-64">
                <Search
                  className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
                  strokeWidth={1.5}
                />
                <Input
                  placeholder="Cari nama, HP, plat..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select
                value={roleFilter}
                onValueChange={(v) => setRoleFilter(v as typeof roleFilter)}
              >
                <SelectTrigger className="h-9 w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Jabatan</SelectItem>
                  <SelectItem value="courier">Kurir Antar-Jemput</SelectItem>
                  <SelectItem value="technician">Teknisi / QC Gear</SelectItem>
                  <SelectItem value="admin_ops">Admin Operasional</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <span className="text-xs text-muted-foreground">
              {branchStaff.filter((s) => s.isActive).length} aktif ·{' '}
              {branchStaff.filter((s) => s.role === 'courier' && s.isActive).length} kurir
            </span>
          </div>

          {loadingStaff ? (
            <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
              Memuat daftar karyawan...
            </div>
          ) : filteredStaff.length === 0 ? (
            <EmptyState
              icon={Users}
              title={`Belum ada karyawan di ${activeTenant.name}`}
              description="Tambahkan kurir, teknisi QC, atau staf admin operasional agar tersedia di penugasan Antar-Jemput."
              action={
                <Button size="sm" onClick={() => setCreateStaffOpen(true)}>
                  <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Tambah Karyawan
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Karyawan</TableHead>
                  <TableHead>Jabatan</TableHead>
                  <TableHead>WhatsApp / HP</TableHead>
                  <TableHead>Kendaraan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStaff.map((staff) => (
                  <TableRow
                    key={staff.id}
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
                          {staff.email ? (
                            <p className="truncate text-xs text-muted-foreground">{staff.email}</p>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                        {STAFF_ROLE_LABELS[staff.role]}
                      </span>
                    </TableCell>
                    <TableCell className="tabular-nums text-xs text-muted-foreground">
                      {staff.phone}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {staff.vehicleInfo || '—'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={staff.isActive ? 'active' : 'suspended'}
                        label={staff.isActive ? 'Aktif' : 'Nonaktif'}
                      />
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
        </TabsContent>

        {/* Tab 2: Admin & Superadmin */}
        <TabsContent value="admins" className="space-y-4">
          {loadingAdmins ? (
            <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
              Memuat akun admin...
            </div>
          ) : branchAdmins.length === 0 ? (
            <EmptyState
              icon={BadgeCheck}
              title={`Belum ada admin khusus di ${activeTenant.name}`}
              description="Superadmin dapat menugaskan akun terdaftar menjadi admin cabang ini."
              action={
                isSuperAdmin ? (
                  <Button size="sm" onClick={openAssignRoleDialog}>
                    <UserCog className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Atur Role Akun
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Akun</TableHead>
                  <TableHead>NIK &amp; WhatsApp</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {branchAdmins.map((admin) => (
                  <TableRow
                    key={admin.uid}
                    onClick={() => openAdminDetail(admin)}
                    className="group cursor-pointer"
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                          {getInitials(admin.displayName)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{admin.displayName}</p>
                          <p className="truncate text-xs text-muted-foreground">{admin.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      <div className="text-xs font-medium text-foreground">{admin.nik || '—'}</div>
                      <div className="text-xs text-muted-foreground">{admin.phone || '—'}</div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                          admin.role === 'superadmin'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-secondary-foreground'
                        }`}
                      >
                        {admin.role === 'superadmin' ? 'Superadmin' : 'Branch Admin'}
                      </span>
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
        </TabsContent>
      </Tabs>

      {/* Create Operational Staff Dialog (Pick from registered users by exact 16-digit NIK) */}
      <Dialog
        open={createStaffOpen}
        onOpenChange={(open) => {
          setCreateStaffOpen(open);
          if (!open) {
            setStaffNikQuery('');
            setNewStaffForm({ userId: '', phone: '', role: 'courier', vehicleInfo: '' });
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Karyawan</DialogTitle>
            <DialogDescription>
              Masukkan NIK lengkap 16 digit untuk mencari akun terdaftar di cabang{' '}
              {activeTenant.name}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateStaff} className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="staff-nik-lookup">NIK Lengkap (16 Digit)</Label>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {cleanStaffNikQuery.length}/16
                </span>
              </div>
              <Input
                id="staff-nik-lookup"
                className="font-mono text-xs"
                maxLength={16}
                placeholder="Masukkan 16 digit NIK..."
                value={staffNikQuery}
                onChange={(e) => {
                  const nextNik = e.target.value.replace(/\D/g, '').slice(0, 16);
                  setStaffNikQuery(nextNik);
                  if (nextNik.length === 16) {
                    const matched = allUsers.find(
                      (u) =>
                        (u.nik ?? '').replace(/\D/g, '') === nextNik &&
                        !existingStaffUids.has(u.uid)
                    );
                    setNewStaffForm((prev) => ({
                      ...prev,
                      userId: matched?.uid ?? '',
                      phone: matched?.phone ?? '',
                    }));
                  } else {
                    setNewStaffForm((prev) => ({ ...prev, userId: '', phone: '' }));
                  }
                }}
              />
              {cleanStaffNikQuery.length < 16 ? (
                <p className="text-xs text-muted-foreground">
                  Ketik 16 digit NIK lengkap untuk mengambil data akun user.
                </p>
              ) : nikAlreadyAssignedInBranch ? (
                <p className="text-xs text-destructive">
                  Akun dengan NIK ini sudah terdaftar sebagai karyawan di cabang ini.
                </p>
              ) : !selectedCandidateUser ? (
                <p className="text-xs text-destructive">
                  Tidak ditemukan akun user dengan NIK tersebut.
                </p>
              ) : null}
            </div>

            {selectedCandidateUser ? (
              <div className="flex items-center gap-3 rounded-md border bg-muted/40 px-3 py-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background border text-xs font-medium text-foreground">
                  {getInitials(selectedCandidateUser.displayName)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {selectedCandidateUser.displayName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {selectedCandidateUser.email}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Jabatan</Label>
                <Select
                  value={newStaffForm.role}
                  onValueChange={(v) => setNewStaffForm({ ...newStaffForm, role: v as StaffRole })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="courier">Kurir Antar-Jemput</SelectItem>
                    <SelectItem value="technician">Teknisi / QC Gear</SelectItem>
                    <SelectItem value="admin_ops">Admin Operasional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>WhatsApp / HP</Label>
                <Input
                  placeholder="Otomatis dari profil user"
                  value={newStaffForm.phone}
                  onChange={(e) => setNewStaffForm({ ...newStaffForm, phone: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Kendaraan / Plat Nomor (opsional)</Label>
              <Input
                placeholder="GranMax Van L 1920 AB"
                value={newStaffForm.vehicleInfo}
                onChange={(e) =>
                  setNewStaffForm({ ...newStaffForm, vehicleInfo: e.target.value })
                }
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateStaffOpen(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={!selectedCandidateUser}>
                Simpan Karyawan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign RBAC Role & Branch Dialog */}
      <Dialog open={assignAdminOpen} onOpenChange={setAssignAdminOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Atur Role &amp; Akses Akun</DialogTitle>
            <DialogDescription>
              Tetapkan role login akun terdaftar sebagai Member, Branch Admin, atau Superadmin.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Akun Terdaftar</Label>
              <Select
                value={selectedUserUid}
                onValueChange={(uid) => {
                  setSelectedUserUid(uid);
                  const found = allUsers.find((u) => u.uid === uid);
                  if (found) {
                    setAssignRole(found.role === 'user' ? 'admin' : found.role);
                    setAssignTenantId(found.tenantId || activeTenantId);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih akun..." />
                </SelectTrigger>
                <SelectContent>
                  {assignableUsers.map((u) => (
                    <SelectItem key={u.uid} value={u.uid}>
                      {u.displayName} ({u.email}) — {u.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Role Akses</Label>
              <Select value={assignRole} onValueChange={(v) => setAssignRole(v as UserRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Member / Penyewa (user)</SelectItem>
                  <SelectItem value="admin">Branch Admin (admin)</SelectItem>
                  <SelectItem value="superadmin">Platform Superadmin (superadmin)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {assignRole === 'admin' ? (
              <div className="space-y-1.5">
                <Label>Cabang Ditugaskan</Label>
                <Select value={assignTenantId} onValueChange={setAssignTenantId}>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignAdminOpen(false)}>
              Batal
            </Button>
            <Button disabled={!selectedUserUid} onClick={() => void handleAssignAccountRole()}>
              Simpan Role
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
                      {STAFF_ROLE_LABELS[detailStaff.role]} · {activeTenant.name}
                    </DialogDescription>
                    <div className="mt-2">
                      <StatusBadge
                        status={detailStaff.isActive ? 'active' : 'suspended'}
                        label={detailStaff.isActive ? 'Aktif' : 'Nonaktif'}
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
                  <TabsTrigger value="detail">Detail</TabsTrigger>
                  <TabsTrigger value="edit">Edit</TabsTrigger>
                </TabsList>

                <TabsContent value="detail" className="mt-4 space-y-5">
                  <dl className="divide-y divide-border text-sm">
                    {detailStaff.email ? (
                      <div className="flex items-center justify-between gap-4 py-2.5">
                        <dt className="shrink-0 text-muted-foreground">Email Akun</dt>
                        <dd className="truncate text-foreground">{detailStaff.email}</dd>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between py-2.5">
                      <dt className="text-muted-foreground">Jabatan</dt>
                      <dd className="font-medium text-foreground">
                        {STAFF_ROLE_LABELS[detailStaff.role]}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between py-2.5">
                      <dt className="text-muted-foreground">WhatsApp / HP</dt>
                      <dd className="tabular-nums font-medium text-foreground">
                        {detailStaff.phone || '—'}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between py-2.5">
                      <dt className="text-muted-foreground">Kendaraan / Plat</dt>
                      <dd className="text-foreground">{detailStaff.vehicleInfo || '—'}</dd>
                    </div>
                    <div className="flex items-center justify-between py-2.5">
                      <dt className="text-muted-foreground">Terdaftar</dt>
                      <dd className="text-xs text-foreground">
                        {formatDateTime(detailStaff.createdAt)}
                      </dd>
                    </div>
                  </dl>

                  <div className="space-y-2.5 border-t pt-4">
                    <WhatsAppButton
                      phone={detailStaff.phone}
                      message={`Halo ${detailStaff.name}, koordinasi operasional cabang ${activeTenant.name}.`}
                      className="w-full"
                    />
                    <div className="flex items-center justify-between">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleToggleStaffActive(detailStaff)}
                      >
                        {detailStaff.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => void handleDeleteStaff(detailStaff)}
                      >
                        Hapus Karyawan
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="edit" className="mt-4">
                  <form onSubmit={handleSaveStaffEdit} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label>Nama Lengkap</Label>
                      <Input
                        value={editStaffForm.name}
                        onChange={(e) =>
                          setEditStaffForm((prev) => ({ ...prev, name: e.target.value }))
                        }
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>WhatsApp / HP</Label>
                        <Input
                          value={editStaffForm.phone}
                          onChange={(e) =>
                            setEditStaffForm((prev) => ({ ...prev, phone: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Jabatan</Label>
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
                            <SelectItem value="courier">Kurir Antar-Jemput</SelectItem>
                            <SelectItem value="technician">Teknisi / QC Gear</SelectItem>
                            <SelectItem value="admin_ops">Admin Operasional</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Kendaraan / Plat Nomor</Label>
                      <Input
                        value={editStaffForm.vehicleInfo}
                        onChange={(e) =>
                          setEditStaffForm((prev) => ({ ...prev, vehicleInfo: e.target.value }))
                        }
                        placeholder="Opsional"
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setStaffModalTab('detail')}
                      >
                        Batal
                      </Button>
                      <Button type="submit" disabled={savingStaffEdit}>
                        {savingStaffEdit ? 'Menyimpan...' : 'Simpan Perubahan'}
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
                        {detailAdmin.role === 'superadmin' ? 'Superadmin' : 'Branch Admin'}
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
                  <TabsTrigger value="detail">Detail</TabsTrigger>
                  {canEditAdminAccount(detailAdmin) ? (
                    <TabsTrigger value="edit">Edit Profil</TabsTrigger>
                  ) : null}
                </TabsList>

                <TabsContent value="detail" className="mt-4 space-y-5">
                  <dl className="divide-y divide-border text-sm">
                    <div className="flex items-center justify-between py-2.5">
                      <dt className="text-muted-foreground">Cabang</dt>
                      <dd className="font-medium text-foreground">
                        {detailAdmin.role === 'superadmin'
                          ? 'Semua Cabang (Global)'
                          : allTenants.find((t) => t.id === detailAdmin.tenantId)?.name ??
                            activeTenant.name}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between py-2.5">
                      <dt className="text-muted-foreground">WhatsApp / HP</dt>
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
                        message={`Halo ${detailAdmin.displayName}, koordinasi CameraRent.`}
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
                          Cabut Akses Admin
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </TabsContent>

                {canEditAdminAccount(detailAdmin) ? (
                  <TabsContent value="edit" className="mt-4">
                    <form onSubmit={handleSaveAdminEdit} className="space-y-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="admin-edit-name">Nama Lengkap</Label>
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
                          <Label htmlFor="admin-edit-phone">WhatsApp / HP</Label>
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
                          <Label htmlFor="admin-edit-nik">NIK (16 Digit)</Label>
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
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label>Role Akses</Label>
                            <Select
                              value={adminEditForm.role}
                              disabled={detailAdmin.uid === userProfile?.uid}
                              onValueChange={(v) =>
                                setAdminEditForm((prev) => ({ ...prev, role: v as UserRole }))
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="user">Member (user)</SelectItem>
                                <SelectItem value="admin">Branch Admin (admin)</SelectItem>
                                <SelectItem value="superadmin">Superadmin (superadmin)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {adminEditForm.role === 'admin' ? (
                            <div className="space-y-1.5">
                              <Label>Cabang Ditugaskan</Label>
                              <Select
                                value={adminEditForm.tenantId}
                                onValueChange={(v) =>
                                  setAdminEditForm((prev) => ({ ...prev, tenantId: v }))
                                }
                              >
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
                        </div>
                      ) : null}

                      <div className="flex justify-end gap-2 pt-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setAdminModalTab('detail')}
                        >
                          Batal
                        </Button>
                        <Button type="submit" disabled={savingAdminEdit}>
                          {savingAdminEdit ? 'Menyimpan...' : 'Simpan Perubahan'}
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
