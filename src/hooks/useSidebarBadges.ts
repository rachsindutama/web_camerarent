import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import type { Booking, ChatThread } from '@/types/schema';

export interface SidebarBadgeCounts {
  bookings: number;
  inspections: number;
  overdueCount: number;
  logistics: number;
  members: number;
  chat: number;
  kyc: number;
}

const EMPTY_BADGES: SidebarBadgeCounts = {
  bookings: 0,
  inspections: 0,
  overdueCount: 0,
  logistics: 0,
  members: 0,
  chat: 0,
  kyc: 0,
};

export function useSidebarBadges(): SidebarBadgeCounts {
  const { userProfile } = useAuth();
  const { activeTenantId, isAllTenants } = useTenant();
  const role = userProfile?.role ?? 'user';
  const isStaff = role === 'superadmin' || role === 'admin' || role === 'staff';
  const canManageMembers = role === 'superadmin' || role === 'admin';
  const scopeKey = isStaff ? (isAllTenants && role === 'superadmin' ? 'all' : activeTenantId ?? 'none') : userProfile?.uid ?? 'guest';

  const { data } = useQuery<SidebarBadgeCounts>({
    queryKey: ['sidebar-badges', role, userProfile?.uid ?? 'anon', scopeKey],
    enabled: Boolean(db && userProfile && (!isStaff || (role === 'superadmin' && isAllTenants) || Boolean(activeTenantId))),
    staleTime: 25_000,
    refetchInterval: 45_000,
    queryFn: async () => {
      if (!db || !userProfile) return EMPTY_BADGES;

      if (!isStaff) {
        const [bookingsSnap, chatsSnap] = await Promise.all([
          getDocs(query(collection(db, 'bookings'), where('userId', '==', userProfile.uid))),
          getDocs(query(collection(db, 'chats'), where('userId', '==', userProfile.uid))),
        ]);

        const myBookings = bookingsSnap.docs.map((d) => d.data() as Booking);
        const bookingsActionNeeded = myBookings.filter(
          (b) =>
            b.bookingStatus === 'pending_payment' ||
            b.bookingStatus === 'overdue' ||
            (b.bookingStatus === 'confirmed' &&
              Boolean(b.preRentalChecklist) &&
              !b.preRentalChecklist?.confirmedByUserAt)
        ).length;
        const overdueCount = myBookings.filter((b) => b.bookingStatus === 'overdue').length;
        const unreadChats = chatsSnap.docs
          .map((d) => d.data() as ChatThread)
          .filter((c) => Boolean(c.lastSenderId && c.lastSenderId !== userProfile.uid)).length;
        const kycNeeded =
          userProfile.kycStatus === 'unverified' || userProfile.kycStatus === 'rejected' ? 1 : 0;

        return {
          bookings: bookingsActionNeeded,
          inspections: 0,
          overdueCount,
          logistics: 0,
          members: 0,
          chat: unreadChats,
          kyc: kycNeeded,
        };
      }

      const fetchAllBranches = role === 'superadmin' && isAllTenants;
      const targetTenantId = activeTenantId;
      if (!fetchAllBranches && !targetTenantId) return EMPTY_BADGES;

      const bookingsQuery = fetchAllBranches
        ? collection(db, 'bookings')
        : query(collection(db, 'bookings'), where('tenantId', '==', targetTenantId));

      const chatsQuery = fetchAllBranches
        ? collection(db, 'chats')
        : query(collection(db, 'chats'), where('tenantId', '==', targetTenantId));

      const pendingMembersQuery = query(collection(db, 'users'), where('kycStatus', '==', 'pending'));

      const [bookingsSnap, chatsSnap, membersSnap] = await Promise.all([
        getDocs(bookingsQuery),
        getDocs(chatsQuery),
        canManageMembers ? getDocs(pendingMembersQuery) : Promise.resolve(null),
      ]);

      const bookings = bookingsSnap.docs.map((d) => d.data() as Booking);
      const pendingBookings = bookings.filter(
        (b) => b.bookingStatus === 'waiting_verification' || b.bookingStatus === 'pending_payment'
      ).length;
      const overdueCount = bookings.filter((b) => b.bookingStatus === 'overdue').length;
      const inspectionQueue = bookings.filter(
        (b) => b.bookingStatus === 'overdue' || b.bookingStatus === 'confirmed'
      ).length;
      const activeLogistics = bookings.filter(
        (b) =>
          b.logisticsType === 'delivery' &&
          ['confirmed', 'active_rent', 'overdue'].includes(b.bookingStatus) &&
          b.courierStatus !== 'returned'
      ).length;

      const unreadChats = chatsSnap.docs
        .map((d) => d.data() as ChatThread)
        .filter((c) => Boolean(c.lastSenderId && c.lastSenderId !== userProfile.uid)).length;

      const pendingMembers = membersSnap
        ? membersSnap.docs.filter((d) => d.data().role === 'user').length
        : 0;

      return {
        bookings: pendingBookings,
        inspections: inspectionQueue,
        overdueCount,
        logistics: activeLogistics,
        members: pendingMembers,
        chat: unreadChats,
        kyc: 0,
      };
    },
  });

  return data ?? EMPTY_BADGES;
}

