export const PlatformRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  SUPPORT: 'SUPPORT'
} as const

export type PlatformRole = (typeof PlatformRole)[keyof typeof PlatformRole]


export const UserStatus = {
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED'
} as const

export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus]


export const RestaurantStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  ARCHIVED: 'ARCHIVED'
} as const

export type RestaurantStatus = (typeof RestaurantStatus)[keyof typeof RestaurantStatus]


export const MembershipStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED'
} as const

export type MembershipStatus = (typeof MembershipStatus)[keyof typeof MembershipStatus]


export const SessionScope = {
  PLATFORM: 'PLATFORM',
  RESTAURANT: 'RESTAURANT'
} as const

export type SessionScope = (typeof SessionScope)[keyof typeof SessionScope]


export const PermissionEffect = {
  GRANT: 'GRANT',
  DENY: 'DENY'
} as const

export type PermissionEffect = (typeof PermissionEffect)[keyof typeof PermissionEffect]


export const SubscriptionStatus = {
  TRIALING: 'TRIALING',
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED'
} as const

export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus]


export const BillingInterval = {
  MONTHLY: 'MONTHLY',
  YEARLY: 'YEARLY'
} as const

export type BillingInterval = (typeof BillingInterval)[keyof typeof BillingInterval]


export const FoodType = {
  VEG: 'VEG',
  NON_VEG: 'NON_VEG',
  EGG: 'EGG',
  VEGAN: 'VEGAN'
} as const

export type FoodType = (typeof FoodType)[keyof typeof FoodType]


export const OrderSource = {
  POS: 'POS',
  WEBSITE: 'WEBSITE',
  SWIGGY: 'SWIGGY',
  ZOMATO: 'ZOMATO',
  ADMIN: 'ADMIN',
  OTHER: 'OTHER'
} as const

export type OrderSource = (typeof OrderSource)[keyof typeof OrderSource]


export const OrderType = {
  DINE_IN: 'DINE_IN',
  TAKEAWAY: 'TAKEAWAY',
  DELIVERY: 'DELIVERY',
  ONLINE: 'ONLINE'
} as const

export type OrderType = (typeof OrderType)[keyof typeof OrderType]


export const OrderStatus = {
  DRAFT: 'DRAFT',
  NEW: 'NEW',
  PREPARING: 'PREPARING',
  READY: 'READY',
  SERVED: 'SERVED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED'
} as const

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus]


export const PaymentStatus = {
  UNPAID: 'UNPAID',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
  REFUNDED: 'REFUNDED'
} as const

export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus]


export const PaymentMethod = {
  CASH: 'CASH',
  CARD: 'CARD',
  UPI: 'UPI',
  WALLET: 'WALLET',
  OTHER: 'OTHER'
} as const

export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod]


export const PaymentKind = {
  PAYMENT: 'PAYMENT',
  REFUND: 'REFUND'
} as const

export type PaymentKind = (typeof PaymentKind)[keyof typeof PaymentKind]


export const DiscountType = {
  PERCENT: 'PERCENT',
  FLAT: 'FLAT'
} as const

export type DiscountType = (typeof DiscountType)[keyof typeof DiscountType]


export const DiscountSource = {
  MANUAL: 'MANUAL',
  COUPON: 'COUPON',
  LOYALTY: 'LOYALTY'
} as const

export type DiscountSource = (typeof DiscountSource)[keyof typeof DiscountSource]


export const TableStatus = {
  AVAILABLE: 'AVAILABLE',
  OCCUPIED: 'OCCUPIED',
  RESERVED: 'RESERVED',
  CLEANING: 'CLEANING',
  BLOCKED: 'BLOCKED'
} as const

export type TableStatus = (typeof TableStatus)[keyof typeof TableStatus]


export const TableShape = {
  SQUARE: 'SQUARE',
  ROUND: 'ROUND',
  RECTANGLE: 'RECTANGLE'
} as const

export type TableShape = (typeof TableShape)[keyof typeof TableShape]


export const ReservationStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  SEATED: 'SEATED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW'
} as const

