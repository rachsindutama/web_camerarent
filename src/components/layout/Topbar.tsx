import { Link, useLocation } from 'react-router-dom';
import { LogOut, FileCheck2, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { getInitials } from '@/lib/utils';
import { TenantSwitcher } from '@/components/layout/TenantSwitcher';
import { LanguageToggle } from '@/components/shared/LanguageToggle';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { MembershipBadge } from '@/components/shared/MembershipBadge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const ROUTE_TITLES: Record<string, [string, string]> = {
  '/superadmin/tenants': ['Tenants & Global GMV', 'Cabang & GMV Global'],
  '/superadmin/blacklist': ['Members', 'Member'],
  '/superadmin/gmv': ['Tenants & Global GMV', 'Cabang & GMV Global'],
  '/superadmin/settings': ['Platform Settings', 'Pengaturan Platform'],
  '/admin/inventory': ['Inventory & Serial Numbers', 'Inventaris & Nomor Seri'],
  '/admin/bundles': ['Production Kit Bundles', 'Paket Kit Produksi'],
  '/admin/bookings': ['Booking Dispatch & Queue', 'Antrean & Pengelolaan Booking'],
  '/admin/logistics': ['Delivery & Pickup Tracker', 'Pelacak Kurir Antar-Jemput'],
  '/admin/inspections': ['Pre & Post-Rental Inspections', 'Inspeksi Sebelum & Sesudah Sewa'],
  '/admin/finance': ['Cash Flow Ledger', 'Buku Kas & Keuangan'],
  '/admin/staff': ['Branch Staff & Operations', 'Staff & Karyawan Cabang'],
  '/admin/members': ['Members & KYC', 'Member & KYC'],
  '/admin/chat': ['Client Support Threads', 'Chat Dukungan Klien'],
  '/catalog': ['Equipment Catalog', 'Katalog Gear'],
  '/bookings': ['My Rentals & Invoices', 'Pesanan & Invoice Saya'],
  '/kyc': ['Identity & KYC Verification', 'Verifikasi Identitas & KYC'],
  '/chat': ['Rental House Chat', 'Chat Bantuan Cabang'],
};

export function Topbar() {
  const location = useLocation();
  const { userProfile, signOut } = useAuth();
  const { tx } = useI18n();

  const titlePair = ROUTE_TITLES[location.pathname];
  const pageTitle = titlePair
    ? tx(titlePair[0], titlePair[1])
    : tx('Operations Console', 'Konsol Operasional');

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-5">
      <div className="flex items-center gap-3">
        <h1 className="text-xs font-semibold tracking-tight text-zinc-950">{pageTitle}</h1>
        <span className="h-3.5 w-px bg-zinc-200" />
        <TenantSwitcher />
      </div>

      <div className="flex items-center gap-2.5">
        <LanguageToggle />

        {userProfile && userProfile.role === 'user' ? (
          <>
            <MembershipBadge tier={userProfile.membershipTier} />
            <Link to="/kyc" className="transition-opacity hover:opacity-80">
              <StatusBadge status={userProfile.kycStatus} />
            </Link>
          </>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-md border border-transparent px-1.5 py-1 text-left transition-colors hover:border-zinc-200 hover:bg-zinc-50 focus:outline-none"
            >
              <Avatar className="h-6 w-6">
                <AvatarImage src={userProfile?.photoURL} alt={userProfile?.displayName} />
                <AvatarFallback>{getInitials(userProfile?.displayName)}</AvatarFallback>
              </Avatar>
              <div className="hidden text-left sm:block">
                <p className="max-w-[140px] truncate text-xs font-medium leading-none text-zinc-900">
                  {userProfile?.displayName}
                </p>
                <p className="mt-0.5 max-w-[140px] truncate font-mono text-[10px] leading-none text-zinc-400">
                  {userProfile?.email}
                </p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>{tx('Account', 'Akun')}</span>
              <span className="font-mono text-[10px] font-medium uppercase text-zinc-600">
                {userProfile?.role}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {userProfile?.role === 'user' ? (
              <DropdownMenuItem asChild>
                <Link to="/kyc" className="cursor-pointer">
                  <FileCheck2 className="h-3.5 w-3.5 text-zinc-500" strokeWidth={1.5} />
                  <span>{tx('KYC Verification', 'Verifikasi KYC')}</span>
                </Link>
              </DropdownMenuItem>
            ) : null}
            {userProfile?.role === 'superadmin' ? (
              <DropdownMenuItem asChild>
                <Link to="/superadmin/tenants" className="cursor-pointer">
                  <ShieldCheck className="h-3.5 w-3.5 text-zinc-500" strokeWidth={1.5} />
                  <span>{tx('Governance Console', 'Konsol Tata Kelola')}</span>
                </Link>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => void signOut()}
              className="cursor-pointer text-red-700 focus:bg-red-50 focus:text-red-800"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={1.5} />
              <span>{tx('Sign out', 'Keluar')}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
