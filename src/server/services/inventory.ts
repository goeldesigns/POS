import type { PurchaseStatus, StockTxnType, StockUnit } from "@/lib/enums";
import type { ServiceContext } from "../auth/load-context";
import { backend, pick } from "../backend/client";
import { parseListParams, type SearchParams } from "../list-params";

const dateOnly = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);

export async function inventoryOverview(_ctx: ServiceContext) {
  return backend.get<{
    stats: { total: number; low: number; out: number; value: number; expiring: number };
    lowItems: { id: string; name: string; stock: number; min: number; unit: StockUnit; supplier: string | null }[];
    expiringItems: { id: string; name: string; stock: number; unit: StockUnit; expiryDate: string }[];
    valueByCategory: { label: string; value: number }[];
    recent: {
      id: string;
      name: string;
      unit: StockUnit;
      type: StockTxnType;
      quantity: number;
      reference: string | null;
      reason: string | null;
      actorName: string | null;
      createdAt: string;
    }[];
  }>("/api/v1/inventory/overview");
}

interface IngredientRowWire {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: StockUnit;
  currentStock: number;
  minStock: number;
  maxStock: number | null;
  costPerUnit: number;
  value: number;
  supplier: { id: string; name: string } | null;
  expiryDate: string | null;
  storageLocation: string | null;
  isActive: boolean;
  state: "out" | "low" | "over" | "ok";
  expiringSoon: boolean;
}

export async function listIngredients(_ctx: ServiceContext, sp: SearchParams) {
  const p = parseListParams(sp, { sortable: ["name", "currentStock", "updatedAt"] as const, defaultSort: "name", defaultDir: "asc", defaultPageSize: 50 });
  const data = await backend.get<{ rows: IngredientRowWire[]; total: number; categories: string[] }>(
    "/api/v1/inventory",
    pick(sp, "q", "category", "filter", "archived", "page", "pageSize", "sort", "dir"),
  );
  return { params: p, total: data.total, categories: data.categories, rows: data.rows };
}

export type IngredientRow = Awaited<ReturnType<typeof listIngredients>>["rows"][number];

export interface IngredientInput {
  id?: string;
  name: string;
  sku: string;
  category: string;
  unit: StockUnit;
  minStock: number;
  maxStock: number | null;
  costPerUnit: number;
  supplierId: string | null;
  expiryDate: Date | null;
  storageLocation: string | null;
  openingStock: number | null;
  isActive: boolean;
}

export async function saveIngredient(_ctx: ServiceContext, input: IngredientInput) {
  const { id, ...rest } = input;
  const body = { ...rest, expiryDate: dateOnly(input.expiryDate) };
  const saved = id ? await backend.put<{ id: string }>(`/api/v1/inventory/ingredients/${id}`, body) : await backend.post<{ id: string }>("/api/v1/inventory/ingredients", body);
  return saved.id;
}

export async function deleteIngredient(_ctx: ServiceContext, id: string) {
  return (await backend.delete<{ result: "archived" | "deleted" }>(`/api/v1/inventory/ingredients/${id}`)).result;
}

export async function recordMovement(
  _ctx: ServiceContext,
  input: { ingredientId: string; type: "ADD" | "ADJUST" | "TRANSFER_OUT" | "TRANSFER_IN"; quantity: number; unitCost?: number | null; reason: string | null; counterparty: string | null },
) {
  return backend.post<{ balance: number }>("/api/v1/inventory/movements", input);
}

export async function recordWaste(_ctx: ServiceContext, input: { ingredientId: string; quantity: number; unit: StockUnit; reason: string; notes: string | null }) {
  await backend.post("/api/v1/inventory/waste", input);
}

export async function listMovements(_ctx: ServiceContext, sp: SearchParams) {
  const p = parseListParams(sp, { sortable: ["createdAt"] as const, defaultSort: "createdAt", defaultPageSize: 50 });
  const data = await backend.get<{
    rows: {
      id: string;
      createdAt: string;
      ingredient: string;
      sku: string;
      unit: StockUnit;
      type: StockTxnType;
      quantity: number;
      balanceAfter: number;
      value: number;
      reference: string | null;
      reason: string | null;
      counterparty: string | null;
      actorName: string | null;
    }[];
    total: number;
  }>("/api/v1/inventory/movements", pick(sp, "q", "type", "ingredient", "page", "pageSize"));
  return { params: p, total: data.total, rows: data.rows };
}

