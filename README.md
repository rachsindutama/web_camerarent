# CameraRent (`web_camerarent`)

Aplikasi web operasional **sewa kamera & perlengkapan produksi multi-cabang (Multi-Tenant)** yang dibangun menggunakan **React 18, TypeScript, Vite 6, Tailwind CSS, shadcn/ui (New York / Zinc), Zustand, TanStack Query v5, React Router v6, Leaflet, jsPDF, dan Firebase (Auth, Cloud Firestore, Storage, Hosting)**.

Dirancang dengan antarmuka modern **shadcn/ui Zinc** yang bersih, padat informasi, responsif, dan mendukung **Bilingual (Bahasa Inggris default + terjemahan Bahasa Indonesia dengan tombol toggle `EN | ID`)**.

Live Demo: **https://project-camerarent.web.app**

---

## Fitur Utama

### 1. Katalog Terpadu di Halaman Depan (`/`) & Deteksi Cabang Terdekat
- **Satu Katalog Terpadu (`/`):** Pengunjung (tamu), Penyewa (`user`), Branch Admin (`admin`), dan Superadmin (`superadmin`) mengakses katalog kamera, lensa, lighting, audio, stabilizer, aksesoris, dan paket produksi melalui satu tampilan storefront yang bersih di URL root **`/`**.
- **Deteksi Cabang Terdekat Otomatis:** Tamu dan penyewa secara otomatis diarahkan ke cabang terdekat berdasarkan koordinat lokasi (GPS browser + fallback IP geolocation), tanpa menampilkan opsi *Semua Cabang*.
- **Cek Ketersediaan Real-Time & Buffer:** Mengecek ketersediaan unit fisik bernomor seri secara langsung berdasarkan tanggal sewa + `bufferHours` cabang melalui koleksi `availability_slots` yang bebas PII.
- **Draft Booking Tersimpan Lintas Login:** Tamu dapat menyusun keranjang sewa terlebih dahulu, lalu saat menekan **Sign In to Checkout** dan masuk menggunakan Google, seluruh item di *Booking Draft* tetap terjaga.
- **Assisted Booking (Admin & Superadmin):** Admin cabang dan Superadmin dapat membantu membuatkan booking langsung atas nama member terdaftar dari halaman Katalog.

### 2. Bilingual Penuh (`EN | ID`)
- **Default Bahasa Inggris (`EN`)** dengan terjemahan **Bahasa Indonesia (`ID`)** di seluruh halaman, modal, tabel, status badge, notifikasi toast, dan label operasional.
- **Toggle Switch `EN | ID`** tersedia di header katalog publik, topbar dashboard, serta halaman registrasi dan blacklist, dengan preferensi bahasa tersimpan otomatis di `localStorage`.

### 3. Autentikasi Ketat, Registrasi 2 Langkah & RBAC
- **Registrasi Wajib (`/register`):** Verifikasi kepemilikan akun Google, dilanjutkan pengisian nama lengkap sesuai KTP, **NIK 16 digit**, nomor WhatsApp aktif, dan persetujuan kebijakan anti-fraud.
- **Tanpa Bypass Login:** Akun Google yang belum terdaftar di Firestore otomatis diarahkan ke `/register`. Ditegakkan di sisi klien (`RoleGuard`) dan `firestore.rules`.
- **Role-Based Access Control (RBAC):**
  - `superadmin`: Tata kelola lintas cabang (default scope **Semua Cabang / All Branches**), pengaturan global SEO & branding, benefit tier, aturan operasional cabang, verifikasi KYC, manajemen role RBAC, dan Global Blacklist.
  - `admin`: Terbatas pada cabang yang ditugaskan (`tenantId`) untuk kelola Inventaris & SN, Paket Kit, Booking, Antar-Jemput, Inspeksi QC, Buku Kas, Staff Cabang, Member, dan Chat Klien.
  - `user`: Portal penyewa (Katalog Gear, Pesanan Saya & Invoice, Verifikasi KYC, Chat Bantuan).
- **Global Blacklist (`/blacklisted`):** Akun yang masuk daftar hitam langsung diblokir di seluruh cabang.

