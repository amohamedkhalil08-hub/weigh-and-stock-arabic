import { describe, expect, it } from "vitest";
import { buildBackupFile, buildMovementCsv, getMovementQuantities } from "@/lib/data-exports";
import type { StockSnapshot } from "@/lib/stock-domain";

const snapshot: StockSnapshot = {
  items: [{ id: "item-1", name: "مكرونة", piecesPerBundle: 50, pieceWeightKg: 17, createdAt: "2026-11-17T08:00:00.000Z" }],
  movements: [
    { id: "in-1", itemId: "item-1", kind: "in", bundleCount: 25, piecesPerBundle: 50, totalPieces: 1250, pieceWeightKg: 17, piecesPerTon: 1000 / 17, totalTons: 21.25, note: "رصيد افتتاحي", createdAt: "2026-11-17T08:00:00.000Z" },
    { id: "out-1", itemId: "item-1", kind: "out", bundleCount: 2, piecesPerBundle: 50, totalPieces: 100, pieceWeightKg: 17, piecesPerTon: 1000 / 17, totalTons: 1.7, note: "تسليم", customer: "عميل ١", invoiceNumber: "HS-20261117-001", createdAt: "2026-11-17T09:00:00.000Z" },
    { id: "out-2", itemId: "item-1", kind: "out", bundleCount: 3, piecesPerBundle: 50, totalPieces: 150, pieceWeightKg: 17, piecesPerTon: 2, totalTons: 2.55, note: "تسليم", customer: "عميل ١", invoiceNumber: "HS-20261117-001", createdAt: "2026-11-17T09:00:00.000Z" },
  ],
};

describe("stock data exports", () => {
  it("recalculates quantities from each movement's original bundle count, pack size, and saved weight", () => {
    const inconsistent = { ...snapshot.movements[1]!, totalPieces: 1, totalTons: 999 };
    expect(getMovementQuantities(inconsistent)).toEqual({ totalPieces: 100, totalTons: 1.7 });
  });

  it("calculates the requested 10-bundle invoice fixture as 500 pieces and 12.5 tons", () => {
    const invoiceMovement = {
      id: "hs-20261118-001-line-1",
      itemId: "item-hawi",
      kind: "out" as const,
      bundleCount: 10,
      piecesPerBundle: 50,
      totalPieces: 500,
      pieceWeightKg: 25,
      piecesPerTon: 40,
      totalTons: 12.5,
      note: "",
      createdAt: "2026-11-18T00:00:00.000Z",
      invoiceNumber: "HS-20261118-001",
    };
    expect(getMovementQuantities(invoiceMovement)).toEqual({ totalPieces: 500, totalTons: 12.5 });
    expect(invoiceMovement.invoiceNumber).toBe("HS-20261118-001");
  });

  it("exports every stock movement using the requested Arabic CSV columns and UTF-8 BOM", () => {
    const csv = buildMovementCsv(snapshot);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.split("\r\n")[0]).toContain("التاريخ");
    expect(csv.split("\r\n")[0]).toContain("النوع (صادر / وارد)");
    expect(csv.split("\r\n")[0]).toContain("العميل");
    expect(csv).toContain("عميل ١");
    expect(csv).toContain("وارد");
    expect(csv).toContain("صادر");
    expect(csv.split("\r\n")).toHaveLength(4);
  });

  it("preserves original movement rows and aggregates each multi-item invoice and customer", () => {
    const backup = buildBackupFile(snapshot, "2026-11-17T10:00:00.000Z");
    expect(backup.items).toEqual(snapshot.items);
    expect(backup.movements).toEqual(snapshot.movements);
    expect(backup.invoices).toHaveLength(1);
    expect(backup.invoices[0]).toMatchObject({ invoiceNumber: "HS-20261117-001", movementIds: ["out-1", "out-2"], totalPieces: 250, totalTons: 4.25, customer: "عميل ١" });
    expect(backup.customers).toEqual([{ name: "عميل ١", movementIds: ["out-1", "out-2"] }]);
  });
});
