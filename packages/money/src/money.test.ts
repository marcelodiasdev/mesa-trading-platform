import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  CurrencyMismatchError,
  InvalidAmountError,
  add,
  allocate,
  allocateByRatios,
  brl,
  compare,
  formatAmount,
  formatBRL,
  multiplyQuantity,
  multiplyRate,
  parseBRL,
  subtract,
} from "./money";

describe("why integers instead of floats", () => {
  it("floating point cannot represent 0.1 + 0.2", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  it("integer cents can", () => {
    expect(add(brl(10n), brl(20n)).cents).toBe(30n);
  });

  it("survives a hundred thousand additions of one cent", () => {
    let float = 0;
    let money = brl(0n);
    for (let i = 0; i < 100_000; i += 1) {
      float += 0.01;
      money = add(money, brl(1n));
    }
    expect(float).not.toBe(1000);
    expect(money.cents).toBe(100_000n);
  });
});

describe("parseBRL", () => {
  it.each([
    ["1.234,56", 123_456n],
    ["1234,56", 123_456n],
    ["0,05", 5n],
    ["0,5", 50n],
    ["12", 1_200n],
    ["-1.234,56", -123_456n],
    ["R$ 1.234,56", 123_456n],
  ])("parses %s", (input, cents) => {
    expect(parseBRL(input).cents).toBe(cents);
  });

  it.each(["", "abc", "1,234", "1.23,45", "1..2", "1,2,3"])("rejects %s", (input) => {
    expect(() => parseBRL(input)).toThrow(InvalidAmountError);
  });

  it("round-trips through formatting", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: -99_999_999n, max: 99_999_999n }), (cents) => {
        expect(parseBRL(formatAmount(brl(cents))).cents).toBe(cents);
      }),
    );
  });
});

describe("formatting", () => {
  it("formats with the currency symbol", () => {
    expect(formatBRL(brl(123_456n)).replace(/\u00a0/g, " ")).toBe("R$ 1.234,56");
  });

  it("formats without the symbol for dense tables", () => {
    expect(formatAmount(brl(123_456n))).toBe("1.234,56");
  });

  it("keeps trailing zeros", () => {
    expect(formatAmount(brl(1_200n))).toBe("12,00");
  });
});

describe("rounding is a business decision", () => {
  const amount = brl(10_000n); // R$ 100,00

  it("rounds a 0.35% brokerage fee up, so the house never loses a cent", () => {
    expect(multiplyRate(amount, 35n, 10_000n, "ceil").cents).toBe(35n);
    expect(multiplyRate(brl(101n), 35n, 10_000n, "ceil").cents).toBe(1n);
  });

  it("truncates exchange fees, so the customer is never overcharged", () => {
    expect(multiplyRate(brl(101n), 35n, 10_000n, "trunc").cents).toBe(0n);
  });

  it("halfUp and halfEven disagree exactly at the tie", () => {
    expect(multiplyRate(brl(5n), 1n, 2n, "halfUp").cents).toBe(3n);
    expect(multiplyRate(brl(5n), 1n, 2n, "halfEven").cents).toBe(2n);
    expect(multiplyRate(brl(7n), 1n, 2n, "halfEven").cents).toBe(4n);
  });

  it("rounds symmetrically around zero", () => {
    expect(multiplyRate(brl(-5n), 1n, 2n, "halfUp").cents).toBe(-3n);
    expect(multiplyRate(brl(-101n), 35n, 10_000n, "ceil").cents).toBe(0n);
  });
});

describe("allocate", () => {
  it("never loses the cent that does not divide", () => {
    const shares = allocate(brl(100_00n), 3);
    expect(shares.map((s) => s.cents)).toEqual([3_334n, 3_333n, 3_333n]);
  });

  it("splits proportionally", () => {
    const shares = allocateByRatios(brl(100n), [1n, 3n]);
    expect(shares.map((s) => s.cents)).toEqual([25n, 75n]);
  });

  it("preserves the total for any amount and any number of parts", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -1_000_000_000n, max: 1_000_000_000n }),
        fc.integer({ min: 1, max: 50 }),
        (cents, parts) => {
          const shares = allocate(brl(cents), parts);
          const total = shares.reduce((acc, s) => acc + s.cents, 0n);
          expect(total).toBe(cents);
          expect(shares).toHaveLength(parts);
        },
      ),
    );
  });

  it("preserves the total for any set of ratios", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 1_000_000_000n }),
        fc.array(fc.bigInt({ min: 1n, max: 1000n }), { minLength: 1, maxLength: 20 }),
        (cents, ratios) => {
          const shares = allocateByRatios(brl(cents), ratios);
          const total = shares.reduce((acc, s) => acc + s.cents, 0n);
          expect(total).toBe(cents);
        },
      ),
    );
  });

  it("rejects nonsense", () => {
    expect(() => allocate(brl(100n), 0)).toThrow(RangeError);
    expect(() => allocate(brl(100n), 2.5)).toThrow(RangeError);
    expect(() => allocateByRatios(brl(100n), [])).toThrow(RangeError);
    expect(() => allocateByRatios(brl(100n), [0n])).toThrow(RangeError);
  });
});

describe("arithmetic laws", () => {
  const money = () => fc.bigInt({ min: -1_000_000_000n, max: 1_000_000_000n }).map(brl);

  it("addition is commutative", () => {
    fc.assert(
      fc.property(money(), money(), (a, b) => {
        expect(add(a, b).cents).toBe(add(b, a).cents);
      }),
    );
  });

  it("subtraction inverts addition", () => {
    fc.assert(
      fc.property(money(), money(), (a, b) => {
        expect(subtract(add(a, b), b).cents).toBe(a.cents);
      }),
    );
  });

  it("multiplying by a whole quantity is exact", () => {
    fc.assert(
      fc.property(money(), fc.bigInt({ min: 0n, max: 10_000n }), (a, q) => {
        expect(multiplyQuantity(a, q).cents).toBe(a.cents * q);
      }),
    );
  });

  it("compare is consistent with cents ordering", () => {
    fc.assert(
      fc.property(money(), money(), (a, b) => {
        expect(compare(a, b)).toBe(a.cents < b.cents ? -1 : a.cents > b.cents ? 1 : 0);
      }),
    );
  });
});

describe("currency safety", () => {
  it("refuses to combine different currencies", () => {
    const usd = { cents: 100n, currency: "USD" } as unknown as ReturnType<typeof brl>;
    expect(() => add(brl(100n), usd)).toThrow(CurrencyMismatchError);
  });
});
