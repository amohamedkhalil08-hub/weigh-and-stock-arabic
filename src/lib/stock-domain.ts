export type StockItem = {
  id: string;
  name: string;
  bundleCount?: number;
  piecesPerBundle: number;
  pieceWeightKg: number;
  createdAt: string;
  countryOfOrigin?: CountryOfOrigin;
};

export type CountryOfOrigin = "اليمن" | "السعودية" | "الصين";

export type MovementKind = "in" | "out";

export type StockMovement = {
  id: string;
  itemId: string;
  kind: MovementKind;
  bundleCount: number;
  piecesPerBundle: number;
  totalPieces: number;
  pieceWeightKg: number;
  piecesPerTon: number;
  totalTons: number;
  note: string;
  createdAt: string;
  customer?: string;
  invoiceNumber?: string;
};

export type StockSnapshot = {
  items: StockItem[];
  movements: StockMovement[];
};

export type StockBackup = {
  id: string;
  createdAt: string;
  reason: string;
  snapshot: StockSnapshot;
};

function recordOf(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function numberOrZero(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function normalizeStockItem(value: unknown, fallbackId: string): StockItem {
  const record = recordOf(value);
  return {
    ...record,
    id: typeof record["id"] === "string" && record["id"] ? record["id"] : fallbackId,
    name: typeof record["name"] === "string" ? record["name"] : "",
    ...(Number.isFinite(Number(record["bundleCount"])) && Number(record["bundleCount"]) > 0
      ? { bundleCount: Number(record["bundleCount"]) }
      : {}),
    piecesPerBundle: numberOrZero(record["piecesPerBundle"]),
    pieceWeightKg: numberOrZero(record["pieceWeightKg"]),
    createdAt:
      typeof record["createdAt"] === "string" ? record["createdAt"] : new Date(0).toISOString(),
  } as StockItem;
}

export function normalizeStockMovement(value: unknown, fallbackId: string): StockMovement {
  const record = recordOf(value);
  return {
    ...record,
    id: typeof record["id"] === "string" && record["id"] ? record["id"] : fallbackId,
    itemId: typeof record["itemId"] === "string" ? record["itemId"] : "",
    kind: record["kind"] === "out" ? "out" : "in",
    bundleCount: numberOrZero(record["bundleCount"]),
    piecesPerBundle: numberOrZero(record["piecesPerBundle"]),
    totalPieces: numberOrZero(record["totalPieces"]),
    pieceWeightKg: numberOrZero(record["pieceWeightKg"]),
    piecesPerTon: numberOrZero(record["piecesPerTon"]),
    totalTons: numberOrZero(record["totalTons"]),
    note: typeof record["note"] === "string" ? record["note"] : "",
    createdAt:
      typeof record["createdAt"] === "string" ? record["createdAt"] : new Date(0).toISOString(),
    ...(typeof record["customer"] === "string" && { customer: record["customer"] }),
    ...(typeof record["invoiceNumber"] === "string" && { invoiceNumber: record["invoiceNumber"] }),
  } as StockMovement;
}

export function computeTotalPieces(bundleCount: number, piecesPerBundle: number) {
  return bundleCount * piecesPerBundle;
}

export function computePiecesPerTon(pieceWeightKg: number) {
  return pieceWeightKg > 0 ? 1000 / pieceWeightKg : 0;
}

export function computeTotalTons(totalPieces: number, pieceWeightKg: number) {
  const piecesPerTon = computePiecesPerTon(pieceWeightKg);
  return piecesPerTon > 0 ? totalPieces / piecesPerTon : 0;
}

export function createOpeningStockMovement(
  item: StockItem,
  bundleCount: number,
  id: string,
  createdAt: string,
): StockMovement {
  const totalPieces = computeTotalPieces(bundleCount, item.piecesPerBundle);
  return {
    id,
    itemId: item.id,
    kind: "in",
    bundleCount,
    piecesPerBundle: item.piecesPerBundle,
    totalPieces,
    pieceWeightKg: item.pieceWeightKg,
    piecesPerTon: computePiecesPerTon(item.pieceWeightKg),
    totalTons: computeTotalTons(totalPieces, item.pieceWeightKg),
    note: "رصيد افتتاحي",
    createdAt,
  };
}

export function getItemBalance(itemId: string, movements: StockMovement[]) {
  return movements.reduce(
    (balance, movement) =>
      movement.itemId === itemId
        ? balance + (movement.kind === "in" ? movement.totalPieces : -movement.totalPieces)
        : balance,
    0,
  );
}
