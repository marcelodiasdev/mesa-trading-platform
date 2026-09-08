import { beforeEach, describe, expect, it } from "vitest";
import { createLedger, type Ledger } from "./ledger.ts";
import {
  BROKERAGE_REVENUE_ACCOUNT,
  MissingCostBasisError,
  bookTrade,
  cashAccountOf,
  custodyAccountOf,
  realisedAccountOf,
  runSettlement,
  settlementAccountOf,
} from "./trades.ts";

const ACCOUNT = "acc-1";
const EXTERNAL = "external:banking";
const TRADE_DATE = "2026-09-08";
const SETTLES_ON = "2026-09-10";

let ledger: Ledger;

const cash = () => ledger.balance(cashAccountOf(ACCOUNT));
const custody = (ticker = "PETR4") => ledger.balance(custodyAccountOf(ACCOUNT, ticker));
const pending = () => ledger.balance(settlementAccountOf(ACCOUNT));
const realised = () => -ledger.balance(realisedAccountOf(ACCOUNT));
const revenue = () => ledger.balance(BROKERAGE_REVENUE_ACCOUNT);

function deposit(cents: bigint) {
  ledger.openAccount(cashAccountOf(ACCOUNT), "CLIENT_CASH");
  ledger.post({
    kind: "DEPOSIT",
    idempotencyKey: `dep-${cents}-${crypto.randomUUID()}`,
    entries: [
      { accountId: EXTERNAL, amountCents: -cents },
      { accountId: cashAccountOf(ACCOUNT), amountCents: cents },
    ],
  });
}

const buy = (over: Partial<Parameters<typeof bookTrade>[1]> = {}) =>
  bookTrade(ledger, {
    accountId: ACCOUNT,
    ticker: "PETR4",
    side: "BUY",
    quantity: 100,
    grossCents: 385_000n,
    feeCents: 1_348n,
    idempotencyKey: crypto.randomUUID(),
    tradeDate: TRADE_DATE,
    ...over,
  });

const sell = (over: Partial<Parameters<typeof bookTrade>[1]> = {}) =>
  bookTrade(ledger, {
    accountId: ACCOUNT,
    ticker: "PETR4",
    side: "SELL",
    quantity: 100,
    grossCents: 420_000n,
    feeCents: 1_470n,
    costBasisCents: 385_000n,
    idempotencyKey: crypto.randomUUID(),
    tradeDate: TRADE_DATE,
    ...over,
  });

beforeEach(() => {
  ledger = createLedger();
  ledger.openAccount(EXTERNAL, "EXTERNAL");
  deposit(1_000_000n);
});

describe("booking a purchase", () => {
  it("puts the shares in custody at cost", () => {
    buy();
    expect(custody()).toBe(385_000n);
  });

  it("charges the brokerage fee", () => {
    buy();
    expect(revenue()).toBe(1_348n);
  });

  it("leaves cash untouched until settlement", () => {
    buy();
    expect(cash()).toBe(1_000_000n);
  });

  it("records what the customer owes", () => {
    buy();
    expect(pending()).toBe(-386_348n);
  });

  it("settles two business days later", () => {
    expect(buy().settlementDate).toBe(SETTLES_ON);
  });

  it("keeps the ledger balanced", () => {
    buy();
    expect(ledger.totalAcrossAllAccounts()).toBe(0n);
  });
});

describe("booking a sale", () => {
  beforeEach(() => {
    buy();
  });

  it("takes the shares out of custody at cost, not at the sale price", () => {
    sell();
    expect(custody()).toBe(0n);
  });

  it("books the difference as a realised result", () => {
    sell();
    // sold 420000, cost 385000
    expect(realised()).toBe(35_000n);
  });

  it("books a loss as a negative result", () => {
    sell({ grossCents: 350_000n, feeCents: 1_225n });
    expect(realised()).toBe(-35_000n);
  });

  it("records what the customer is owed, net of the fee", () => {
    const before = pending();
    sell();
    expect(pending() - before).toBe(418_530n);
  });

  it("refuses a sale with no cost basis", () => {
    expect(() =>
      bookTrade(ledger, {
        accountId: ACCOUNT,
        ticker: "PETR4",
        side: "SELL",
        quantity: 100,
        grossCents: 420_000n,
        feeCents: 1_470n,
        idempotencyKey: crypto.randomUUID(),
        tradeDate: TRADE_DATE,
      }),
    ).toThrow(MissingCostBasisError);
  });

  it("keeps the ledger balanced", () => {
    sell();
    expect(ledger.totalAcrossAllAccounts()).toBe(0n);
  });
});

describe("idempotency", () => {
  it("books a replayed trade only once", () => {
    const key = crypto.randomUUID();
    const first = buy({ idempotencyKey: key });
    const second = buy({ idempotencyKey: key });

    expect(second.transactionId).toBe(first.transactionId);
    expect(second.replayed).toBe(true);
    expect(custody()).toBe(385_000n);
  });

  it("does not queue a second settlement on replay", () => {
    const key = crypto.randomUUID();
    buy({ idempotencyKey: key });
    buy({ idempotencyKey: key });

    expect(ledger.dueOn(SETTLES_ON)).toHaveLength(1);
  });
});

describe("settlement", () => {
  it("does nothing before the settlement date", () => {
    buy();
    const run = runSettlement(ledger, "2026-09-09");

    expect(run.settled).toBe(0);
    expect(cash()).toBe(1_000_000n);
  });

  it("moves the cash on the settlement date", () => {
    buy();
    const run = runSettlement(ledger, SETTLES_ON);

    expect(run.settled).toBe(1);
    expect(cash()).toBe(613_652n);
    expect(pending()).toBe(0n);
  });

  it("credits the account on a sale", () => {
    buy();
    runSettlement(ledger, SETTLES_ON);
    sell();
    runSettlement(ledger, SETTLES_ON);

    expect(cash()).toBe(1_032_182n);
  });

  it("settles nothing on a second run of the same day", () => {
    buy();
    runSettlement(ledger, SETTLES_ON);
    const second = runSettlement(ledger, SETTLES_ON);

    expect(second.settled).toBe(0);
    expect(cash()).toBe(613_652n);
  });

  it("clears everything overdue, not just today", () => {
    buy({ tradeDate: "2026-09-01", idempotencyKey: crypto.randomUUID() });
    buy({ tradeDate: "2026-09-08", idempotencyKey: crypto.randomUUID() });

    const run = runSettlement(ledger, "2026-09-10");
    expect(run.settled).toBe(2);
  });

  it("reports a shortfall instead of overdrawing the account", () => {
    buy({ grossCents: 5_000_000n, feeCents: 17_500n });
    const run = runSettlement(ledger, SETTLES_ON);

    expect(run.settled).toBe(0);
    expect(run.shortfalls).toEqual([{ accountId: ACCOUNT, requiredCents: 5_017_500n }]);
    expect(cash()).toBe(1_000_000n);
  });

  it("keeps the ledger balanced through the whole cycle", () => {
    buy();
    runSettlement(ledger, SETTLES_ON);
    sell();
    runSettlement(ledger, SETTLES_ON);

    expect(ledger.totalAcrossAllAccounts()).toBe(0n);
  });
});
