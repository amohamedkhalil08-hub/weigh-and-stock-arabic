import { describe, expect, it } from "vitest";

import {
  computePiecesPerTon,
  computeTotalPieces,
  computeTotalTons,
  createOpeningStockMovement,
  getItemBalance,
  normalizeStockItem,
} from "@/lib/stock-domain";

describe("stock item normalization", () => {
  it("keeps legacy records valid and defaults them to active", () => {
    expect(normalizeStockItem({ id: "legacy", name: "قديم", piecesPerBundle: 5, pieceWeightKg: 2 }, "fallback")).toMatchObject({
      id: "legacy",
      name: "قديم",
      piecesPerBundle: 5,
      pieceWeightKg: 2,
      archived: false,
    });
  });

  it("normalizes optional item details without losing them", () => {
    expect(normalizeStockItem({ id: "new", name: "حديث", piecesPerBundle: 5, pieceWeightKg: 2, size: "XL", dimensions: "20×30", barcode: "1234", note: "ملاحظة", archived: true }, "fallback")).toMatchObject({
      size: "XL",
      dimensions: "20×30",
      barcode: "1234",
      note: "ملاحظة",
      archived: true,
    });
  });
});

describe("stock weight calculations", () => {
  it("calculates pieces from 10 bundles of 50 pieces", () => {
    expect(computeTotalPieces(10, 50)).toBe(500);
  });

  it("calculates 40 pieces per ton for 25 kg pieces", () => {
    expect(computePiecesPerTon(25)).toBe(40);
  });

  it("calculates 12.5 tons for 500 pieces weighing 25 kg each", () => {
    expect(computeTotalTons(500, 25)).toBe(12.5);
  });

  it("creates an opening inbound movement for 10 bundles of 50 pieces at 25 kg each", () => {
    const item = { id: "item-1", name: "صنف اختبار", piecesPerBundle: 50, pieceWeightKg: 25, countryOfOrigin: "اليمن" as const, createdAt: "2026-11-15T00:00:00.000Z" };
    const movement = createOpeningStockMovement(item, 10, "movement-1", item.createdAt);

    expect(movement.totalPieces).toBe(500);
    expect(movement.piecesPerTon).toBe(40);
    expect(movement.totalTons).toBe(12.5);
    expect(getItemBalance(item.id, [movement])).toBe(500);
    expect(movement.note).toBe("رصيد افتتاحي");
  });
});
