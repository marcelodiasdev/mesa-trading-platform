import { describe, expect, it } from "vitest";
import type { OrderStatus } from "./order";
import {
  IllegalTransitionError,
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  PlaceOrderInputSchema,
  canTransition,
  isTerminal,
  transition,
} from "./order";
import { CentsSchema, TickerSchema, centsToWire } from "./primitives";

const account = "0d9f4d0c-0e2e-4c3b-9a1e-2f6b8c1d4e5a";
const key = "8f14e45f-ceea-467a-9e1b-8b6a3d2c1f00";

const valid = {
  accountId: account,
  ticker: "PETR4",
  side: "BUY",
  type: "LIMIT",
  quantity: 100,
  limitPriceCents: "3850",
  idempotencyKey: key,
};

describe("order state machine", () => {
  it("allows the happy path", () => {
    let status = transition("RECEIVED", "VALIDATED");
    status = transition(status, "WORKING");
    status = transition(status, "PARTIALLY_FILLED");
    status = transition(status, "FILLED");
    expect(status).toBe("FILLED");
  });

  it("refuses to resurrect a terminal order", () => {
    expect(() => transition("FILLED", "WORKING")).toThrow(IllegalTransitionError);
    expect(() => transition("CANCELLED", "FILLED")).toThrow(IllegalTransitionError);
    expect(() => transition("REJECTED", "VALIDATED")).toThrow(IllegalTransitionError);
  });

  it("refuses to skip validation", () => {
    expect(() => transition("RECEIVED", "WORKING")).toThrow(IllegalTransitionError);
    expect(() => transition("RECEIVED", "FILLED")).toThrow(IllegalTransitionError);
  });

  it("names both ends in the error, so logs are actionable", () => {
    try {
      transition("FILLED", "WORKING");
    } catch (error) {
      expect(error).toBeInstanceOf(IllegalTransitionError);
      expect((error as IllegalTransitionError).from).toBe("FILLED");
      expect((error as IllegalTransitionError).to).toBe("WORKING");
    }
  });

  it("every status is reachable from RECEIVED", () => {
    const seen = new Set<string>(["RECEIVED"]);
    const queue: OrderStatus[] = ["RECEIVED"];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const next of ORDER_TRANSITIONS[current]) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    expect(seen.size).toBe(ORDER_STATUSES.length);
  });

  it("has no transition out of a terminal status", () => {
    for (const status of ORDER_STATUSES) {
      if (isTerminal(status)) {
        for (const other of ORDER_STATUSES) {
          expect(canTransition(status, other)).toBe(false);
        }
      }
    }
  });
});

describe("PlaceOrderInput", () => {
  it("accepts a well formed limit order", () => {
    const parsed = PlaceOrderInputSchema.parse(valid);
    expect(parsed.limitPriceCents).toBe(3850n);
  });

  it("rejects a quantity outside the round lot", () => {
    const result = PlaceOrderInputSchema.safeParse({ ...valid, quantity: 150 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["quantity"]);
  });

  it("requires a limit price on a limit order", () => {
    const { limitPriceCents, ...withoutPrice } = valid;
    const result = PlaceOrderInputSchema.safeParse(withoutPrice);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("limit price");
  });

  it("forbids a limit price on a market order", () => {
    const result = PlaceOrderInputSchema.safeParse({ ...valid, type: "MARKET" });
    expect(result.success).toBe(false);
  });

  it("requires a stop price on a stop order", () => {
    const { limitPriceCents, ...rest } = valid;
    const result = PlaceOrderInputSchema.safeParse({ ...rest, type: "STOP" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["stopPriceCents"]);
  });

  it("rejects a non-positive price", () => {
    const result = PlaceOrderInputSchema.safeParse({ ...valid, limitPriceCents: "0" });
    expect(result.success).toBe(false);
  });

  it("requires an idempotency key", () => {
    const { idempotencyKey, ...rest } = valid;
    expect(PlaceOrderInputSchema.safeParse(rest).success).toBe(false);
  });
});

describe("wire representation of money", () => {
  it("parses a decimal string into bigint cents", () => {
    expect(CentsSchema.parse("123456")).toBe(123_456n);
    expect(CentsSchema.parse("-500")).toBe(-500n);
  });

  it("rejects a JSON number, which would lose precision", () => {
    expect(CentsSchema.safeParse(123456).success).toBe(false);
  });

  it("rejects a decimal point, since the unit is already minor", () => {
    expect(CentsSchema.safeParse("1234.56").success).toBe(false);
  });

  it("survives amounts beyond Number.MAX_SAFE_INTEGER", () => {
    const huge = "90071992547409910";
    expect(CentsSchema.parse(huge).toString()).toBe(huge);
    expect(String(Number(huge))).not.toBe(huge);
  });

  it("round-trips", () => {
    expect(CentsSchema.parse(centsToWire(-98_765n))).toBe(-98_765n);
  });
});

describe("ticker", () => {
  it.each(["PETR4", "VALE3", "ITUB4", "BOVA11", "PETR4F"])("accepts %s", (t) => {
    expect(TickerSchema.safeParse(t).success).toBe(true);
  });

  it.each(["petr4", "PETR", "PE4", "PETR456", ""])("rejects %s", (t) => {
    expect(TickerSchema.safeParse(t).success).toBe(false);
  });
});
