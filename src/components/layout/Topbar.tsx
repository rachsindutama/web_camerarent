import { Link, useLocation } from 'react-router-dom';
import { LogOut, FileCheck2, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getInitials } from '@/lib/utils';
import { TenantSwitcher } from '@/components/layout/TenantSwitcher';
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

const ROUTE_TITLES: Record<string, string> = {
  '/superadmin/tenants': 'Tenants Directory',
  '/superadmin/blacklist': 'Global Blacklist',
  '/superadmin/gmv': 'Global GMV Overview',
  '/admin/inventory': 'Inventory & Serial Numbers',
  '/admin/bundles': 'Production Kit Bundles',
  '/admin/bookings': 'Booking Dispatch & Queue',
  '/admin/logistics': 'Antar-Jemput Courier Tracker',
  '/admin/inspections': 'Pre & Post-Rental Inspections',
  '/admin/finance': 'Cash Flow Ledger',
  '/admin/members': 'Members & Tiers',
  '/admin/chat': 'Client Support Threads',
  '/catalog': 'Equipment Catalog',
  '/bookings': 'My Rentals & Invoices',
  '/kyc': 'Identity & KYC Verification',
  '/chat': 'Rental House Chat',
};

export function Topbar() {
  const location = useLocation();
  const { userProfile, signOut } = useAuth();

  const pageTitle = ROUTE_TITLES[location.pathname] ?? 'Operations Console';

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-5">
      <div className="flex items-center gap-3">
        <h1 className="text-xs font-semibold tracking-tight text-zinc-950">{pageTitle}</h1>
        <span className="h-3.5 w-px bg-zinc-200" />
        <TenantSwitcher />
      </div>

      <div className="flex items-center gap-3">
        {userProfile ? <MembershipBadge tier={userProfile.membershipTier} /> : null}
        {userProfile && userProfile.role === 'user' ? (
          <Link to="/kyc" className="hover:opacity-80 transition-opacity">
            <StatusBadge status={userProfile.kycStatus} />
          </Link>
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
              <span>Account</span>
              <span className="font-mono text-[10px] font-medium uppercase text-zinc-600">
                {userProfile?.role}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/kyc" className="cursor-pointer">
                <FileCheck2 className="h-3.5 w-3.5 text-zinc-500" strokeWidth={1.5} />
                <span>KYC Verification</span>
              </Link>
            </DropdownMenuItem>
            {userProfile?.role === 'superadmin' ? (
              <DropdownMenuItem asChild>
                <Link to="/superadmin/tenants" className="cursor-pointer">
                  <ShieldCheck className="h-3.5 w-3.5 text-zinc-500" strokeWidth={1.5} />
                  <span>Governance Console</span>
                </Link>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => void signOut()}
              className="cursor-pointer text-red-700 focus:bg-red-50 focus:text-red-800"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={1.5} />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