### 4. Pengaturan Global SEO, Branding, Benefit Tier & Aturan Cabang (`/superadmin/settings`)
Terorganisir dalam 3 sub-tab terpusat untuk Superadmin:
1. **SEO & Branding:** Pengaturan nama brand, judul tab browser (`<title>`), heading H1 & subjudul katalog, teks copyright footer, warna tema browser, unggah langsung **Favicon**, **Logo Brand**, dan **OG Share Banner** ke Firebase Storage, Meta Description, Meta Keywords, Canonical URL, Robots indexing, serta **Pratinjau Langsung** (Tab Browser, Google Search, dan Kartu Share WhatsApp/Facebook/X). Disinkronkan real-time dari `platform_settings/global`.
2. **Benefit Tier Member (`Basic` & `Premium`):** Pengaturan diskon sewa (%), potongan deposit (%), tambahan grace period (menit), gratis ongkir (km pertama), batas maks. unit/booking (atau unlimited), dan badge prioritas.
3. **Ongkir & Aturan Cabang:** Pengaturan tarif ongkir/km, turnaround buffer (jam), grace period standar (menit), dan denda keterlambatan (%/jam) yang dapat diterapkan ke **Semua Cabang** sekaligus atau ke **Cabang Tertentu** (dilengkapi pencarian & pagination).

| Benefit Default | Basic (Default) | Premium (Upgrade) |
| :--- | :--- | :--- |
| Diskon Sewa (Alat & Paket Kit) | 0% | **Diskon otomatis 10%** |
| Deposit Jaminan (Liability) | 100% penuh | **Potongan deposit 50% (atau sesuai Settings)** |
| Tambahan Grace Period | Sesuai cabang (mis. 60 menit) | **+60 menit ekstra** |
| Pengiriman Antar-Jemput | Standar `km × tarif/km` | **Gratis 5 km pertama** |
| Batas Unit per Booking | Maks. **3 unit fisik** | **Tanpa batas (Unlimited)** |
| Prioritas Operasional | Standar | **Badge `Premium`** di Booking, Logistik, Inspeksi & Chat |

### 5. Manajemen Cabang & Global GMV (`/superadmin/tenants`)
- Penggabungan direktori cabang dan ringkasan **Global GMV** (Platform Revenue, Liabilitas Deposit Ditahan, Sewa Armada Aktif, dan Peringatan Overdue).
- Baris cabang klik-able dengan dialog tab **Ringkasan & GMV** dan **Edit Konfigurasi**.
- Koordinat **Latitude & Longitude** terkunci otomatis mengikuti titik pin peta cabang (**Pin Cabang di Peta**) untuk mencegah kesalahan input manual.
- Tersedia tombol **Seed Sample Branch** untuk mengisi data contoh cabang & inventaris.

### 6. Inventaris Serial Number, Upload Foto & Paket Kit (`/admin/inventory` & `/admin/bundles`)
- Kelola model alat (kamera, lensa, lighting, audio, stabilizer, aksesoris) lengkap dengan **thumbnail foto ringkas** dan **upload foto langsung ke Firebase Storage**.
- Baris tabel klik-able dengan dialog terpadu untuk kelola **Unit Fisik (Serial Number `SN-*`)**, **Edit Model**, dan **Hapus Model** (dilengkapi proteksi jika masih ada unit berstatus `rented`).
- **Paket Kit (`/admin/bundles`):** Bundling beberapa model alat dengan harga paket dan alokasi ketersediaan unit secara atomik.

### 7. Booking, Pin Peta GPS, Logistik Antar-Jemput & Invoice PDF A4
- **Pin Peta Interaktif (`LocationPickerModal`):** Menggunakan Leaflet (peta Street & Satelit Esri), pencarian alamat Indonesia (Nominatim), parsing tautan Shareloc Google Maps, dan 1-klik GPS browser. Jarak pengiriman (`km`) terkunci otomatis (`Haversine × 1.25`).
- **Pelacak Kurir Antar-Jemput (`/admin/logistics`):** Penugasan kurir langsung dari daftar karyawan cabang, pratinjau pin peta & arah Google Maps, 5 tahap checkpoint pengiriman dengan timestamp audit, auto-kalkulasi denda overdue saat pengembalian terlambat, dan penguncian logistik untuk booking `completed`.
- **Inspeksi Pra-Sewa & Pasca-Sewa (`/admin/inspections`):** Checklist kondisi pra-sewa dengan konfirmasi penyewa, kalkulator denda overdue real-time, proses pengembalian bersih (refund deposit), dan laporan kerusakan (`damage_reports`) dengan perhitungan potongan deposit otomatis.
- **Invoice PDF A4 (`src/lib/invoicePdf.ts`):** Cetak invoice `INV/YYYYMM/XXXX` lengkap dengan daftar nomor seri, diskon member, rincian deposit jaminan, dan rekening bank cabang.

