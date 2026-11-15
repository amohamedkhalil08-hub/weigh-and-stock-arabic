export type StockItem = {
  id: string;
  name: string;
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
  invoiceNumber?: string;
};

export type StockSnapshot = {
  items: StockItem[];
  movements: StockMovement[];
};

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

export function createOpeningStockMovement(item: StockItem, bundleCount: number, id: string, createdAt: string): StockMovement {
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