import { describe, expect, it } from "vitest";
import { assessRisk, estimateNotional, type RiskInput } from "./risk.ts";

const base: RiskInput = {
  side: "BUY",
  type: "LIMIT",
  quantity: 100,
  referencePriceCents: 38_50n,
  buyingPowerCents: 1_000_000n,
  equityCents: 10_000_000n,
  heldQuantity: 0,
};

describe("notional", () => {
  it("is price times quantity for a priced order", () => {
    expect(estimateNotional(base)).toBe(385_000n);
  });

  it("pads a market order to leave room for the spread", () => {
    const padded = estimateNotional({ ...base, type: "MARKET" });
    expect(padded).toBeGreaterThan(385_000n);
    expect(padded).toBe(396_550n);
  });

  it("rounds the padding up, so the reservation is never short", () => {
    const odd = estimateNotional({
      ...base,
      type: "MARKET",
      referencePriceCents: 1n,
      quantity: 1,
    });
    expect(odd).toBe(2n);
  });
});

describe("buying power", () => {
  it("accepts an order the account can pay for", () => {
    expect(assessRisk({ ...base, buyingPowerCents: 385_000n }).accepted).toBe(true);
  });

  it("rejects an order one cent beyond the balance", () => {
    const decision = assessRisk({ ...base, buyingPowerCents: 384_999n });
    expect(decision.accepted).toBe(false);
    expect(decision.rejection?.code).toBe("INSUFFICIENT_BUYING_POWER");
  });

  it("reports both sides of the shortfall, so the message can be useful", () => {
    const decision = assessRisk({ ...base, buyingPowerCents: 100_000n });
    expect(decision.rejection).toMatchObject({
      code: "INSUFFICIENT_BUYING_POWER",
      requiredCents: 385_000n,
      availableCents: 100_000n,
    });
  });
});

describe("short selling is not allowed", () => {
  it("rejects a sale of more than the account holds", () => {
    const decision = assessRisk({
      ...base,
      side: "SELL",
      quantity: 200,
      heldQuantity: 100,
    });
    expect(decision.rejection).toMatchObject({
      code: "INSUFFICIENT_POSITION",
      requestedQuantity: 200,
      heldQuantity: 100,
    });
  });

  it("accepts a sale fully covered by the position", () => {
    expect(
      assessRisk({ ...base, side: "SELL", quantity: 100, heldQuantity: 100 }).accepted,
    ).toBe(true);
  });

  it("does not consult buying power on a sale", () => {
    const decision = assessRisk({
      ...base,
      side: "SELL",
      quantity: 100,
      heldQuantity: 100,
      buyingPowerCents: 0n,
    });
    expect(decision.accepted).toBe(true);
  });
});

describe("concentration limit", () => {
  it("rejects an order above the configured share of equity", () => {
    const decision = assessRisk(
      { ...base, buyingPowerCents: 10_000_000n, equityCents: 1_000_000n },
      { maxSingleOrderBps: 2_500 },
    );
    expect(decision.rejection?.code).toBe("EXPOSURE_LIMIT_EXCEEDED");
  });

  it("accepts an order exactly at the limit", () => {
    const decision = assessRisk(
      {
        ...base,
        quantity: 100,
        referencePriceCents: 25_00n,
        buyingPowerCents: 10_000_000n,
        equityCents: 1_000_000n,
      },
      { maxSingleOrderBps: 2_500 },
    );
    expect(decision.accepted).toBe(true);
  });

  it("checks buying power before concentration, since that is the harder failure", () => {
    const decision = assessRisk(
      { ...base, buyingPowerCents: 1_000n, equityCents: 1_000n },
      { maxSingleOrderBps: 1 },
    );
    expect(decision.rejection?.code).toBe("INSUFFICIENT_BUYING_POWER");
  });

  it("skips the limit for an account with no equity yet", () => {
    const decision = assessRisk({ ...base, equityCents: 0n, buyingPowerCents: 385_000n });
    expect(decision.accepted).toBe(true);
  });
});