### 8. Member, Staff & Karyawan (`/admin/members` & `/admin/staff`)
- **Member (`/admin/members`):** Daftar khusus akun penyewa (`role: user`) dengan filter tier, pending KYC, dan blacklist. Baris klik-able berisi ringkasan riwayat belanja, edit profil (Superadmin), pergantian tier Basic/Premium, peninjauan foto KTP/selfie dalam **Image Lightbox (`ImagePreviewModal`)**, Global Blacklist, dan tombol **WhatsApp CTA**.
- **Staff & Karyawan (`/admin/staff`):** Terbagi dalam 2 tab (**Karyawan Operasional** dan **Admin & Superadmin**), baris klik-able untuk detail/edit, manajemen role RBAC (`user`/`admin`/`superadmin`) dengan **account picker berpencarian & berpaginasi**, serta tombol **WhatsApp CTA**.

### 9. Buku Kas (Cash Flow Ledger) & Chat Klien Real-Time
- **Buku Kas (`/admin/finance`):** Pemisahan akuntansi ketat antara **Revenue** (`rental_income`, `overdue_fine`, `damage_fine`), **Liability** (`deposit_in`, `deposit_refund`), dan **Expense** (`operational_expense`). Baris transaksi klik-able menampilkan modal detail audit lengkap, penyeimbangan liabilitas deposit, catat biaya operasional, dan **Ekspor CSV**.
- **Client Chat (`/chat` & `/admin/chat`):** Chat real-time bergaya WhatsApp berbasis Firestore `onSnapshot` dengan fitur **Balas (Quote)**, **Edit pesan**, **Salin teks**, **Hapus untuk Saya**, **Batal Kirim untuk Semua**, **Bersihkan Chat**, **Centang Dibaca**, pencarian pesan, unggah gambar + lightbox, kartu referensi booking, dan tampilan bubble terang yang nyaman dibaca.

---

## Tech Stack

- **Frontend:** React 18, TypeScript (strict), Vite 6, Tailwind CSS 3.4, shadcn/ui (Radix UI), `lucide-react`
- **State & Data:** TanStack Query v5, Zustand v5, React Router v6, React Hook Form + Zod
- **Backend / BaaS:** Firebase Authentication (Google), Cloud Firestore, Firebase Storage, Firebase Hosting
- **Peta & Dokumen:** Leaflet (OpenStreetMap + Esri Satellite + Nominatim), `jspdf` + `jspdf-autotable`

---

## Struktur Proyek

```text
src/
├── components/
│   ├── ui/                     # Komponen dasar shadcn/ui (button, dialog, table, tabs, select, dll.)
│   ├── layout/                 # AppShell, UnifiedCatalogShell, Sidebar, Topbar, TenantSwitcher, RoleGuard
│   └── shared/                 # BrandMark, LanguageToggle, AuthDialog, StatusBadge, MembershipBadge,
│                               # CurrencyText, SerialNumberTag, WhatsAppButton, ImagePreviewModal,
│                               # LocationPickerModal, EmptyState
├── features/
│   ├── auth/                   # AuthContext, RegisterPage, KycOnboardingPage, BlacklistNoticePage
│   ├── superadmin/             # TenantsPage (Cabang & Global GMV), SettingsPage (SEO, Tier, Ongkir), seedDemoData
│   ├── members/                # MembersPage (Member, Tier, KYC, Blacklist)
│   ├── staff/                  # StaffPage (Karyawan Operasional & Admin RBAC)
│   ├── inventory/              # CatalogPage, InventoryPage, BundlesPage
│   ├── bookings/               # MyBookingsPage, AdminBookingsPage, BookingDetailModal
│   ├── logistics/              # LogisticsPage (Dispatch Kurir Antar-Jemput)
│   ├── inspections/            # InspectionsPage (Pra-Sewa, Pasca-Sewa, Overdue, Laporan Kerusakan)
│   ├── finance/                # FinancePage (Buku Kas & Ekspor CSV)
│   └── chat/                   # ChatPage (Chat Real-Time)
├── hooks/                      # useAuth, useTenant, usePlatformSettings, useNearestBranch,
│                               # useAvailability, useOverdueCalc, useI18n
├── lib/                        # firebase.ts, availability.ts, membership.ts, seo.ts, i18n.ts,
│                               # geo.ts, invoicePdf.ts, utils.ts
├── store/                      # useBookingDraftStore, useTenantStore, useFilterStore, useLanguageStore
└── types/                      # schema.ts, auth.ts
```

