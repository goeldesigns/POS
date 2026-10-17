import type { LoyaltyTxnType, OrderStatus, OrderType, PaymentStatus, ReservationStatus } from "@/generated/prisma/enums";
import type { ServiceContext } from "../auth/load-context";
import { backend, pick } from "../backend/client";
import { parseListParams, type SearchParams } from "../list-params";

const date = (value: string | null) => (value ? new Date(value) : null);
const dateOnly = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);

interface CustomerRowWire {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  tags: string[];
  totalOrders: number;
  totalSpend: number;
  aov: number;
  points: number;
  lastVisitAt: string | null;
  createdAt: string;
  birthday: string | null;
}

export async function listCustomers(_ctx: ServiceContext, sp: SearchParams) {
  const p = parseListParams(sp, { sortable: ["name", "totalSpend", "totalOrders", "lastVisitAt", "createdAt"] as const, defaultSort: "lastVisitAt" });
  const data = await backend.get<{
    rows: CustomerRowWire[];
    total: number;
    tags: string[];
    stats: { customers: number; newThisMonth: number; repeatRate: number; avgSpend: number };
  }>("/api/v1/customers", pick(sp, "q", "tag", "segment", "page", "pageSize", "sort", "dir"));
  return { params: p, total: data.total, tags: data.tags, stats: data.stats, rows: data.rows };
}

export type CustomerRow = Awaited<ReturnType<typeof listCustomers>>["rows"][number];

interface ProfileWire {
  customer: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    birthday: string | null;
    anniversary: string | null;
    tags: string[];
    totalOrders: number;
    totalSpend: number;
    lastVisitAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  addresses: { id: string; label: string | null; line1: string; line2: string | null; landmark: string | null; city: string; state: string | null; postalCode: string | null; isDefault: boolean }[];
  notes: { id: string; body: string; authorName: string; createdAt: string }[];
  loyalty: { balance: number; lifetimeEarned: number; lifetimeRedeemed: number; lifetimeExpired: number } | null;
  orders: { id: string; orderNumber: string; createdAt: string; type: OrderType; total: number; status: OrderStatus; paymentStatus: PaymentStatus; tableName: string | null; items: number }[];
  reservations: { id: string; startsAt: string; durationMinutes: number; partySize: number; status: ReservationStatus; source: string; notes: string | null; tableName: string | null }[];
  favourites: { name: string; quantity: number }[];
  loyaltyTransactions: { id: string; type: LoyaltyTxnType; points: number; balanceAfter: number; description: string; expiresAt: string | null; actorName: string | null; orderId: string | null; createdAt: string }[];
}

export async function getCustomerProfile(_ctx: ServiceContext, id: string) {
  const data = await backend.get<ProfileWire>(`/api/v1/customers/${id}`);
  const { customer } = data;
  return {
    customer: {
      ...customer,
      birthday: date(customer.birthday),
      anniversary: date(customer.anniversary),
      lastVisitAt: date(customer.lastVisitAt),
      createdAt: new Date(customer.createdAt),
      updatedAt: new Date(customer.updatedAt),
      addresses: data.addresses,
      notes: data.notes.map((n) => ({ ...n, createdAt: new Date(n.createdAt) })),
      loyalty: data.loyalty,
    },
    orders: data.orders.map(({ tableName, items, ...o }) => ({ ...o, createdAt: new Date(o.createdAt), table: tableName ? { name: tableName } : null, _count: { items } })),
    reservations: data.reservations.map(({ tableName, ...r }) => ({ ...r, startsAt: new Date(r.startsAt), table: tableName ? { name: tableName } : null })),
    favourites: data.favourites,
    loyaltyTxns: data.loyaltyTransactions.map((t) => ({ ...t, expiresAt: date(t.expiresAt), createdAt: new Date(t.createdAt) })),
  };
}

export interface CustomerInput {
  id?: string;
  name: string;
  phone: string;
  email: string | null;
  birthday: Date | null;
  anniversary: Date | null;
  tags: string;
  addressLine1: string | null;
  addressCity: string | null;
  addressPostalCode: string | null;
}

export async function saveCustomer(_ctx: ServiceContext, input: CustomerInput) {
  const { id, ...rest } = input;
  const body = { ...rest, birthday: dateOnly(input.birthday), anniversary: dateOnly(input.anniversary) };
  const saved = id ? await backend.put<{ id: string }>(`/api/v1/customers/${id}`, body) : await backend.post<{ id: string }>("/api/v1/customers", body);
  return saved.id;
}

export async function deleteCustomer(_ctx: ServiceContext, id: string) {
  await backend.delete(`/api/v1/customers/${id}`);
}

export async function addCustomerNote(_ctx: ServiceContext, customerId: string, body: string) {
  await backend.post(`/api/v1/customers/${customerId}/notes`, { body });
}

export async function importCustomers(
  _ctx: ServiceContext,
  rows: { name: string; phone: string; email?: string | null; birthday?: string | null; tags?: string | null }[],
) {
  return backend.post<{ created: number; updated: number; errors: { row: number; message: string }[]; skipped: number }>("/api/v1/customers/import", { rows });
}
