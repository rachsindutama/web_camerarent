# CameraRent (`web_camerarent`)

Multi-Tenant Camera & Production Gear Rental Operations web application built with **React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui (Radix UI), Zustand, TanStack Query, Leaflet, jsPDF, and Firebase (Auth, Cloud Firestore, Storage)**.

Designed with a utilitarian, high-density Swiss editorial interface (monochrome Zinc/Slate palette, restrained Cobalt primary accent, `Inter` UI typography, and `JetBrains Mono` tabular numerals for serial numbers, invoice IDs, IDR currency, and timestamps).

---

## Core Features

### 1. Strict Registration Gate & RBAC Authentication
- **Mandatory Onboarding (`/register`):** Two-step registration requiring Google email ownership verification followed by full legal name, 16-digit National ID (NIK), active WhatsApp/phone number, and anti-fraud policy consent.
- **Zero Login Bypass (`/login`):** Unregistered Google accounts attempting to sign in directly at `/login` are immediately signed out and routed to `/register`. Enforced both in client auth guards and Firestore Security Rules (`allow create` validates NIK, phone, `role: 'user'`, `membershipTier: 'general'`, and `kycStatus: 'unverified'`).
- **Role-Based Access Control (`RoleGuard`):**
  - `superadmin`: Platform governance across all tenants (Tenant CRUD, Global Blacklist, KYC approval, RBAC role assignment, Global GMV).
  - `admin`: Scoped strictly to their assigned rental branch (`tenantId`) across Inventory, Bundles, Bookings, Logistics, Inspections, Finance, Members, and Chat.
  - `user`: Renter portal (Catalog, Booking Draft & Checkout, My Bookings, KYC Dossier, Support Chat).
- **Global Blacklist Enforcement:** Blacklisted accounts are immediately intercepted and redirected to `/blacklisted` across all branches.

### 2. Membership Tiers (`GENERAL` & `PREMIUM`)
Every newly registered renter defaults to **`GENERAL`** (enforced in `firestore.rules`, preventing self-upgrade). Both **Admin** and **Superadmin** can promote or demote members between `GENERAL` and `PREMIUM` via **Members & Tiers (`/admin/members`)** or **Global Blacklist (`/superadmin/blacklist`)**.

| Benefit | General Member (Default) | Premium Member (Upgraded) |
| :--- | :--- | :--- |
| Rental Discount (Gear & Kit Bundles) | 0% | **10% automatic discount** |
| Security Deposit (Refundable Liability) | 100% full deposit | **50% deposit reduction** |
| Overdue Grace Period | Branch base (e.g., 60 min) | **+60 min extra grace period** |
| Antar-Jemput Delivery | Standard `km × deliveryRatePerKm` | **First 5 km free** |
| Unit Limit per Booking | Max **3 physical units** | **Unlimited** |
| Operations Queue Priority | Standard | **`PREMIUM` priority badge** in Bookings, Logistics, Inspections, and Chat |

### 3. Multi-Tenant Governance (Superadmin)
- **Tenants Directory (`/superadmin/tenants`):** Create, edit, suspend, or activate rental branches with branch-specific delivery rates/km, turnaround `bufferHours`, `overdueGraceMinutes`, `overdueHourlyRatePercent`, bank settlement details, and interactive map pinning (**Pin Cabang di Peta**). Includes a 1-click **Seed Sample Branch & Gear** utility.
- **Global Blacklist, KYC & RBAC Registry (`/superadmin/blacklist`):** Search users by name, email, or 16-digit NIK; ban/unban renters globally with recorded incident reasons; inspect uploaded KTP/Selfie photos in an in-app zoomable/rotatable lightbox modal (`ImagePreviewModal`); approve/reject KYC; assign roles and branches; toggle `GENERAL`/`PREMIUM` tier.
- **Global GMV Dashboard (`/superadmin/gmv`):** Cross-tenant revenue aggregation with strict separation from refundable security deposit liabilities, active fleet count, overdue alerts, and per-branch breakdown.