---

## Panduan Instalasi & Deploy

### 1. Prasyarat
- Node.js 18+ (teruji pada Node 24)
- Project Firebase dengan **Google Authentication**, **Cloud Firestore**, **Firebase Storage**, dan **Firebase Hosting** aktif

### 2. Konfigurasi Environment
Salin `.env.example` menjadi `.env.local` lalu isi konfigurasi publik **Firebase Web SDK** (jangan pernah menyimpan kunci JSON Firebase Admin Service Account di sisi frontend):

```bash
cp .env.example .env.local
```

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_USE_FIREBASE_EMULATOR=false
```

### 3. Menjalankan Secara Lokal
```bash
npm install
npm run dev
```

### 4. Typecheck & Build Produksi
```bash
npm run typecheck
npm run build
```

### 5. Deploy ke Firebase (Hosting & Security Rules)
```bash
npx firebase deploy --only hosting,firestore:rules,storage
```

> **Catatan Keamanan:** File `.env.local`, `*firebase-adminsdk*.json`, `serviceAccountKey.json`, dan direktori `secrets/` sudah dikecualikan di `.gitignore`. Pastikan seluruh kunci privat Admin SDK hanya disimpan di sisi server.

---

## Riwayat Pembaruan Terbaru (23–24 November 2026)

- **Bilingual Penuh (`EN | ID`):** Seluruh halaman dan komponen diubah ke Bahasa Inggris (default) lengkap dengan terjemahan Bahasa Indonesia dan toggle switch `EN | ID` di header publik, topbar, dan halaman auth.
- **Pengaturan SEO, Judul, Favicon & Branding Global:** Penambahan sub-tab *SEO & Branding* di menu **Settings** dengan unggah aset ke Firebase Storage, pratinjau langsung Google/Social/Tab Browser, serta perbaikan fetch live `platform_settings/global` agar perubahan langsung berlaku untuk semua pengunjung.
- **Katalog Terpadu di Root URL (`/`):** Penyatuan halaman depan dan katalog ke satu URL root `/` dengan kartu produk storefront `aspect-[4/3]`, deteksi cabang terdekat otomatis, dan *Assisted Booking* untuk Admin/Superadmin.
- **Thumbnail & Upload Foto Inventaris:** Penambahan thumbnail ringkas di katalog & tabel inventaris, upload foto langsung ke Storage, serta dialog terpadu klik baris untuk kelola Unit SN, Edit, dan Hapus Model.
- **Tata Kelola Superadmin & Pengaturan Terpusat:** Penggabungan Global GMV ke halaman Tenants, penguncian Latitude/Longitude ke pin peta, default scope *All Branches* untuk Superadmin, dan pengaturan terpusat *Benefit Tier* serta *Ongkir & Aturan Cabang* (dengan filter pencarian & pagination).
- **Manajemen Member & Staff:** Pemisahan menu khusus *Staff & Karyawan* dan *Member*, redesain komponen ke shadcn/ui Zinc, baris klik-able dengan edit profil inline, account picker berpaginasi di *Atur Role Akun*, dan tombol *WhatsApp CTA* hijau emerald.
- **Operasional, Keuangan & Chat:** Auto-kalkulasi denda overdue saat pengembalian/kurir, audit timeline timestamp lengkap, modal detail audit Buku Kas + penyeimbangan deposit forfeiture, serta penyegaran bubble pesan terkirim pada Chat menjadi abu-abu terang (tanpa warna hitam).
