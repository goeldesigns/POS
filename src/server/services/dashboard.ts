import type { OrderStatus, OrderType, PaymentStatus, ReservationStatus } from "@/lib/enums";
import type { ServiceContext } from "../auth/load-context";
import { backend } from "../backend/client";
import type { PeriodPreset } from "../time";

type OverviewPreset = Extract<PeriodPreset, "today" | "week" | "month">;

interface Delta {
  value: number;
  delta: number | null;
}

interface Wire {
  range: { label: string; compareLabel: string };
  kpis: {
    sales: Delta;
    orders: Delta & { diff: number };
    customers: Delta & { newCount: number; prevNew: number };
    due: { value: number; openOrders: number; openTables: number };
  };
  metrics: { aov: Delta; online: Delta; dineIn: Delta; takeaway: Delta; delivery: Delta };
  pipeline: {
    newOrders: number;
    preparing: number;
    ready: number;
    served: number;
    completed: number;
    cancelled: number;
    refunded: number;
    avgPrepMinutes: number | null;
  };
  trend: { label: string; current: number | null; previous: number }[];
  trendLabels: { current: string; previous: string };
  revenueByHour: { label: string; revenue: number; orders: number; peak: boolean }[];
  orderTypes: { label: string; value: number }[];
  topProducts: { name: string; quantity: number; revenue: number }[];
  categories: { name: string; revenue: number; quantity: number }[];
  payments: { method: string; amount: number; count: number }[];
  lowStock: { id: string; name: string; currentStock: number; minStock: number; unit: string }[] | null;
  recentOrders: {
    id: string;
    orderNumber: string;
    createdAt: string;
    total: number;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    type: OrderType;
    customerName: string | null;
    tableName: string | null;
    items: number;
  }[];
  reservations: { id: string; customerName: string; partySize: number; startsAt: string; status: ReservationStatus; tableName: string | null }[] | null;
}

export async function getOverview(_ctx: ServiceContext & { restaurant: { timezone: string } }, preset: OverviewPreset) {
  const data = await backend.get<Wire>("/api/v1/dashboard", { period: preset });
  const { pipeline, recentOrders, reservations } = data;
  return {
    ...data,
    pipeline: {
      new: pipeline.newOrders,
      preparing: pipeline.preparing,
      ready: pipeline.ready,
      served: pipeline.served,
      completed: pipeline.completed,
      cancelled: pipeline.cancelled,
      refunded: pipeline.refunded,
      avgPrepMinutes: pipeline.avgPrepMinutes,
    },
    recentOrders: recentOrders.map(({ tableName, items, ...order }) => ({
      ...order,
      createdAt: new Date(order.createdAt),
      table: tableName ? { name: tableName } : null,
      _count: { items },
    })),
    reservations: reservations?.map(({ tableName, ...reservation }) => ({ ...reservation, startsAt: new Date(reservation.startsAt), table: tableName ? { name: tableName } : null })) ?? null,
  };
}

export type OverviewData = Awaited<ReturnType<typeof getOverview>>;