### 4. Serial-Number Inventory, Bundles & Buffer-Aware Availability Engine
- **Equipment Catalog & Physical Units (`/admin/inventory`):** Manage catalog models (cameras, lenses, lighting, audio, stabilizers, accessories) and register individual physical assets with unique Serial Numbers (`SN-*`), condition (`mint`, `good`, `fair`, `damaged`), operational status (`available`, `rented`, `maintenance`), and included accessories checklists.
- **Production Kit Bundles (`/admin/bundles`):** Group multiple equipment models into discounted production packages with atomic multi-unit availability locking.
- **Buffer-Aware Availability Engine (`src/lib/availability.ts`):**
  - Checks overlap across `[startDate, endDate + tenant.bufferHours]` against PII-free `availability_slots` lock records so renters see real-time available serial units without reading other users' private booking documents.
  - Excludes units in `maintenance` or `damaged` condition while allowing future bookings for units currently in `rented` status outside overlapping dates.
  - Synchronizes slot status automatically on cancel, confirm, dispatch, overdue, and completion (`syncAvailabilitySlotStatus`).

### 5. Booking Flow, Pin Map / Shareloc GPS & A4 PDF Invoice
- **Renter Equipment Catalog (`/catalog`):** Real-time date-range picker, Individual Gear & Production Kits tabs, live Booking Draft cart with KYC gate and General 3-unit limit enforcement.
- **Self-Pickup & Antar-Jemput with Locked GPS/Map Distance:**
  - Interactive **Leaflet Map Picker** (`LocationPickerModal`) with **OpenStreetMap Street** and **Esri Satellite** layer switcher, Indonesian address search (Nominatim), direct Google Maps Shareloc URL parsing, and 1-click browser **Shareloc GPS**.
  - `Distance from Branch (km)` is locked (`readOnly` / `disabled`) and computed automatically from branch coordinates to the pinned delivery point (`Haversine × 1.25` urban road multiplier) to prevent manual fee tampering.
- **Clickable Booking Detail Modal (`BookingDetailModal`):** Available in both `/bookings` and `/admin/bookings` — displays branch & logistics info, interactive map pin preview + Google Maps directions link, serial-numbered unit breakdown, pre-rental handover checklist & photos, arithmetically transparent financial breakdown, bank transfer details, and in-app payment proof preview.
- **Printable A4 PDF Invoice (`src/lib/invoicePdf.ts`):** Generated via `jspdf` + `jspdf-autotable` with `INV/YYYYMM/XXXX` numbering, serial numbers, membership discount, deposit liability labeling, and bank settlement instructions.

### 6. Antar-Jemput Logistics, Inspections, Overdue Fines & Immutable Cash Flow Ledger
- **Antar-Jemput Courier Tracker (`/admin/logistics`):** Assign couriers, view pinned coordinates & route map, and step through 5 dispatch checkpoints (`pending_dispatch` → `out_for_delivery` → `delivered` → `pickup_scheduled` → `returned`).
- **Pre-Rental & Post-Rental Inspections (`/admin/inspections`):**
  - Pre-rental handover notes & photo checklists with renter sign-off confirmation (`Confirm Gear Condition`) before moving units to `active_rent` / `rented`.
  - Real-time overdue calculator (`useOverdueCalc`) respecting branch grace minutes + Premium +60m bonus, posting `overdue_fine` revenue entries.
  - Clean Return workflow (returns units to `available`, logs `deposit_refund` liability).
  - Post-Rental Damage Assessment modal creating `damage_reports`, auto-calculating `deductedFromDeposit` vs `extraFineAmount`, moving damaged units to `maintenance`/`damaged`, and updating the ledger.
- **Immutable Cash Flow Ledger (`/admin/finance`):** Strict accounting separation between `revenue` (`rental_income`, `damage_fine`, `overdue_fine`), `liability` (`deposit_in`, `deposit_refund`), and `expense` (`operational_expense`). Updates and deletes are blocked at the Firestore Security Rules level. Supports expense recording and **UTF-8 CSV export**.

