/** Human labels + badge tones for domain enums. Shared by server and client. */

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

interface StatusDef {
  label: string;
  tone: Tone;
}

type Dict = Record<string, StatusDef>;

export const ORDER_STATUS: Dict = {
  DRAFT: { label: "Draft", tone: "neutral" },
  NEW: { label: "New", tone: "info" },
  PREPARING: { label: "Preparing", tone: "warning" },
  READY: { label: "Ready", tone: "brand" },
  SERVED: { label: "Served", tone: "neutral" },
  COMPLETED: { label: "Completed", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
  REFUNDED: { label: "Refunded", tone: "neutral" },
};

export const PAYMENT_STATUS: Dict = {
  UNPAID: { label: "Unpaid", tone: "warning" },
  PARTIALLY_PAID: { label: "Part paid", tone: "info" },
  PAID: { label: "Paid", tone: "success" },
  PARTIALLY_REFUNDED: { label: "Part refunded", tone: "neutral" },
  REFUNDED: { label: "Refunded", tone: "neutral" },
};

export const TABLE_STATUS: Dict = {
  AVAILABLE: { label: "Available", tone: "success" },
  OCCUPIED: { label: "Occupied", tone: "brand" },
  RESERVED: { label: "Reserved", tone: "warning" },
  CLEANING: { label: "Cleaning", tone: "info" },
  BLOCKED: { label: "Blocked", tone: "neutral" },
};

export const RESERVATION_STATUS: Dict = {
  PENDING: { label: "Pending", tone: "warning" },
  CONFIRMED: { label: "Confirmed", tone: "brand" },
  SEATED: { label: "Seated", tone: "info" },
  COMPLETED: { label: "Completed", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  NO_SHOW: { label: "No-show", tone: "danger" },
};

export const RESTAURANT_STATUS: Dict = {
  ACTIVE: { label: "Active", tone: "success" },
  SUSPENDED: { label: "Suspended", tone: "danger" },
  ARCHIVED: { label: "Archived", tone: "neutral" },
};

export const SUBSCRIPTION_STATUS: Dict = {
  TRIALING: { label: "Trial", tone: "info" },
  ACTIVE: { label: "Active", tone: "success" },
  PAST_DUE: { label: "Past due", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  EXPIRED: { label: "Expired", tone: "neutral" },
};

export const MEMBER_STATUS: Dict = {
  ACTIVE: { label: "Active", tone: "success" },
  SUSPENDED: { label: "Suspended", tone: "danger" },
};

export const STAFF_STATUS: Dict = {
  ACTIVE: { label: "Active", tone: "success" },
  ON_LEAVE: { label: "On leave", tone: "warning" },
  INACTIVE: { label: "Inactive", tone: "neutral" },
};

export const ATTENDANCE_STATUS: Dict = {
  PRESENT: { label: "Present", tone: "success" },
  LATE: { label: "Late", tone: "warning" },
  HALF_DAY: { label: "Half day", tone: "info" },
  LEAVE: { label: "Leave", tone: "neutral" },
  ABSENT: { label: "Absent", tone: "danger" },
};

export const PURCHASE_STATUS: Dict = {
  DRAFT: { label: "Draft", tone: "neutral" },
  ORDERED: { label: "Ordered", tone: "info" },
  RECEIVED: { label: "Received", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
};

export const INTEGRATION_STATUS: Dict = {
  DISCONNECTED: { label: "Not connected", tone: "neutral" },
  PENDING: { label: "Pending activation", tone: "warning" },
  CONNECTED: { label: "Connected", tone: "success" },
  ERROR: { label: "Error", tone: "danger" },
};

export const EXTERNAL_ORDER_STATUS: Dict = {
  RECEIVED: { label: "Received", tone: "info" },
  IMPORTED: { label: "Imported", tone: "success" },
  REJECTED: { label: "Rejected", tone: "neutral" },
  FAILED: { label: "Failed", tone: "danger" },
};

export const ORDER_TYPE_LABEL: Record<string, string> = {
  DINE_IN: "Dine-in",
  TAKEAWAY: "Takeaway",
  DELIVERY: "Delivery",
  ONLINE: "Online",
};

export const ORDER_SOURCE_LABEL: Record<string, string> = {
  POS: "POS",
  WEBSITE: "Website",
  SWIGGY: "Swiggy",
  ZOMATO: "Zomato",
  ADMIN: "Admin",
  OTHER: "Other",
};

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  UPI: "UPI",
  WALLET: "Wallet",
  OTHER: "Other",
};

export const EXPENSE_CATEGORY_LABEL: Record<string, string> = {
  RENT: "Rent",
  SALARY: "Salary",
  UTILITIES: "Utilities",
  RAW_MATERIALS: "Raw materials",
  MAINTENANCE: "Maintenance",
  MARKETING: "Marketing",
  TRANSPORT: "Transport",
  OTHER: "Other",
};

export const FOOD_TYPE_LABEL: Record<string, string> = {
  VEG: "Veg",
  NON_VEG: "Non-veg",
  EGG: "Contains egg",
  VEGAN: "Vegan",
};

export const STOCK_TXN_LABEL: Record<string, string> = {
  OPENING: "Opening",
  PURCHASE: "Purchase",
  SALE: "Sale",
  ADJUSTMENT: "Adjustment",
  TRANSFER_IN: "Transfer in",
  TRANSFER_OUT: "Transfer out",
  WASTE: "Waste",
  RETURN: "Return",
};

export const LOYALTY_TXN: Dict = {
  EARN: { label: "Earned", tone: "success" },
  REDEEM: { label: "Redeemed", tone: "brand" },
  ADJUST: { label: "Adjusted", tone: "info" },
  EXPIRE: { label: "Expired", tone: "neutral" },
  BONUS: { label: "Bonus", tone: "warning" },
  REVERSAL: { label: "Reversed", tone: "danger" },
};

export function statusOf(dict: Dict, value: string | null | undefined): StatusDef {
  if (!value) return { label: "—", tone: "neutral" };
  return dict[value] ?? { label: value, tone: "neutral" };
}
