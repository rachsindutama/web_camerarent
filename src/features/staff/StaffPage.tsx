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
import {
  BadgeCheck,
  Eye,
  Pencil,
  Phone,
  Plus,
  Power,
  Search,
  Trash2,
  UserCog,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { formatDateTime } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { StatusBadge } from '@/components/shared/StatusBadge';
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
import type { StaffRole, TenantStaff, UserProfile } from '@/types/schema';

const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  courier: 'Kurir Antar-Jemput',
  technician: 'Teknisi / QC Gear',
  admin_ops: 'Admin Operasional',
};

export function StaffPage() {
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();
  const { activeTenantId, activeTenant } = useTenant();
  const isSuperAdmin = userProfile?.role === 'superadmin';

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | StaffRole>('all');

  // Staff CRUD modal
  const [staffDialogOpen, setStaffDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<TenantStaff | null>(null);
  const [staffForm, setStaffForm] = useState({
    name: '',
    phone: '',
    role: 'courier' as StaffRole,
    vehicleInfo: '',
  });

  // Assign existing registered user as Branch Admin (Superadmin only)
  const [assignAdminOpen, setAssignAdminOpen] = useState(false);
  const [selectedUserUid, setSelectedUserUid] = useState('');
  const [detailStaff, setDetailStaff] = useState<TenantStaff | null>(null);
  const [detailAdmin, setDetailAdmin] = useState<UserProfile | null>(null);

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
        title="No active rental branch selected"
        description="Pilih cabang rental di topbar terlebih dahulu untuk mengelola karyawan dan admin."
      />
    );
  }

  const branchAdmins = allUsers.filter(
    (u) =>
      u.role === 'superadmin' ||
      (u.role === 'admin' && u.tenantId === activeTenantId)
  );
  const assignableUsers = allUsers.filter(
    (u) => u.role === 'user' || (u.role === 'admin' && u.tenantId !== activeTenantId)
  );

  const filteredStaff = branchStaff.filter((s) => {
    if (roleFilter !== 'all' && s.role !== roleFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      s.phone.toLowerCase().includes(q) ||
      (s.vehicleInfo ?? '').toLowerCase().includes(q)
    );
  });

  const openCreateStaff = () => {
    setEditingStaff(null);
    setStaffForm({
      name: '',
      phone: '',
      role: 'courier',
      vehicleInfo: '',
    });
    setStaffDialogOpen(true);
  };

  const openEditStaff = (staff: TenantStaff) => {
    setEditingStaff(staff);
    setStaffForm({
      name: staff.name,
      phone: staff.phone,
      role: staff.role,
      vehicleInfo: staff.vehicleInfo ?? '',
    });
    setStaffDialogOpen(true);
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !activeTenantId) return;
    if (!staffForm.name.trim() || !staffForm.phone.trim()) {
      toast.error('Nama dan nomor HP/WhatsApp karyawan wajib diisi.');
      return;
    }

    try {
      const payload = {
        tenantId: activeTenantId,
        name: staffForm.name.trim(),
        phone: staffForm.phone.trim(),
        role: staffForm.role,
        vehicleInfo: staffForm.vehicleInfo.trim(),
      };

      if (editingStaff) {
        await updateDoc(doc(db, 'tenant_staff', editingStaff.id), payload);
        toast.success(`Data karyawan ${staffForm.name} diperbarui.`);
      } else {
        await addDoc(collection(db, 'tenant_staff'), {
          ...payload,
          isActive: true,
          createdAt: Timestamp.now(),
        });
        toast.success(`Karyawan ${staffForm.name} ditambahkan ke ${activeTenant.name}.`);
      }

      await queryClient.invalidateQueries({ queryKey: ['tenant_staff', activeTenantId] });
      setStaffDialogOpen(false);
    } catch (error) {
      console.error('Save staff error:', error);
      toast.error('Gagal menyimpan data karyawan.');
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
    toast.success(`Karyawan ${staff.name} dihapus.`);
  };

  const handleAssignBranchAdmin = async () => {
    if (!db || !selectedUserUid || !activeTenantId) return;
    try {
      await updateDoc(doc(db, 'users', selectedUserUid), {
        role: 'admin',
        tenantId: activeTenantId,
      });
      await queryClient.invalidateQueries({ queryKey: ['staff-users'] });
      await queryClient.invalidateQueries({ queryKey: ['tenant_admin_staff'] });
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      toast.success(`Akun berhasil ditugaskan sebagai Admin ${activeTenant.name}.`);
      setAssignAdminOpen(false);
      setSelectedUserUid('');
    } catch (error) {
      console.error('Assign branch admin error:', error);
      toast.error('Gagal menetapkan Admin cabang.');
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
      toast.success(`Akses Admin cabang dicabut dari ${adminUser.displayName}.`);
    } catch (error) {
      console.error('Revoke branch admin error:', error);
      toast.error('Gagal mencabut akses Admin.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-zinc-950">
            Staff, Kurir &amp; Admin Cabang
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Cabang: <span className="font-medium text-zinc-800">{activeTenant.name}</span> · Kelola
            karyawan operasional (kurir antar-jemput, teknisi QC, admin ops) serta akun Admin cabang.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSuperAdmin ? (
            <Button variant="outline" size="sm" onClick={() => setAssignAdminOpen(true)}>
              <UserCog className="h-3.5 w-3.5" strokeWidth={1.5} />
              Assign Admin Cabang
            </Button>
          ) : null}
          <Button size="sm" onClick={openCreateStaff}>
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
            Akun Admin &amp; Superadmin ({branchAdmins.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="employees" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-64">
                <Search
                  className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-400"
                  strokeWidth={1.5}
                />
                <Input
                  placeholder="Cari nama, no HP, plat kendaraan..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select
                value={roleFilter}
                onValueChange={(v) => setRoleFilter(v as typeof roleFilter)}
              >
                <SelectTrigger className="w-44">
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
            <span className="font-mono text-[11px] text-zinc-500">
              {branchStaff.filter((s) => s.isActive).length} AKTIF //{' '}
              {branchStaff.filter((s) => s.role === 'courier' && s.isActive).length} KURIR
            </span>
          </div>

          {loadingStaff ? (
            <div className="rounded-md border border-zinc-200 bg-white p-8 text-center font-mono text-xs text-zinc-400">
              LOADING STAFF DIRECTORY...
            </div>
          ) : filteredStaff.length === 0 ? (
            <EmptyState
              icon={Users}
              title={`Belum ada karyawan di ${activeTenant.name}`}
              description="Tambahkan kurir antar-jemput, teknisi QC, atau staf admin operasional agar bisa ditugaskan di menu Antar-Jemput."
              action={
                <Button size="sm" onClick={openCreateStaff}>
                  <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Tambah Karyawan
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama Karyawan</TableHead>
                  <TableHead>Jabatan</TableHead>
                  <TableHead>WhatsApp / HP</TableHead>
                  <TableHead>Kendaraan / Plat</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStaff.map((staff) => (
                  <TableRow
                    key={staff.id}
                    onClick={() => setDetailStaff(staff)}
                    className="cursor-pointer"
                  >
                    <TableCell className="font-medium text-zinc-950">{staff.name}</TableCell>
                    <TableCell>
                      <span className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] uppercase text-zinc-700">
                        {STAFF_ROLE_LABELS[staff.role]}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-zinc-700">
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3 text-zinc-400" strokeWidth={1.5} />
                        {staff.phone}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-zinc-600">
                      {staff.vehicleInfo || '—'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={staff.isActive ? 'active' : 'suspended'}
                        label={staff.isActive ? 'Aktif' : 'Nonaktif'}
                      />
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDetailStaff(staff)}
                        >
                          <Eye className="h-3 w-3" strokeWidth={1.5} />
                          Detail
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => openEditStaff(staff)}>
                          <Pencil className="h-3 w-3" strokeWidth={1.5} />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => void handleToggleStaffActive(staff)}
                          title={staff.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                        >
                          <Power className="h-3.5 w-3.5 text-zinc-600" strokeWidth={1.5} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => void handleDeleteStaff(staff)}
                          title="Hapus karyawan"
                        >
                          <Trash2
                            className="h-3.5 w-3.5 text-zinc-400 hover:text-red-600"
                            strokeWidth={1.5}
                          />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="admins" className="space-y-4">
          {loadingAdmins ? (
            <div className="rounded-md border border-zinc-200 bg-white p-8 text-center font-mono text-xs text-zinc-400">
              LOADING BRANCH ADMINS...
            </div>
          ) : branchAdmins.length === 0 ? (
            <EmptyState
              icon={BadgeCheck}
              title={`Belum ada akun Admin khusus untuk ${activeTenant.name}`}
              description="Superadmin dapat menugaskan akun pengguna terdaftar menjadi Admin cabang agar memiliki akses penuh ke operasional cabang ini."
              action={
                isSuperAdmin ? (
                  <Button size="sm" onClick={() => setAssignAdminOpen(true)}>
                    <UserCog className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Assign Admin Cabang
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama &amp; Email</TableHead>
                  <TableHead>Phone / NIK</TableHead>
                  <TableHead>Role</TableHead>
                  {isSuperAdmin ? <TableHead className="text-right">Aksi</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {branchAdmins.map((admin) => (
                  <TableRow
                    key={admin.uid}
                    onClick={() => setDetailAdmin(admin)}
                    className="cursor-pointer"
                  >
                    <TableCell>
                      <p className="font-medium text-zinc-950">{admin.displayName}</p>
                      <p className="font-mono text-[11px] text-zinc-500">{admin.email}</p>
                    </TableCell>
                    <TableCell className="font-mono text-[11px]">
                      <div>{admin.phone || '—'}</div>
                      <div className="text-zinc-500">{admin.nik ?? '—'}</div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${
                          admin.role === 'superadmin'
                            ? 'border-zinc-900 bg-zinc-900 text-white'
                            : 'border-zinc-200 bg-zinc-50 text-zinc-800'
                        }`}
                      >
                        {admin.role === 'superadmin' ? 'SUPERADMIN' : 'BRANCH ADMIN'}
                      </span>
                    </TableCell>
                    {isSuperAdmin ? (
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDetailAdmin(admin)}
                          >
                            <Eye className="h-3 w-3" strokeWidth={1.5} />
                            Detail
                          </Button>
                          {admin.role === 'admin' ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void handleRevokeBranchAdmin(admin)}
                            >
                              Cabut Akses Admin
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>

      {/* Add / Edit Operational Staff Modal */}
      <Dialog open={staffDialogOpen} onOpenChange={setStaffDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingStaff ? 'Edit Karyawan Cabang' : 'Tambah Karyawan Cabang'}
            </DialogTitle>
            <DialogDescription>
              Cabang: {activeTenant.name}. Karyawan aktif otomatis tersedia di dropdown kurir
              Antar-Jemput.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveStaff} className="space-y-3">
            <div className="space-y-1">
              <Label>Nama Lengkap Karyawan</Label>
              <Input
                placeholder="e.g., Budi Santoso"
                value={staffForm.name}
                onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>No. HP / WhatsApp</Label>
                <Input
                  placeholder="081234567890"
                  className="font-mono"
                  value={staffForm.phone}
                  onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Jabatan</Label>
                <Select
                  value={staffForm.role}
                  onValueChange={(v) => setStaffForm({ ...staffForm, role: v as StaffRole })}
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

            <div className="space-y-1">
              <Label>Kendaraan / Plat Nomor (opsional)</Label>
              <Input
                placeholder="e.g., GranMax Van L 1920 AB / Vario L 4412 XY"
                value={staffForm.vehicleInfo}
                onChange={(e) => setStaffForm({ ...staffForm, vehicleInfo: e.target.value })}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStaffDialogOpen(false)}>
                Batal
              </Button>
              <Button type="submit">
                {editingStaff ? 'Simpan Perubahan' : 'Simpan Karyawan'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign Branch Admin Modal (Superadmin) */}
      <Dialog open={assignAdminOpen} onOpenChange={setAssignAdminOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Akun sebagai Admin Cabang</DialogTitle>
            <DialogDescription>
              Pilih akun terdaftar untuk diberi akses Admin pada cabang {activeTenant.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Akun Terdaftar</Label>
            <Select value={selectedUserUid} onValueChange={setSelectedUserUid}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih akun..." />
              </SelectTrigger>
              <SelectContent>
                {assignableUsers.map((u) => (
                  <SelectItem key={u.uid} value={u.uid}>
                    {u.displayName} ({u.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignAdminOpen(false)}>
              Batal
            </Button>
            <Button disabled={!selectedUserUid} onClick={() => void handleAssignBranchAdmin()}>
              Tetapkan Admin Cabang
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Operational Staff Detail Modal */}
      <Dialog open={Boolean(detailStaff)} onOpenChange={(o) => !o && setDetailStaff(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              {detailStaff?.name}
              {detailStaff ? (
                <StatusBadge
                  status={detailStaff.isActive ? 'active' : 'suspended'}
                  label={detailStaff.isActive ? 'Aktif' : 'Nonaktif'}
                />
              ) : null}
            </DialogTitle>
            <DialogDescription>
              {detailStaff ? STAFF_ROLE_LABELS[detailStaff.role] : ''} · {activeTenant.name}
            </DialogDescription>
          </DialogHeader>
          {detailStaff ? (
            <div className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50 p-3.5 font-mono text-[11px]">
              <div className="flex justify-between gap-2">
                <span className="text-zinc-400">JABATAN</span>
                <span className="text-zinc-900">{STAFF_ROLE_LABELS[detailStaff.role]}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-zinc-400">HP / WHATSAPP</span>
                <span className="text-zinc-900">{detailStaff.phone}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-zinc-400">KENDARAAN / PLAT</span>
                <span className="text-zinc-900">{detailStaff.vehicleInfo || '—'}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-zinc-400">TERDAFTAR</span>
                <span className="text-zinc-600">{formatDateTime(detailStaff.createdAt)}</span>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            {detailStaff ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const target = detailStaff;
                  setDetailStaff(null);
                  openEditStaff(target);
                }}
              >
                <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                Edit Karyawan
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => setDetailStaff(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin / Superadmin Account Detail Modal */}
      <Dialog open={Boolean(detailAdmin)} onOpenChange={(o) => !o && setDetailAdmin(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              {detailAdmin?.displayName}
              {detailAdmin ? (
                <span
                  className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${
                    detailAdmin.role === 'superadmin'
                      ? 'border-zinc-900 bg-zinc-900 text-white'
                      : 'border-zinc-200 bg-zinc-50 text-zinc-800'
                  }`}
                >
                  {detailAdmin.role === 'superadmin' ? 'SUPERADMIN' : 'BRANCH ADMIN'}
                </span>
              ) : null}
            </DialogTitle>
            <DialogDescription className="font-mono text-[11px]">
              {detailAdmin?.email}
            </DialogDescription>
          </DialogHeader>
          {detailAdmin ? (
            <div className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50 p-3.5 font-mono text-[11px]">
              <div className="flex justify-between gap-2">
                <span className="text-zinc-400">ROLE SCOPE</span>
                <span className="uppercase text-zinc-900">{detailAdmin.role}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-zinc-400">CABANG</span>
                <span className="text-zinc-900">
                  {detailAdmin.role === 'superadmin' ? 'All Branches (Global)' : activeTenant.name}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-zinc-400">HP / WHATSAPP</span>
                <span className="text-zinc-900">{detailAdmin.phone || '—'}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-zinc-400">NIK</span>
                <span className="text-zinc-900">{detailAdmin.nik || '—'}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-zinc-400">UID</span>
                <span className="truncate text-zinc-600">{detailAdmin.uid}</span>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            {isSuperAdmin && detailAdmin?.role === 'admin' ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  const target = detailAdmin;
                  setDetailAdmin(null);
                  void handleRevokeBranchAdmin(target);
                }}
              >
                Cabut Akses Admin
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => setDetailAdmin(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

