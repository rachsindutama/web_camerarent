import { Timestamp } from 'firebase/firestore';

export type UserRole = 'superadmin' | 'admin' | 'user';
export type MembershipTier = 'general' | 'premium';
export type KycStatus = 'unverified' | 'pending' | 'verified' | 'rejected';
export type UnitCondition = 'mint' | 'good' | 'fair' | 'damaged';
export type UnitStatus = 'available' | 'rented' | 'maintenance';
export type LogisticsType = 'self_pickup' | 'delivery';
export type CourierStatus =
  | 'pending_dispatch'
  | 'out_for_delivery'
  | 'delivered'
  | 'pickup_scheduled'
  | 'returned';
export type BookingStatus =
  | 'pending_payment'
  | 'waiting_verification'
  | 'confirmed'
  | 'active_rent'
  | 'overdue'
  | 'completed'
  | 'cancelled';
export type PaymentStatus = 'unpaid' | 'waiting_verification' | 'paid' | 'refunded';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  address: string;
  coordinates: { lat: number; lng: number };
  deliveryRatePerKm: number;
  bufferHours: number;                 // e.g., 3 hours turnaround for charging/cleaning
  overdueGraceMinutes: number;         // e.g., 60 minutes grace period
  overdueHourlyRatePercent: number;    // e.g., 10% of dailyRate per late hour
  bankDetails: { bankName: string; accountNumber: string; accountHolder: string };
  status: 'active' | 'suspended';
  createdAt: Timestamp;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: UserRole;
  membershipTier: MembershipTier;
  tenantId: string | null;             // Required if role === 'admin'
  phone: string;
  nik?: string;                        // National ID for KYC & Global Blacklist
  kycStatus: KycStatus;
  kycDocs?: string[];                  // Firebase Storage URLs
  isBlacklisted: boolean;
  blacklistReason?: string;
  createdAt: Timestamp;
}

export interface Equipment {
  id: string;
  tenantId: string;
  name: string;
  category: 'camera' | 'lens' | 'lighting' | 'audio' | 'stabilizer' | 'accessory';
  brand: string;
  dailyRate: number;
  depositAmount: number;
  specs: Record<string, string>;
  images: string[];
  totalUnits: number;
  isActive: boolean;
}

export interface EquipmentUnit {
  id: string;
  equipmentId: string;
  tenantId: string;
  serialNumber: string;
  condition: UnitCondition;
  status: UnitStatus;
  accessoriesIncluded: string[];       // e.g., ["2x NP-FZ100 Battery", "Dual Charger", "64GB SD"]
  lastCheckedAt: Timestamp;
}

export interface Bundle {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  equipmentIds: string[];              // Catalog IDs required for this kit
  bundleDailyRate: number;
  bundleDeposit: number;
  isActive: boolean;
}

export interface BookingItem {
  unitId: string;
  equipmentId: string;
  equipmentName: string;
  serialNumber: string;
  dailyRate: number;
  bundleId?: string;
}

export interface Booking {
  id: string;
  invoiceNumber: string;               // Format: INV/YYYYMM/XXXX
  tenantId: string;
  userId: string;
  items: BookingItem[];
  startDate: Timestamp;
  endDate: Timestamp;
  bufferEndDate: Timestamp;            // endDate + tenant.bufferHours
  logisticsType: LogisticsType;
  deliveryAddress?: string;
  deliveryCoordinates?: { lat: number; lng: number };
  deliveryDistanceKm?: number;
  deliveryFee: number;
  courierName?: string;
  courierStatus?: CourierStatus;
  courierTimestamps?: Partial<Record<CourierStatus, Timestamp>>;
  preRentalChecklist?: {
    photos: string[];
    notes: string;
    confirmedByUserAt: Timestamp | null;
  };
  paidAt?: Timestamp;                  // Actual timestamp when payment verified by admin
  dispatchedAt?: Timestamp;            // Actual timestamp when gear handed over (active_rent)
  returnedAt?: Timestamp;              // Actual timestamp when gear returned & checked in
  cancelledAt?: Timestamp;             // Actual timestamp when booking cancelled
  returnNotes?: string;                // Summary of post-rental return inspection
  subtotal: number;
  discountAmount?: number;             // Membership tier rental discount (IDR)
  membershipTier?: MembershipTier;     // Snapshot of renter tier at checkout
  deposit: number;
  overdueFine: number;
  damageFine: number;
  totalAmount: number;
  paymentStatus: PaymentStatus;
  paymentProofUrl?: string;
  bookingStatus: BookingStatus;
  createdAt: Timestamp;
}

export interface DamageReport {
  id: string;
  bookingId: string;
  unitId: string;
  tenantId: string;
  reportedBy: string;                  // Admin UID
  severity: 'minor' | 'major' | 'total_loss';
  description: string;
  evidencePhotos: string[];
  repairCost: number;
  deductedFromDeposit: number;
  extraFineAmount: number;             // If repairCost > deposit
  status: 'open' | 'resolved';
  createdAt: Timestamp;
}

export interface Transaction {
  id: string;
  tenantId: string;
  bookingId?: string;
  type:
    | 'rental_income'
    | 'deposit_in'
    | 'deposit_refund'
    | 'damage_fine'
    | 'overdue_fine'
    | 'operational_expense';
  category: 'revenue' | 'liability' | 'expense'; // Strict accounting separation
  amount: number;
  paymentMethod: 'bank_transfer' | 'cash' | 'qris';
  proofUrl?: string;
  notes?: string;
  verifiedBy: string;                  // Admin UID
  createdAt: Timestamp;
}

export interface ChatThread {
  id: string;                          // Composite: `${tenantId}_${userId}`
  tenantId: string;
  userId: string;
  bookingId?: string;
  lastMessage: string;
  lastSenderId?: string;
  clearedAtByUser?: Record<string, Timestamp>;
  updatedAt: Timestamp;
}

export interface ChatReplyRef {
  messageId: string;
  senderRole: 'admin' | 'user';
  textPreview: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderRole: 'admin' | 'user';
  text?: string;
  imageUrl?: string;
  referenceBookingId?: string;
  replyTo?: ChatReplyRef;
  editedAt?: Timestamp;
  deletedForEveryone?: boolean;
  deletedAt?: Timestamp;
  deletedFor?: string[];               // UIDs that chose "Delete for Me"
  readBy?: string[];                   // UIDs that have read this message
  createdAt: Timestamp;
}

