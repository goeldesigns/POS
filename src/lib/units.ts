import type { StockUnit } from "@/lib/enums";

export const STOCK_UNITS: StockUnit[] = ["KG", "G", "LTR", "ML", "PCS", "BOX", "PACK"];

export const UNIT_LABELS: Record<StockUnit, string> = {
  KG: "kg",
  G: "g",
  LTR: "ltr",
  ML: "ml",
  PCS: "pcs",
  BOX: "box",
  PACK: "pack",
};

const DIMENSION: Record<StockUnit, { family: string; factor: number }> = {
  KG: { family: "mass", factor: 1000 },
  G: { family: "mass", factor: 1 },
  LTR: { family: "volume", factor: 1000 },
  ML: { family: "volume", factor: 1 },
  PCS: { family: "pcs", factor: 1 },
  BOX: { family: "box", factor: 1 },
  PACK: { family: "pack", factor: 1 },
};

export function unitsCompatible(a: StockUnit, b: StockUnit): boolean {
  return DIMENSION[a].family === DIMENSION[b].family;
}

/** Units a recipe line may use for an ingredient stocked in `unit`. */
export function compatibleUnits(unit: StockUnit): StockUnit[] {
  return STOCK_UNITS.filter((u) => unitsCompatible(u, unit));
}

/**
 * Convert a quantity between units of the same family (kg↔g, ltr↔ml).
 * Throws for incompatible units so mistakes surface instead of silently
 * corrupting stock.
 */
export function convertQuantity(quantity: number, from: StockUnit, to: StockUnit): number {
  if (from === to) return quantity;
  const a = DIMENSION[from];
  const b = DIMENSION[to];
  if (a.family !== b.family) {
    throw new Error(`Cannot convert ${UNIT_LABELS[from]} to ${UNIT_LABELS[to]}`);
  }
  return (quantity * a.factor) / b.factor;
}

export function roundQty(value: number): number {
  return Math.round(value * 1000) / 1000;
}
