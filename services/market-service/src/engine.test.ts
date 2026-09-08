import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createMarketEngine } from "./engine.ts";
import { INSTRUMENTS } from "./instruments.ts";
import { createSeededRandom } from "./random.ts";

const at = () => new Date("2026-09-07T13:00:00.000Z");

describe("the generator is reproducible", () => {
  it("produces the same sequence for the same seed", () => {
    const a = createMarketEngine({ seed: 42, now: at });
    const b = createMarketEngine({ seed: 42, now: at });

    const first = Array.from({ length: 50 }, () => a.tick().priceCents);
    const second = Array.from({ length: 50 }, () => b.tick().priceCents);

    expect(first).toEqual(second);
  });

  it("produces a different sequence for a different seed", () => {
    const a = createMarketEngine({ seed: 1, now: at });
    const b = createMarketEngine({ seed: 2, now: at });

    const first = Array.from({ length: 50 }, () => a.tick().priceCents);
    const second = Array.from({ length: 50 }, () => b.tick().priceCents);

    expect(first).not.toEqual(second);
  });

  it("draws numbers inside the unit interval", () => {
    const random = createSeededRandom(7);
    for (let i = 0; i < 1_000; i += 1) {
      const value = random.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("quotes", () => {
  it("opens every instrument at its opening price", () => {
    const engine = createMarketEngine({ seed: 3, now: at });
    for (const instrument of INSTRUMENTS) {
      const quote = engine.quote(instrument.ticker)!;
      expect(quote.priceCents).toBe(instrument.openingPriceCents);
      expect(quote.changeCents).toBe(0n);
      expect(quote.changeBps).toBe(0);
    }
  });

  it("keeps prices as bigint", () => {
    const engine = createMarketEngine({ seed: 3, now: at });
    expect(typeof engine.quote("PETR4")!.priceCents).toBe("bigint");
  });

  it("returns undefined for an instrument that does not trade here", () => {
    const engine = createMarketEngine({ seed: 3, now: at });
    expect(engine.quote("XXXX9")).toBeUndefined();
  });

  it("quotes a bid below and an ask above the last price", () => {
    const engine = createMarketEngine({ seed: 3, now: at });
    const quote = engine.quote("PETR4")!;
    expect(quote.bidCents).toBeLessThan(quote.priceCents);
    expect(quote.askCents).toBeGreaterThan(quote.priceCents);
  });

  it("reports the change against the opening price", () => {
    const engine = createMarketEngine({ seed: 9, now: at });
    for (let i = 0; i < 200; i += 1) engine.tick();

    for (const instrument of INSTRUMENTS) {
      const quote = engine.quote(instrument.ticker)!;
      expect(quote.changeCents).toBe(quote.priceCents - instrument.openingPriceCents);
    }
  });

  it("covers every instrument in a snapshot", () => {
    const engine = createMarketEngine({ seed: 3, now: at });
    expect(engine.snapshot()).toHaveLength(INSTRUMENTS.length);
  });
});

describe("prices stay in a plausible range", () => {
  it("never goes to zero or negative, whatever the seed", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100_000 }), (seed) => {
        const engine = createMarketEngine({ seed, volatilityBps: 500, now: at });
        for (let i = 0; i < 500; i += 1) engine.tick();
        for (const [, price] of engine.prices) {
          expect(price).toBeGreaterThan(0n);
        }
      }),
      { numRuns: 20 },
    );
  });

  it("moves by at least one cent on every tick", () => {
    const engine = createMarketEngine({ seed: 11, volatilityBps: 1, now: at });
    const before = new Map(engine.prices);
    const quote = engine.tick();
    expect(quote.priceCents).not.toBe(before.get(quote.ticker));
  });
});

describe("order book", () => {
  it("stacks bids downward and asks upward from the spread", () => {
    const engine = createMarketEngine({ seed: 5, now: at });
    const book = engine.book("PETR4", 5)!;

    expect(book.bids).toHaveLength(5);
    expect(book.asks).toHaveLength(5);

    for (let i = 1; i < book.bids.length; i += 1) {
      expect(book.bids[i]!.priceCents).toBeLessThan(book.bids[i - 1]!.priceCents);
      expect(book.asks[i]!.priceCents).toBeGreaterThan(book.asks[i - 1]!.priceCents);
    }
  });

  it("keeps the best bid below the best ask", () => {
    const engine = createMarketEngine({ seed: 5, now: at });
    const book = engine.book("PETR4")!;
    expect(book.bids[0]!.priceCents).toBeLessThan(book.asks[0]!.priceCents);
  });

  it("quotes whole lots at every level", () => {
    const engine = createMarketEngine({ seed: 5, now: at });
    const book = engine.book("VALE3")!;
    for (const level of [...book.bids, ...book.asks]) {
      expect(level.quantity % 100).toBe(0);
      expect(level.quantity).toBeGreaterThan(0);
    }
  });

  it("returns undefined for an unknown instrument", () => {
    const engine = createMarketEngine({ seed: 5, now: at });
    expect(engine.book("XXXX9")).toBeUndefined();
  });
});
