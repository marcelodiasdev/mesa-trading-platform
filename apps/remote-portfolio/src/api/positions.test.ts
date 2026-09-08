import { describe, expect, it } from "vitest";
import { buildPositions, type Position } from "./positions";
import type { Order, Quote } from "./schemas";

let sequence = 0;

const order = (over: Partial<Order> = {}): Order => {
  sequence += 1;
  return {
    id: `o-${sequence}`,
    accountId: "acc-1",
    ticker: "PETR4",
    side: "BUY",
    type: "LIMIT",
    status: "FILLED",
    quantity: 100,
    filledQuantity: 100,
    averagePriceCents: 38_50n,
    createdAt: `2026-09-0${sequence}T10:00:00.000Z`,
    updatedAt: `2026-09-0${sequence}T10:00:00.000Z`,
    ...over,
  };
};

const quote = (ticker: string, priceCents: bigint): Quote => ({
  ticker,
  priceCents,
  openingPriceCents: priceCents,
  changeCents: 0n,
  changeBps: 0,
  bidCents: priceCents - 1n,
  askCents: priceCents + 1n,
  at: "2026-09-08T13:00:00.000Z",
});

const quotes = (...entries: readonly Quote[]) =>
  new Map(entries.map((q) => [q.ticker, q]));

const only = (positions: readonly Position[]): Position => {
  expect(positions).toHaveLength(1);
  return positions[0]!;
};

describe("average cost", () => {
  it("is the fill price for a single purchase", () => {
    const position = only(buildPositions([order()], quotes()));
    expect(position.quantity).toBe(100);
    expect(position.averageCostCents).toBe(38_50n);
    expect(position.totalCostCents).toBe(385_000n);
  });

  it("is weighted across purchases at different prices", () => {
    const positions = buildPositions(
      [
        order({ averagePriceCents: 38_00n, quantity: 100, filledQuantity: 100 }),
        order({ averagePriceCents: 42_00n, quantity: 300, filledQuantity: 300 }),
      ],
      quotes(),
    );
    // (100 * 3800 + 300 * 4200) / 400
    expect(only(positions).averageCostCents).toBe(41_00n);
  });

  it("is unchanged by a sale", () => {
    const positions = buildPositions(
      [
        order({ averagePriceCents: 38_00n, quantity: 200, filledQuantity: 200 }),
        order({
          side: "SELL",
          averagePriceCents: 50_00n,
          quantity: 100,
          filledQuantity: 100,
        }),
      ],
      quotes(),
    );

    const position = only(positions);
    expect(position.quantity).toBe(100);
    expect(position.averageCostCents).toBe(38_00n);
  });

  it("drops a position that was fully sold", () => {
    const positions = buildPositions(
      [
        order({ quantity: 100, filledQuantity: 100 }),
        order({ side: "SELL", quantity: 100, filledQuantity: 100 }),
      ],
      quotes(),
    );
    expect(positions).toEqual([]);
  });

  it("counts a partial fill by what actually executed", () => {
    const positions = buildPositions(
      [order({ status: "PARTIALLY_FILLED", quantity: 500, filledQuantity: 200 })],
      quotes(),
    );
    expect(only(positions).quantity).toBe(200);
  });
});

describe("orders that do not move the position", () => {
  it("ignores an order still working", () => {
    expect(
      buildPositions([order({ status: "WORKING", filledQuantity: 0 })], quotes()),
    ).toEqual([]);
  });

  it("ignores a rejected order", () => {
    expect(
      buildPositions([order({ status: "REJECTED", filledQuantity: 0 })], quotes()),
    ).toEqual([]);
  });

  it("ignores a cancelled order that never filled", () => {
    expect(
      buildPositions([order({ status: "CANCELLED", filledQuantity: 0 })], quotes()),
    ).toEqual([]);
  });

  it("ignores a sale with nothing held", () => {
    const positions = buildPositions([order({ side: "SELL" })], quotes());
    expect(positions).toEqual([]);
  });
});

describe("marking to market", () => {
  it("values the position at the last price", () => {
    const positions = buildPositions([order()], quotes(quote("PETR4", 40_00n)));
    const position = only(positions);

    expect(position.lastPriceCents).toBe(40_00n);
    expect(position.marketValueCents).toBe(400_000n);
    expect(position.unrealisedCents).toBe(15_000n);
  });

  it("reports the unrealised result in basis points of cost", () => {
    const positions = buildPositions([order()], quotes(quote("PETR4", 40_00n)));
    // 15000 / 385000 = 3.896% -> 389 bps
    expect(only(positions).unrealisedBps).toBe(389);
  });

  it("reports a loss as negative", () => {
    const positions = buildPositions([order()], quotes(quote("PETR4", 30_00n)));
    const position = only(positions);

    expect(position.unrealisedCents).toBe(-85_000n);
    expect(position.unrealisedBps).toBeLessThan(0);
  });

  it("leaves the mark empty when no quote arrived", () => {
    const position = only(buildPositions([order()], quotes()));

    expect(position.lastPriceCents).toBeNull();
    expect(position.marketValueCents).toBeNull();
    expect(position.unrealisedCents).toBeNull();
    expect(position.unrealisedBps).toBeNull();
  });
});

describe("several instruments", () => {
  it("keeps them separate and sorted", () => {
    const positions = buildPositions(
      [
        order({ ticker: "VALE3", averagePriceCents: 61_00n }),
        order({ ticker: "PETR4", averagePriceCents: 38_00n }),
        order({ ticker: "ITUB4", averagePriceCents: 33_00n }),
      ],
      quotes(),
    );

    expect(positions.map((p) => p.ticker)).toEqual(["ITUB4", "PETR4", "VALE3"]);
  });

  it("does not let one instrument's sale touch another", () => {
    const positions = buildPositions(
      [
        order({ ticker: "PETR4" }),
        order({ ticker: "VALE3" }),
        order({ ticker: "VALE3", side: "SELL" }),
      ],
      quotes(),
    );

    expect(positions.map((p) => p.ticker)).toEqual(["PETR4"]);
  });
});
