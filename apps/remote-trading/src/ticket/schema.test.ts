import { describe, expect, it } from "vitest";
import {
  TicketSchema,
  estimateNotionalCents,
  toPayload,
  type TicketValues,
} from "./schema";

const values = (over: Partial<TicketValues> = {}): TicketValues => ({
  ticker: "PETR4",
  side: "BUY",
  type: "LIMIT",
  quantity: 100,
  limitPrice: "3850",
  stopPrice: "",
  ...over,
});

const issuesFor = (input: TicketValues): { path: string; message: string }[] => {
  const result = TicketSchema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
};

describe("a well formed ticket", () => {
  it("passes", () => {
    expect(TicketSchema.safeParse(values()).success).toBe(true);
  });

  it("accepts a market order with no price", () => {
    expect(
      TicketSchema.safeParse(values({ type: "MARKET", limitPrice: "" })).success,
    ).toBe(true);
  });

  it("accepts a stop order with a trigger", () => {
    expect(
      TicketSchema.safeParse(values({ type: "STOP", limitPrice: "", stopPrice: "3900" }))
        .success,
    ).toBe(true);
  });
});

describe("quantity", () => {
  it("must be a whole lot", () => {
    expect(issuesFor(values({ quantity: 150 }))).toEqual([
      { path: "quantity", message: "must be a multiple of 100" },
    ]);
  });

  it("must be positive", () => {
    expect(issuesFor(values({ quantity: 0 })).map((i) => i.path)).toContain("quantity");
  });

  it("must be whole shares", () => {
    expect(issuesFor(values({ quantity: 100.5 })).map((i) => i.path)).toContain(
      "quantity",
    );
  });
});

describe("price rules follow the order type", () => {
  it("requires a limit price on a limit order", () => {
    expect(issuesFor(values({ limitPrice: "" }))).toEqual([
      { path: "limitPrice", message: "enter a price greater than zero" },
    ]);
  });

  it("requires a trigger on a stop order", () => {
    const issues = issuesFor(values({ type: "STOP", limitPrice: "", stopPrice: "" }));
    expect(issues.map((i) => i.path)).toContain("stopPrice");
  });

  it("refuses a price on a market order", () => {
    const issues = issuesFor(values({ type: "MARKET", limitPrice: "3850" }));
    expect(issues[0]?.message).toContain("no price");
  });

  it("rejects a zero price typed as digits", () => {
    expect(issuesFor(values({ limitPrice: "0" })).map((i) => i.path)).toContain(
      "limitPrice",
    );
  });
});

describe("instrument", () => {
  it("must be chosen", () => {
    expect(issuesFor(values({ ticker: "" })).map((i) => i.path)).toContain("ticker");
  });

  it("must look like a B3 ticker", () => {
    expect(issuesFor(values({ ticker: "petr4" })).map((i) => i.path)).toContain("ticker");
  });
});

describe("payload sent to the service", () => {
  it("carries prices as integer strings of cents", () => {
    const payload = toPayload(values(), "acc-1", 3_850n);
    expect(payload.limitPriceCents).toBe("3850");
    expect(payload.referencePriceCents).toBe("3850");
  });

  it("omits the limit price on a market order", () => {
    const payload = toPayload(
      values({ type: "MARKET", limitPrice: "" }),
      "acc-1",
      3_850n,
    );
    expect(payload.limitPriceCents).toBeUndefined();
  });

  it("omits the stop price unless the order is a stop", () => {
    const payload = toPayload(values(), "acc-1", 3_850n);
    expect(payload.stopPriceCents).toBeUndefined();
  });

  it("sends the stop price on a stop order", () => {
    const payload = toPayload(
      values({ type: "STOP", limitPrice: "", stopPrice: "3900" }),
      "acc-1",
      3_850n,
    );
    expect(payload.stopPriceCents).toBe("3900");
  });
});

describe("estimated cost", () => {
  it("uses the limit price on a limit order", () => {
    expect(estimateNotionalCents(values(), 4_000n)).toBe(385_000n);
  });

  it("uses the last price on a market order", () => {
    expect(
      estimateNotionalCents(values({ type: "MARKET", limitPrice: "" }), 4_000n),
    ).toBe(400_000n);
  });

  it("is zero while the quantity is empty", () => {
    expect(estimateNotionalCents(values({ quantity: 0 }), 4_000n)).toBe(0n);
  });
});