### 7. WhatsApp-Style Real-Time Support Chat (`/chat` & `/admin/chat`)
- Scoped per `${tenantId}_${userId}` via live Firestore `onSnapshot` listeners.
- Supports **Reply / Quote**, **Edit sent message** (`edited` tag), **Copy text**, **Delete for Me (`Hapus untuk Saya`)**, **Unsend for Everyone (`Batal Kirim`)**, **Clear Chat for Me**, **Read Receipts** (single check vs double blue check), **Date Dividers**, **In-Thread Search**, **Image Upload / Preview Modal**, and inline **Booking Reference Cards**.

### 8. In-App Document & Image Lightbox (`ImagePreviewModal`)
- Replaces external Firebase Storage links across KYC review, renter KYC dossier, payment proof verification, handover checklists, and chat attachments with a zoomable (`50%–300%`), rotatable (`90°`), keyboard-navigable modal viewer.

---

## Tech Stack

- **Frontend:** React 18, TypeScript (strict), Vite 6, Tailwind CSS 3.4, shadcn/ui (Radix UI primitives), `lucide-react`
- **State & Data:** TanStack Query v5, Zustand v5, React Router v6, React Hook Form + Zod
- **Backend / BaaS:** Firebase Auth (Google Provider), Cloud Firestore, Firebase Storage
- **Maps & PDF:** Leaflet (OpenStreetMap + Esri World Imagery + Nominatim), `jspdf` + `jspdf-autotable`

---

## Project Structure

```text
src/
├── assets/                     # Brand mark SVG
├── components/
│   ├── ui/                     # shadcn/ui Radix primitives (button, dialog, table, tabs, select, etc.)
│   ├── layout/                 # AppShell, Sidebar, Topbar, TenantSwitcher, RoleGuard
│   └── shared/                 # StatusBadge, MembershipBadge, CurrencyText, SerialNumberTag, ImagePreviewModal, LocationPickerModal, EmptyState
├── features/
│   ├── auth/                   # AuthContext, LoginPage, RegisterPage, KycOnboardingPage, BlacklistNoticePage
│   ├── superadmin/             # TenantsPage, BlacklistPage, GlobalGmvPage, seedDemoData
│   ├── members/                # MembersPage (General/Premium tier management)
│   ├── inventory/              # InventoryPage, BundlesPage, CatalogPage
│   ├── bookings/               # MyBookingsPage, AdminBookingsPage, BookingDetailModal
│   ├── logistics/              # LogisticsPage (Antar-Jemput courier tracker)
│   ├── inspections/            # InspectionsPage (Pre/Post handover, Overdue, Damage Reports)
│   ├── finance/                # FinancePage (Immutable Ledger & CSV Export)
│   └── chat/                   # ChatPage (WhatsApp-style real-time Firestore chat)
├── hooks/                      # useAuth, useTenant, useAvailability, useOverdueCalc
├── lib/                        # firebase.ts, availability.ts, membership.ts, geo.ts, invoicePdf.ts, utils.ts
├── store/                      # useBookingDraftStore, useTenantStore, useFilterStore
└── types/                      # schema.ts, auth.ts
```

---

## Local Setup & Deployment

### 1. Prerequisites
- Node.js 18+ (tested on Node 24)
- Firebase project with **Google Authentication**, **Cloud Firestore**, and **Firebase Storage** enabled

### 2. Environment Configuration
Copy `.env.example` to `.env.local` and populate your **Firebase Web SDK** public configuration (never place Firebase Admin Service Account JSON keys in frontend files or environment variables):

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

### 3. Install & Run Locally
```bash
npm install
npm run dev
```

### 4. Typecheck & Production Build
```bash
npm run typecheck
npm run build
```

### 5. Deploy Firebase Security Rules & Indexes
```bash
firebase deploy --only firestore,storage
```

> **Security Notice:** `.env.local`, `*firebase-adminsdk*.json`, `serviceAccountKey.json`, and `secrets/` are strictly ignored in `.gitignore`. Keep all Admin SDK private keys server-side only.

