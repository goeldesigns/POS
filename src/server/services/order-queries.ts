import type { OrderSource, OrderStatus, OrderType, PaymentMethod, PaymentStatus } from "@/generated/prisma/enums";
import type { ServiceContext } from "../auth/load-context";
import { backend, pick } from "../backend/client";
import { parseListParams, param, type SearchParams } from "../list-params";

export const ORDER_TABS = ["ALL", "NEW", "PREPARING", "READY", "SERVED", "COMPLETED", "CANCELLED", "REFUNDED", "DRAFT"] as const;
export type OrderTab = (typeof ORDER_TABS)[number];

const SORTABLE = ["createdAt", "total", "number"] as const;

interface OrderRowWire {
  id: string;
  orderNumber: string;
  createdAt: string;
  customerName: string | null;
  customerPhone: string | null;
  tableName: string | null;
  type: OrderType;
  source: OrderSource;
  items: number;
  total: number;
  paymentStatus: PaymentStatus;
  paymentMethods: PaymentMethod[];
  status: OrderStatus;
  staff: string | null;
  externalRef: string | null;
}

export async function listOrders(_ctx: ServiceContext, sp: SearchParams, _tz: string) {
  const tab = (ORDER_TABS as readonly string[]).includes(param(sp, "tab") ?? "") ? (param(sp, "tab") as OrderTab) : "ALL";
  const p = parseListParams(sp, { sortable: SORTABLE, defaultSort: "createdAt" });
  const data = await backend.get<{ rows: OrderRowWire[]; total: number; tabCounts: Record<OrderTab, number> }>(
    "/api/v1/orders",
    pick(sp, "q", "tab", "type", "source", "payment", "staff", "period", "page", "pageSize", "sort", "dir"),
  );
  return { tab, params: p, total: data.total, tabCounts: data.tabCounts, rows: data.rows };
}

export type OrderRow = Awaited<ReturnType<typeof listOrders>>["rows"][number];

interface KitchenOrderWire {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  type: OrderType;
  source: OrderSource;
  placedAt: string;
  createdAt: string;
  notes: string | null;
  guests: number | null;
  customerName: string | null;
  tableName: string | null;
  items: {
    id: string;
    name: string;
    variantName: string | null;
    quantity: number;
    modifiers: string[];
    notes: string | null;
    kitchenStation: string | null;
    served: boolean;
    added: boolean;
  }[];
}

export async function kitchenBoard(_ctx: ServiceContext): Promise<KitchenOrderWire[]> {
  return backend.get<KitchenOrderWire[]>("/api/v1/orders/kitchen");
}

export type KitchenOrder = Awaited<ReturnType<typeof kitchenBoard>>[number];
