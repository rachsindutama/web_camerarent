import { NavLink } from 'react-router-dom';
import {
  Aperture,
  Building2,
  BarChart3,
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
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import type { UserRole } from '@/types/auth';

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

interface NavGroup {
  heading: string;
  roles: UserRole[];
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    heading: 'Platform Governance',
    roles: ['superadmin'],
    items: [
      { label: 'Tenants', to: '/superadmin/tenants', icon: Building2 },
      { label: 'Global GMV', to: '/superadmin/gmv', icon: BarChart3 },
      { label: 'Settings', to: '/superadmin/settings', icon: Settings },
    ],
  },
  {
    heading: 'Rental Operations',
    roles: ['superadmin', 'admin'],
    items: [
      { label: 'Inventory & SN', to: '/admin/inventory', icon: Camera },
      { label: 'Kit Bundles', to: '/admin/bundles', icon: Package },
      { label: 'Bookings', to: '/admin/bookings', icon: CalendarClock },
      { label: 'Antar-Jemput', to: '/admin/logistics', icon: Truck },
      { label: 'Inspections', to: '/admin/inspections', icon: ClipboardCheck },
      { label: 'Cash Flow Ledger', to: '/admin/finance', icon: ReceiptText },
      { label: 'Staff & Karyawan', to: '/admin/staff', icon: Briefcase },
      { label: 'Member', to: '/admin/members', icon: Users },
      { label: 'Client Chat', to: '/admin/chat', icon: MessageSquare },
    ],
  },
  {
    heading: 'Renter Portal',
    roles: ['user', 'admin', 'superadmin'],
    items: [
      { label: 'Gear Catalog', to: '/catalog', icon: Camera },
      { label: 'My Bookings', to: '/bookings', icon: CalendarClock },
      { label: 'KYC Verification', to: '/kyc', icon: FileCheck2 },
      { label: 'Support Chat', to: '/chat', icon: MessageSquare },
    ],
  },
];

export function Sidebar() {
  const { userProfile } = useAuth();
  const role = userProfile?.role ?? 'user';

  const visibleGroups = NAV_GROUPS.filter((group) => group.roles.includes(role));

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-zinc-200 bg-white">
      <div className="flex h-12 items-center gap-2.5 border-b border-zinc-200 px-4">
        <div className="flex h-6 w-6 items-center justify-center rounded border border-zinc-900 bg-zinc-950 text-white">
          <Aperture className="h-3.5 w-3.5" strokeWidth={1.5} />
        </div>
        <span className="text-sm font-semibold tracking-tight text-zinc-950">CameraRent</span>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-2.5 py-4">
        {visibleGroups.map((group) => (
          <div key={group.heading} className="space-y-1">
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              {group.heading}
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
                  <span className="truncate">{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-zinc-200 px-4 py-3">
        <div className="flex items-center justify-between text-[11px] text-zinc-500">
          <span>Role Scope</span>
          <span className="font-mono text-[10px] font-medium uppercase text-zinc-800">{role}</span>
        </div>
      </div>
    </aside>
  );
}

