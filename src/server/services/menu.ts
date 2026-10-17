import type { FoodType } from "@/generated/prisma/enums";
import type { ServiceContext } from "../auth/load-context";
import { backend, pick } from "../backend/client";
import { parseListParams, type SearchParams } from "../list-params";

interface ProductRowWire {
  id: string;
  name: string;
  sku: string;
  imageUrl: string | null;
  category: string;
  categoryColor: string | null;
  price: number;
  fromPrice: number | null;
  foodType: FoodType;
  isActive: boolean;
  isAvailable: boolean;
  isBestseller: boolean;
  isCombo: boolean;
  hasRecipe: boolean;
  sold30d: number;
  updatedAt: string;
}

export async function listProducts(_ctx: ServiceContext, sp: SearchParams) {
  const p = parseListParams(sp, { sortable: ["name", "price", "updatedAt"] as const, defaultSort: "name", defaultDir: "asc", defaultPageSize: 50 });
  const data = await backend.get<{ rows: ProductRowWire[]; total: number }>(
    "/api/v1/menu/products",
    pick(sp, "q", "category", "availability", "food", "kind", "page", "pageSize", "sort", "dir"),
  );
  return { total: data.total, params: p, rows: data.rows };
}

export type ProductRow = Awaited<ReturnType<typeof listProducts>>["rows"][number];

interface EditorWire {
  categories: { id: string; name: string }[];
  taxRates: { id: string; name: string; rate: number; isDefault: boolean }[];
  modifierGroups: { id: string; name: string; minSelect: number; maxSelect: number; modifiers: { name: string; price: number }[] }[];
  comboCandidates: { id: string; name: string; price: number }[];
  kitchenStations: string[];
  product: {
    id: string;
    name: string;
    sku: string;
    categoryId: string;
    taxRateId: string | null;
    description: string | null;
    price: number;
    costPrice: number | null;
    imageUrl: string | null;
    foodType: FoodType;
    isActive: boolean;
    isAvailable: boolean;
    isFeatured: boolean;
    isBestseller: boolean;
    isSpicy: boolean;
    isCombo: boolean;
    trackStock: boolean;
    preparationTime: number | null;
    barcode: string | null;
    kitchenStation: string | null;
    hasRecipe: boolean;
    variants: { id: string; name: string; price: number; isDefault: boolean }[];
    modifierGroupIds: string[];
    comboItems: { productId: string; quantity: number }[];
  } | null;
}

export async function getProductEditorData(_ctx: ServiceContext, id: string | null) {
  const { product, ...rest } = await backend.get<EditorWire>("/api/v1/menu/editor", { productId: id });
  return {
    ...rest,
    product: product
      ? {
          ...product,
          modifierGroups: product.modifierGroupIds.map((modifierGroupId) => ({ modifierGroupId })),
          recipe: product.hasRecipe ? { id: "" } : null,
        }
      : null,
  };
}

export interface ProductInput {
  id?: string;
  name: string;
  sku: string;
  categoryId: string;
  description: string | null;
  price: number;
  costPrice: number | null;
  imageUrl: string | null;
  taxRateId: string | null;
  foodType: "VEG" | "NON_VEG" | "EGG" | "VEGAN";
  isActive: boolean;
  isAvailable: boolean;
  isFeatured: boolean;
  isBestseller: boolean;
  isSpicy: boolean;
  trackStock: boolean;
  preparationTime: number | null;
  barcode: string | null;
  kitchenStation: string | null;
  variants: { id?: string; name: string; price: number; isDefault: boolean }[];
  modifierGroupIds: string[];
  isCombo: boolean;
  comboItems: { productId: string; quantity: number }[];
}

export async function saveProduct(_ctx: ServiceContext, input: ProductInput) {
  const { id, ...body } = input;
  const saved = id ? await backend.put<{ id: string }>(`/api/v1/menu/products/${id}`, body) : await backend.post<{ id: string }>("/api/v1/menu/products", body);
  return saved.id;
}

export async function toggleProductFlag(_ctx: ServiceContext, id: string, field: "isActive" | "isAvailable" | "isFeatured" | "isBestseller", value: boolean) {
  await backend.put(`/api/v1/menu/products/${id}/flag`, { field, value });
}

export async function deleteProduct(_ctx: ServiceContext, id: string) {
  await backend.delete(`/api/v1/menu/products/${id}`);
}

export async function listCategories(_ctx: ServiceContext) {
  return backend.get<{ id: string; name: string; description: string | null; color: string | null; sortOrder: number; isActive: boolean; products: number }[]>("/api/v1/menu/categories");
}

export async function saveCategory(_ctx: ServiceContext, input: { id?: string; name: string; description: string | null; color: string | null; sortOrder: number; isActive: boolean }) {
  const { id, ...body } = input;
  const saved = id ? await backend.put<{ id: string }>(`/api/v1/menu/categories/${id}`, body) : await backend.post<{ id: string }>("/api/v1/menu/categories", body);
  return saved.id;
}

export async function deleteCategory(_ctx: ServiceContext, id: string) {
  await backend.delete(`/api/v1/menu/categories/${id}`);
}

export async function listModifierGroups(_ctx: ServiceContext) {
  return backend.get<{ id: string; name: string; minSelect: number; maxSelect: number; products: number; modifiers: { id: string; name: string; price: number; isActive: boolean }[] }[]>(
    "/api/v1/menu/modifier-groups",
  );
}

export async function saveModifierGroup(
  _ctx: ServiceContext,
  input: { id?: string; name: string; minSelect: number; maxSelect: number; modifiers: { id?: string; name: string; price: number; isActive: boolean }[] },
) {
  const { id, ...body } = input;
  const saved = id ? await backend.put<{ id: string }>(`/api/v1/menu/modifier-groups/${id}`, body) : await backend.post<{ id: string }>("/api/v1/menu/modifier-groups", body);
  return saved.id;
}

export async function deleteModifierGroup(_ctx: ServiceContext, id: string) {
  await backend.delete(`/api/v1/menu/modifier-groups/${id}`);
}
