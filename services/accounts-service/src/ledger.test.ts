import { beforeEach, describe, expect, it } from "vitest";
import fc from "fast-check";
import { UnbalancedTransactionError, createLedger, type Ledger } from "./ledger";

const CASH = "acc-cash";
const EXTERNAL = "acc-external";
const REVENUE = "acc-revenue";

let ledger: Ledger;

beforeEach(() => {
  ledger = createLedger();
  ledger.openAccount(CASH, "CLIENT_CASH", "user-1");
  ledger.openAccount(EXTERNAL, "EXTERNAL");
  ledger.openAccount(REVENUE, "BROKERAGE_REVENUE");
});

function deposit(cents: bigint, idempotencyKey?: string) {
  return ledger.post({
    kind: "DEPOSIT",
    ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
    entries: [
      { accountId: EXTERNAL, amountCents: -cents },
      { accountId: CASH, amountCents: cents },
    ],
  });
}

describe("the zero-sum invariant", () => {
  it("accepts a balanced transaction", () => {
    const tx = deposit(100_00n);
    expect(tx.entries).toHaveLength(2);
    expect(ledger.balance(CASH)).toBe(100_00n);
  });

  it("refuses an unbalanced transaction", () => {
    expect(() =>
      ledger.post({
        kind: "DEPOSIT",
        entries: [
          { accountId: EXTERNAL, amountCents: -100_00n },
          { accountId: CASH, amountCents: 99_00n },
        ],
      }),
    ).toThrow(UnbalancedTransactionError);
  });

  it("reports how far off the transaction was", () => {
    try {
      ledger.post({
        kind: "FEE",
        entries: [
          { accountId: CASH, amountCents: -500n },
          { accountId: REVENUE, amountCents: 300n },
        ],
      });
    } catch (error) {
      expect((error as UnbalancedTransactionError).deltaCents).toBe(-200n);
    }
  });

  it("refuses a single-sided transaction", () => {
    expect(() =>
      ledger.post({ kind: "DEPOSIT", entries: [{ accountId: CASH, amountCents: 0n }] }),
    ).toThrow();
  });

  it("holds across any sequence of postings", () => {
    fc.assert(
      fc.property(
        fc.array(fc.bigInt({ min: 1n, max: 1_000_000n }), {
          minLength: 1,
          maxLength: 40,
        }),
        (amounts) => {
          const fresh = createLedger();
          fresh.openAccount(CASH, "CLIENT_CASH");
          fresh.openAccount(EXTERNAL, "EXTERNAL");
          fresh.openAccount(REVENUE, "BROKERAGE_REVENUE");

          for (const amount of amounts) {
            fresh.post({
              kind: "DEPOSIT",
              entries: [
                { accountId: EXTERNAL, amountCents: -amount },
                { accountId: CASH, amountCents: amount },
              ],
            });
          }
          expect(fresh.totalAcrossAllAccounts()).toBe(0n);
          expect(fresh.balance(CASH)).toBe(amounts.reduce((a, b) => a + b, 0n));
        },
      ),
      { numRuns: 30 },
    );
  });
});

describe("balances are derived, never stored", () => {
  it("sums the entries", () => {
    deposit(100_00n);
    deposit(50_00n);
    ledger.post({
      kind: "FEE",
      entries: [
        { accountId: CASH, amountCents: -4_90n },
        { accountId: REVENUE, amountCents: 4_90n },
      ],
    });
    expect(ledger.balance(CASH)).toBe(145_10n);
    expect(ledger.balance(REVENUE)).toBe(4_90n);
  });

  it("returns zero for an account with no movement", () => {
    expect(ledger.balance(REVENUE)).toBe(0n);
  });
});

describe("idempotency", () => {
  it("returns the original transaction on replay", () => {
    const first = deposit(100_00n, "key-1");
    const second = deposit(100_00n, "key-1");
    expect(second.id).toBe(first.id);
    expect(second.replayed).toBe(true);
    expect(first.replayed).toBe(false);
  });

  it("does not double the balance on replay", () => {
    deposit(100_00n, "key-1");
    deposit(100_00n, "key-1");
    deposit(100_00n, "key-1");
    expect(ledger.balance(CASH)).toBe(100_00n);
  });

  it("treats a different key as a different transaction", () => {
    deposit(100_00n, "key-1");
    deposit(100_00n, "key-2");
    expect(ledger.balance(CASH)).toBe(200_00n);
  });
});

describe("corrections are reversals, not edits", () => {
  it("refuses to update an entry", () => {
    deposit(100_00n);
    expect(() => ledger.db.exec("UPDATE entries SET amount_cents = 1")).toThrow(
      /immutable/,
    );
  });

  it("refuses to delete an entry", () => {
    deposit(100_00n);
    expect(() => ledger.db.exec("DELETE FROM entries")).toThrow(/immutable/);
  });

  it("undoes a transaction by mirroring it", () => {
    const tx = deposit(100_00n);
    expect(ledger.balance(CASH)).toBe(100_00n);

    ledger.reverse(tx.id);
    expect(ledger.balance(CASH)).toBe(0n);
  });

  it("keeps both the original and the reversal in the history", () => {
    const tx = deposit(100_00n);
    ledger.reverse(tx.id);
    const lines = ledger.statement(CASH);
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.kind)).toEqual(["REVERSAL", "DEPOSIT"]);
  });
});

describe("statement", () => {
  it("carries a running balance", () => {
    deposit(100_00n);
    deposit(25_00n);
    ledger.post({
      kind: "FEE",
      entries: [
        { accountId: CASH, amountCents: -4_90n },
        { accountId: REVENUE, amountCents: 4_90n },
      ],
    });

    const lines = ledger.statement(CASH);
    expect(lines.map((l) => l.balanceCents)).toEqual([120_10n, 125_00n, 100_00n]);
  });

  it("shows newest first", () => {
    deposit(10_00n);
    deposit(20_00n);
    const lines = ledger.statement(CASH);
    expect(lines[0]!.amountCents).toBe(20_00n);
  });
});