export async function listWaste(_ctx: ServiceContext, sp: SearchParams) {
  const p = parseListParams(sp, { sortable: ["createdAt", "cost"] as const, defaultSort: "createdAt", defaultPageSize: 50 });
  const data = await backend.get<{
    rows: { id: string; createdAt: string; ingredient: string; quantity: number; unit: StockUnit; reason: string; cost: number; notes: string | null; recordedBy: string | null }[];
    total: number;
    last30: number;
  }>("/api/v1/inventory/waste", pick(sp, "page", "pageSize", "sort", "dir"));
  return { params: p, total: data.total, last30: data.last30, rows: data.rows };
}

interface SupplierWire {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  gstNumber: string | null;
  paymentTerms: string | null;
  notes: string | null;
  isActive: boolean;
  ingredients: number;
  purchased: number;
  lastPurchase: string | null;
}

export async function listSuppliers(_ctx: ServiceContext): Promise<SupplierWire[]> {
  return backend.get<SupplierWire[]>("/api/v1/inventory/suppliers");
}

export type SupplierRow = Awaited<ReturnType<typeof listSuppliers>>[number];

export async function saveSupplier(
  _ctx: ServiceContext,
  input: { id?: string; name: string; contactPerson: string | null; phone: string | null; email: string | null; address: string | null; gstNumber: string | null; paymentTerms: string | null; notes: string | null; isActive: boolean },
) {
  const { id, ...body } = input;
  const saved = id ? await backend.put<{ id: string }>(`/api/v1/inventory/suppliers/${id}`, body) : await backend.post<{ id: string }>("/api/v1/inventory/suppliers", body);
  return saved.id;
}

export async function deleteSupplier(_ctx: ServiceContext, id: string) {
  return (await backend.delete<{ result: "archived" | "deleted" }>(`/api/v1/inventory/suppliers/${id}`)).result;
}

interface PurchaseWire {
  id: string;
  reference: string;
  invoiceNumber: string | null;
  supplierId: string | null;
  supplier: string | null;
  status: PurchaseStatus;
  subtotal: number;
  taxAmount: number;
  total: number;
  notes: string | null;
  createdAt: string;
  receivedAt: string | null;
  items: { ingredientId: string; name: string; unit: StockUnit; quantity: number; unitCost: number; total: number }[];
}

export async function listPurchases(_ctx: ServiceContext, sp: SearchParams) {
  const p = parseListParams(sp, { sortable: ["createdAt", "total"] as const, defaultSort: "createdAt", defaultPageSize: 20 });
  const data = await backend.get<{ rows: PurchaseWire[]; total: number }>("/api/v1/inventory/purchases", pick(sp, "status", "page", "pageSize", "sort", "dir"));
  return { params: p, total: data.total, rows: data.rows };
}

export type PurchaseRow = Awaited<ReturnType<typeof listPurchases>>["rows"][number];

export async function savePurchase(
  _ctx: ServiceContext,
  input: { id?: string; supplierId: string | null; invoiceNumber: string | null; status: "DRAFT" | "ORDERED" | "RECEIVED"; notes: string | null; taxAmount: number; items: { ingredientId: string; quantity: number; unitCost: number }[] },
) {
  const { id, ...body } = input;
  const saved = id ? await backend.put<{ id: string }>(`/api/v1/inventory/purchases/${id}`, body) : await backend.post<{ id: string }>("/api/v1/inventory/purchases", body);
  return saved.id;
}

export async function receivePurchase(_ctx: ServiceContext, id: string) {
  await backend.post(`/api/v1/inventory/purchases/${id}/receive`);
}

export async function cancelPurchase(_ctx: ServiceContext, id: string) {
  await backend.post(`/api/v1/inventory/purchases/${id}/cancel`);
}

export async function listInventoryOptions(ctx: ServiceContext) {
  const suppliers = (await listSuppliers(ctx)).filter((s) => s.isActive).map((s) => ({ id: s.id, name: s.name }));
  const ingredients: { id: string; name: string; unit: StockUnit; costPerUnit: number; currentStock: number; supplierId: string | null }[] = [];
  for (let page = 1; ; page++) {
    const data = await backend.get<{ rows: IngredientRowWire[]; total: number }>("/api/v1/inventory", { page, pageSize: 100, sort: "name", dir: "asc" });
    for (const i of data.rows) ingredients.push({ id: i.id, name: i.name, unit: i.unit, costPerUnit: i.costPerUnit, currentStock: i.currentStock, supplierId: i.supplier?.id ?? null });
    if (ingredients.length >= data.total || data.rows.length === 0) break;
  }
  return { suppliers, ingredients };
}
