import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  FileCheck2,
  Upload,
  CheckCircle2,
  Clock,
  AlertCircle,
  Eye,
  Trash2,
  FolderOpen,
} from 'lucide-react';
import { toast } from 'sonner';
import { db, storage } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ImagePreviewModal } from '@/components/shared/ImagePreviewModal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

const kycSchema = z.object({
  phone: z
    .string()
    .min(10, 'Enter a valid Indonesian phone or WhatsApp number')
    .max(18, 'Phone number is too long')
    .regex(/^[0-9+\-\s]+$/, 'Phone number may only contain digits, spaces, + or -'),
  nik: z.string().regex(/^\d{16}$/, 'NIK must be exactly 16 numeric digits'),
});

type KycFormValues = z.infer<typeof kycSchema>;

export function KycOnboardingPage() {
  const { userProfile } = useAuth();
  const { tx } = useI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const form = useForm<KycFormValues>({
    resolver: zodResolver(kycSchema),
    values: {
      phone: userProfile?.phone ?? '',
      nik: userProfile?.nik ?? '',
    },
  });

  const filePreviews = useMemo(
    () =>
      selectedFiles.map((file) => ({
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    [selectedFiles]
  );

  useEffect(() => {
    return () => {
      filePreviews.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
  }, [filePreviews]);

  if (!userProfile) return null;

  const isPendingReview = userProfile.kycStatus === 'pending';
  const isVerified = userProfile.kycStatus === 'verified';
  const existingDocs = userProfile.kycDocs ?? [];
  const fieldsLocked = isPendingReview || isVerified;
  const uploadLocked = isPendingReview;

  const appendFiles = (incoming: FileList | File[] | null) => {
    if (!incoming || uploadLocked || submitting) return;
    setUploadError(null);
    const list = Array.from(incoming);
    const valid: File[] = [];
    for (const file of list) {
      if (!file.type.startsWith('image/')) {
        toast.error(
          tx(
            `${file.name} is not an image file (use PNG/JPG/WEBP).`,
            `${file.name} bukan file gambar (gunakan PNG/JPG/WEBP).`
          )
        );
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error(
          tx(`${file.name} exceeds the 5MB maximum limit.`, `${file.name} melebihi batas maksimal 5MB.`)
        );
        continue;
      }
      valid.push(file);
    }
    if (valid.length > 0) {
      setSelectedFiles((prev) => [...prev, ...valid]);
    }
  };

  const triggerFilePicker = () => {
    if (uploadLocked || submitting) return;
    fileInputRef.current?.click();
  };

  const onSubmit = async (values: KycFormValues) => {
    setUploadError(null);

    if (!db || !storage) {
      toast.error(
        tx(
          'Firebase Storage / Firestore is not configured.',
          'Firebase Storage / Firestore belum terkonfigurasi.'
        )
      );
      return;
    }

    if (selectedFiles.length === 0 && existingDocs.length === 0) {
      toast.error(
        tx(
          'Please select at least one identity photo (ID Card / Selfie with ID).',
          'Pilih minimal satu foto identitas (KTP / Selfie dengan KTP).'
        )
      );
      return;
    }

    if (isVerified && selectedFiles.length === 0) {
      toast.info(
        tx(
          'Please choose an ID Card / Selfie image file first.',
          'Pilih file gambar KTP / Selfie terlebih dahulu.'
        )
      );
      return;
    }

    setSubmitting(true);
    try {
      const uploadedUrls: string[] = [...existingDocs];

      for (const file of selectedFiles) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storageRef = ref(storage, `kyc/${userProfile.uid}/${Date.now()}_${safeName}`);
        await uploadBytes(storageRef, file, { contentType: file.type });
        const url = await getDownloadURL(storageRef);
        uploadedUrls.push(url);
      }

      await updateDoc(doc(db, 'users', userProfile.uid), {
        ...(fieldsLocked
          ? { kycDocs: uploadedUrls }
          : {
              phone: values.phone.trim(),
              nik: values.nik.trim(),
              kycDocs: uploadedUrls,
              kycStatus: 'pending',
            }),
      });

      setSelectedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      toast.success(
        isVerified
          ? tx(
              'Identity documents uploaded to your KYC archive.',
              'Dokumen identitas berhasil diunggah ke arsip KYC Anda.'
            )
          : tx(
              'KYC dossier submitted for admin review.',
              'Dossier KYC berhasil dikirim untuk ditinjau admin.'
            )
      );
    } catch (error) {
      const err = error as { code?: string; message?: string };
      const detail = `${err?.code ? `[${err.code}] ` : ''}${err?.message ?? 'Upload failed'}`;
      console.error('KYC submission failed:', error);
      setUploadError(detail);
      toast.error(tx(`Upload failed: ${detail}`, `Upload gagal: ${detail}`));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-zinc-950">
            {tx('Renter Identity & KYC Verification', 'Verifikasi Identitas & KYC Penyewa')}
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            {tx(
              'Verified National ID (NIK) is mandatory before equipment reservation and handover across all rental branches.',
              'Verifikasi NIK wajib diselesaikan sebelum pemesanan dan serah terima alat di semua cabang.'
            )}
          </p>
        </div>
        <StatusBadge status={userProfile.kycStatus} />
      </div>

      {isVerified ? (
        <Card className="border-emerald-200 bg-emerald-50/40 shadow-none">
          <CardContent className="flex items-start gap-3 p-4">
            <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" strokeWidth={1.5} />
            <div className="text-xs">
              <p className="font-semibold text-emerald-900">
                {tx('Identity verified for rental checkout', 'Identitas terverifikasi untuk checkout sewa')}
              </p>
              <p className="mt-0.5 text-emerald-800">
                NIK <span className="font-mono">{userProfile.nik}</span>{' '}
                {tx(
                  'is cleared against the global blacklist registry.',
                  'lolos pengecekan daftar hitam global.'
                )}
                {existingDocs.length === 0
                  ? tx(
                      ' Click Browse Files below to attach your ID Card & Selfie for records.',
                      ' Klik Pilih File di bawah untuk melampirkan foto KTP & Selfie sebagai arsip.'
                    )
                  : ''}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {isPendingReview ? (
        <Card className="border-amber-200 bg-amber-50/40 shadow-none">
          <CardContent className="flex items-start gap-3 p-4">
            <Clock className="mt-0.5 h-4 w-4 text-amber-600" strokeWidth={1.5} />
            <div className="text-xs">
              <p className="font-semibold text-amber-900">
                {tx('Verification in review queue', 'Verifikasi sedang dalam antrean tinjauan')}
              </p>
              <p className="mt-0.5 text-amber-800">
                {tx(
                  'Your NIK and identity documents are pending review by operations staff. Booking checkout unlocks automatically upon approval.',
                  'NIK dan dokumen identitas Anda sedang ditinjau tim operasional. Checkout booking terbuka otomatis setelah disetujui.'
                )}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {userProfile.kycStatus === 'rejected' ? (
        <Card className="border-red-200 bg-red-50/40 shadow-none">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertCircle className="mt-0.5 h-4 w-4 text-red-600" strokeWidth={1.5} />
            <div className="text-xs">
              <p className="font-semibold text-red-900">
                {tx('Previous KYC submission rejected', 'Pengajuan KYC sebelumnya ditolak')}
              </p>
              <p className="mt-0.5 text-red-800">
                {tx(
                  'Verify your 16-digit NIK and upload clear, uncropped photographs of your KTP and selfie holding the ID card.',
                  'Periksa kembali 16 digit NIK Anda dan unggah foto KTP serta selfie memegang KTP dengan jelas tanpa terpotong.'
                )}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {uploadError ? (
        <Card className="border-red-200 bg-red-50 shadow-none">
          <CardContent className="p-3 text-xs text-red-900">
            <p className="font-semibold">Firebase Storage Error</p>
            <p className="mt-1 break-all font-mono text-[11px] text-red-800">{uploadError}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <FileCheck2 className="h-4 w-4 text-zinc-500" strokeWidth={1.5} />
            {tx('KYC Dossier', 'Dokumen KYC')}
          </CardTitle>
          <CardDescription>
            {tx(
              'Stored privately in Firebase Storage and restricted to Superadmin & Tenant Admin reviewers.',
              'Disimpan secara privat di Firebase Storage dan hanya dapat diakses oleh Superadmin & Admin Cabang.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="nik">{tx('National ID (NIK — 16 digits)', 'NIK (KTP — 16 digit)')}</Label>
                <Input
                  id="nik"
                  placeholder="3174011203950004"
                  className="font-mono"
                  disabled={fieldsLocked || submitting}
                  {...form.register('nik')}
                />
                {form.formState.errors.nik ? (
                  <p className="text-[11px] text-red-600">{form.formState.errors.nik.message}</p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone">{tx('WhatsApp / Phone Number', 'Nomor WhatsApp / Telepon')}</Label>
                <Input
                  id="phone"
                  placeholder="+62 812 9000 1234"
                  className="font-mono"
                  disabled={fieldsLocked || submitting}
                  {...form.register('phone')}
                />
                {form.formState.errors.phone ? (
                  <p className="text-[11px] text-red-600">{form.formState.errors.phone.message}</p>
                ) : null}
              </div>
            </div>

            {existingDocs.length > 0 ? (
              <div className="space-y-1.5">
                <Label>
                  {tx(
                    `Uploaded Documents (${existingDocs.length})`,
                    `Dokumen Terunggah (${existingDocs.length})`
                  )}
                </Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {existingDocs.map((url, idx) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setPreviewIndex(idx)}
                      className="group overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 text-left transition-colors hover:border-zinc-400"
                    >
                      <img
                        src={url}
                        alt={`KYC Document ${idx + 1}`}
                        className="h-24 w-full object-cover transition-transform duration-150 group-hover:scale-105"
                      />
                      <div className="flex items-center justify-between px-2 py-1 font-mono text-[10px] text-zinc-600">
                        <span>KYC_DOC_{idx + 1}</span>
                        <Eye className="h-3 w-3 text-zinc-400" strokeWidth={1.5} />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label>
                {existingDocs.length > 0
                  ? tx(
                      'Add Additional Identity Documents (KTP / Selfie)',
                      'Tambah Dokumen Identitas Tambahan (KTP / Selfie)'
                    )
                  : tx(
                      'Identity Documents (KTP & Selfie with KTP)',
                      'Dokumen Identitas (KTP & Selfie dengan KTP)'
                    )}
              </Label>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                disabled={uploadLocked || submitting}
                className="hidden"
                onChange={(event) => {
                  appendFiles(event.target.files);
                  event.target.value = '';
                }}
              />

              <div
                role="button"
                tabIndex={uploadLocked ? -1 : 0}
                onClick={triggerFilePicker}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    triggerFilePicker();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!uploadLocked && !submitting) setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  appendFiles(e.dataTransfer.files);
                }}
                className={`flex flex-col items-center justify-center rounded-md border border-dashed px-4 py-6 text-center transition-colors ${
                  isDragging
                    ? 'border-primary bg-blue-50/40'
                    : 'border-zinc-300 bg-zinc-50/50'
                } ${
                  uploadLocked || submitting
                    ? 'cursor-not-allowed opacity-60'
                    : 'cursor-pointer hover:border-zinc-400 hover:bg-zinc-50'
                }`}
              >
                <Upload className="h-4 w-4 text-zinc-400" strokeWidth={1.5} />
                <span className="mt-2 text-xs font-medium text-zinc-800">
                  {tx(
                    'Drag & drop ID Card / Selfie photos here, or click to select files',
                    'Tarik & lepas foto KTP / Selfie ke sini, atau klik untuk memilih file'
                  )}
                </span>
                <span className="mt-0.5 font-mono text-[10px] text-zinc-400">
                  PNG, JPG, WEBP · MAX 5MB PER FILE
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploadLocked || submitting}
                  className="mt-3 bg-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerFilePicker();
                  }}
                >
                  <FolderOpen className="h-3.5 w-3.5" strokeWidth={1.5} />
                  {tx('Browse Files', 'Pilih File')}
                </Button>
              </div>

              {filePreviews.length > 0 ? (
                <div className="space-y-2 pt-2">
                  <p className="font-mono text-[10px] uppercase text-zinc-500">
                    {tx(
                      `Ready to Upload (${filePreviews.length} file(s))`,
                      `Siap Diunggah (${filePreviews.length} file)`
                    )}
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {filePreviews.map(({ file, previewUrl }, idx) => (
                      <div
                        key={`${file.name}-${idx}`}
                        className="overflow-hidden rounded-md border border-zinc-200 bg-white"
                      >
                        <img
                          src={previewUrl}
                          alt={file.name}
                          className="h-20 w-full object-cover"
                        />
                        <div className="flex items-center justify-between gap-1 px-2 py-1 text-[10px]">
                          <span className="truncate font-mono text-zinc-700">{file.name}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedFiles((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="shrink-0 text-zinc-400 hover:text-red-600"
                            title={tx('Remove file', 'Hapus file')}
                          >
                            <Trash2 className="h-3 w-3" strokeWidth={1.5} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-zinc-400">UID: {userProfile.uid}</span>
              <Button
                type="submit"
                disabled={uploadLocked || submitting || (isVerified && selectedFiles.length === 0)}
              >
                {submitting
                  ? tx('Uploading to Storage...', 'Mengunggah ke Storage...')
                  : isPendingReview
                    ? tx('Pending Admin Review', 'Menunggu Tinjauan Admin')
                    : isVerified
                      ? selectedFiles.length > 0
                        ? tx(
                            `Upload ${selectedFiles.length} Document(s)`,
                            `Unggah ${selectedFiles.length} Dokumen`
                          )
                        : tx('Select Files Above First', 'Pilih File di Atas Terlebih Dahulu')
                      : tx('Submit for Verification', 'Kirim untuk Verifikasi')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <ImagePreviewModal
        open={previewIndex !== null}
        onOpenChange={(open) => !open && setPreviewIndex(null)}
        images={existingDocs.map((url, i) => ({
          url,
          label: `KYC_DOC_${i + 1}`,
        }))}
        initialIndex={previewIndex ?? 0}
        title={tx('Uploaded Identity Document', 'Dokumen Identitas Terunggah')}
      />
    </div>
  );
}