export type ReservationStatus = (typeof ReservationStatus)[keyof typeof ReservationStatus]


export const ExpenseCategory = {
  RENT: 'RENT',
  SALARY: 'SALARY',
  UTILITIES: 'UTILITIES',
  RAW_MATERIALS: 'RAW_MATERIALS',
  MAINTENANCE: 'MAINTENANCE',
  MARKETING: 'MARKETING',
  TRANSPORT: 'TRANSPORT',
  OTHER: 'OTHER'
} as const

export type ExpenseCategory = (typeof ExpenseCategory)[keyof typeof ExpenseCategory]


export const StaffStatus = {
  ACTIVE: 'ACTIVE',
  ON_LEAVE: 'ON_LEAVE',
  INACTIVE: 'INACTIVE'
} as const

export type StaffStatus = (typeof StaffStatus)[keyof typeof StaffStatus]


export const AttendanceStatus = {
  PRESENT: 'PRESENT',
  ABSENT: 'ABSENT',
  LATE: 'LATE',
  HALF_DAY: 'HALF_DAY',
  LEAVE: 'LEAVE'
} as const

export type AttendanceStatus = (typeof AttendanceStatus)[keyof typeof AttendanceStatus]


export const StockUnit = {
  KG: 'KG',
  G: 'G',
  LTR: 'LTR',
  ML: 'ML',
  PCS: 'PCS',
  BOX: 'BOX',
  PACK: 'PACK'
} as const

export type StockUnit = (typeof StockUnit)[keyof typeof StockUnit]


export const StockTxnType = {
  OPENING: 'OPENING',
  PURCHASE: 'PURCHASE',
  SALE: 'SALE',
  ADJUSTMENT: 'ADJUSTMENT',
  TRANSFER_IN: 'TRANSFER_IN',
  TRANSFER_OUT: 'TRANSFER_OUT',
  WASTE: 'WASTE',
  RETURN: 'RETURN'
} as const

export type StockTxnType = (typeof StockTxnType)[keyof typeof StockTxnType]


export const PurchaseStatus = {
  DRAFT: 'DRAFT',
  ORDERED: 'ORDERED',
  RECEIVED: 'RECEIVED',
  CANCELLED: 'CANCELLED'
} as const

export type PurchaseStatus = (typeof PurchaseStatus)[keyof typeof PurchaseStatus]


export const LoyaltyTxnType = {
  EARN: 'EARN',
  REDEEM: 'REDEEM',
  ADJUST: 'ADJUST',
  EXPIRE: 'EXPIRE',
  BONUS: 'BONUS',
  REVERSAL: 'REVERSAL'
} as const

export type LoyaltyTxnType = (typeof LoyaltyTxnType)[keyof typeof LoyaltyTxnType]


export const IntegrationProvider = {
  SWIGGY: 'SWIGGY',
  ZOMATO: 'ZOMATO'
} as const

export type IntegrationProvider = (typeof IntegrationProvider)[keyof typeof IntegrationProvider]


export const IntegrationStatus = {
  DISCONNECTED: 'DISCONNECTED',
  PENDING: 'PENDING',
  CONNECTED: 'CONNECTED',
  ERROR: 'ERROR'
} as const

export type IntegrationStatus = (typeof IntegrationStatus)[keyof typeof IntegrationStatus]


export const ExternalOrderStatus = {
  RECEIVED: 'RECEIVED',
  IMPORTED: 'IMPORTED',
  REJECTED: 'REJECTED',
  FAILED: 'FAILED'
} as const

export type ExternalOrderStatus = (typeof ExternalOrderStatus)[keyof typeof ExternalOrderStatus]


export const AuditScope = {
  PLATFORM: 'PLATFORM',
  RESTAURANT: 'RESTAURANT'
} as const

export type AuditScope = (typeof AuditScope)[keyof typeof AuditScope]


export const DemoStatus = {
  NEW: 'NEW',
  CONFIRMED: 'CONFIRMED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW'
} as const

export type DemoStatus = (typeof DemoStatus)[keyof typeof DemoStatus]
