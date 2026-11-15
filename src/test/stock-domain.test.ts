import { describe, expect, it } from "vitest";

import {
  computePiecesPerTon,
  computeTotalPieces,
  computeTotalTons,
} from "@/lib/stock-domain";

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
});