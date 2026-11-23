import { NavLink } from 'react-router-dom';
import {
  Building2,
  Camera,
  Package,
  CalendarClock,
  Truck,
  ClipboardCheck,
  ReceiptText,
  MessageSquare,
  FileCheck2,
  Users,
  Briefcase,
  Settings,
  LayoutGrid,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { BrandMark } from '@/components/shared/BrandMark';
import type { UserRole } from '@/types/auth';

interface NavItem {
  labelEn: string;
  labelId: string;
  to: string;
  icon: LucideIcon;
}

interface NavGroup {
  headingEn: string;
  headingId: string;
  roles: UserRole[];
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    headingEn: 'Platform Governance',
    headingId: 'Tata Kelola Platform',
    roles: ['superadmin'],
    items: [
      { labelEn: 'Tenants & GMV', labelId: 'Cabang & GMV', to: '/superadmin/tenants', icon: Building2 },
      { labelEn: 'Settings', labelId: 'Pengaturan', to: '/superadmin/settings', icon: Settings },
    ],
  },
  {
    headingEn: 'Rental Operations',
    headingId: 'Operasional Rental',
    roles: ['superadmin', 'admin'],
    items: [
      { labelEn: 'Gear Catalog', labelId: 'Katalog Gear', to: '/catalog', icon: LayoutGrid },
      { labelEn: 'Inventory & SN', labelId: 'Inventaris & SN', to: '/admin/inventory', icon: Camera },
      { labelEn: 'Kit Bundles', labelId: 'Paket Kit', to: '/admin/bundles', icon: Package },
      { labelEn: 'Bookings', labelId: 'Booking', to: '/admin/bookings', icon: CalendarClock },
      { labelEn: 'Delivery & Pickup', labelId: 'Antar-Jemput', to: '/admin/logistics', icon: Truck },
      { labelEn: 'Inspections', labelId: 'Inspeksi QC', to: '/admin/inspections', icon: ClipboardCheck },
      { labelEn: 'Cash Flow Ledger', labelId: 'Buku Kas', to: '/admin/finance', icon: ReceiptText },
      { labelEn: 'Branch Staff', labelId: 'Staff & Karyawan', to: '/admin/staff', icon: Briefcase },
      { labelEn: 'Members', labelId: 'Member', to: '/admin/members', icon: Users },
      { labelEn: 'Client Chat', labelId: 'Chat Klien', to: '/admin/chat', icon: MessageSquare },
    ],
  },
  {
    headingEn: 'Renter Portal',
    headingId: 'Portal Penyewa',
    roles: ['user'],
    items: [
      { labelEn: 'Gear Catalog', labelId: 'Katalog Gear', to: '/catalog', icon: Camera },
      { labelEn: 'My Bookings', labelId: 'Pesanan Saya', to: '/bookings', icon: CalendarClock },
      { labelEn: 'KYC Verification', labelId: 'Verifikasi KYC', to: '/kyc', icon: FileCheck2 },
      { labelEn: 'Support Chat', labelId: 'Chat Bantuan', to: '/chat', icon: MessageSquare },
    ],
  },
];

export function Sidebar() {
  const { userProfile } = useAuth();
  const { tx } = useI18n();
  const role = userProfile?.role ?? 'user';

  const visibleGroups = NAV_GROUPS.filter((group) => group.roles.includes(role));

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-zinc-200 bg-white">
      <div className="flex h-12 items-center border-b border-zinc-200 px-4">
        <BrandMark size="sm" />
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-2.5 py-4">
        {visibleGroups.map((group) => (
          <div key={group.headingEn} className="space-y-1">
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              {tx(group.headingEn, group.headingId)}
            </div>
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-xs transition-colors',
                      isActive
                        ? 'bg-zinc-100 font-medium text-zinc-950'
                        : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950'
                    )
                  }
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                  <span className="truncate">{tx(item.labelEn, item.labelId)}</span>
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-zinc-200 px-4 py-3">
        <div className="flex items-center justify-between text-[11px] text-zinc-500">
          <span>{tx('Role Scope', 'Peran Akses')}</span>
          <span className="font-mono text-[10px] font-medium uppercase text-zinc-800">{role}</span>
        </div>
      </div>
    </aside>
  );
}
