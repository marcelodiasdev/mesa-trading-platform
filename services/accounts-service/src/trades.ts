import { settlementDateFor, toTradingDate, type TradingDate } from "./calendar.ts";
import { InsufficientFundsError, type Ledger, type PostedTransaction } from "./ledger.ts";

export type Side = "BUY" | "SELL";

export const cashAccountOf = (accountId: string): string => accountId;
export const reservedAccountOf = (accountId: string): string => `reserved:${accountId}`;
export const custodyAccountOf = (accountId: string, ticker: string): string =>
  `custody:${accountId}:${ticker}`;
export const settlementAccountOf = (accountId: string): string =>
  `settlement:${accountId}`;
export const realisedAccountOf = (accountId: string): string => `realised:${accountId}`;
export const BROKERAGE_REVENUE_ACCOUNT = "revenue:brokerage";

export interface BookTradeInput {
  readonly accountId: string;
  readonly ticker: string;
  readonly side: Side;
  readonly quantity: number;
  readonly grossCents: bigint;
  readonly feeCents: bigint;
  readonly costBasisCents?: bigint;
  readonly reservationId?: string;
  readonly idempotencyKey: string;
  readonly correlationId?: string;
  readonly tradeDate?: TradingDate;
}

export interface BookedTrade {
  readonly transactionId: string;
  readonly tradeDate: TradingDate;
  readonly settlementDate: TradingDate;
  readonly netCents: bigint;
  readonly replayed: boolean;
}

export class MissingCostBasisError extends Error {
  constructor() {
    super("A sale must carry the cost basis of the shares being sold");
    this.name = "MissingCostBasisError";
  }
}

function openAccounts(ledger: Ledger, input: BookTradeInput): void {
  ledger.openAccount(cashAccountOf(input.accountId), "CLIENT_CASH", input.accountId);
  ledger.openAccount(
    reservedAccountOf(input.accountId),
    "CLIENT_RESERVED",
    input.accountId,
  );
  ledger.openAccount(
    custodyAccountOf(input.accountId, input.ticker),
    "CUSTODY",
    input.accountId,
  );
  ledger.openAccount(
    settlementAccountOf(input.accountId),
    "SETTLEMENT_PENDING",
    input.accountId,
  );
  ledger.openAccount(
    realisedAccountOf(input.accountId),
    "REALISED_RESULT",
    input.accountId,
  );
  ledger.openAccount(BROKERAGE_REVENUE_ACCOUNT, "BROKERAGE_REVENUE");
}

export function bookTrade(ledger: Ledger, input: BookTradeInput): BookedTrade {
  openAccounts(ledger, input);

  const tradeDate = input.tradeDate ?? toTradingDate(new Date());
  const settlementDate = settlementDateFor(tradeDate);

  const custody = custodyAccountOf(input.accountId, input.ticker);
  const settlement = settlementAccountOf(input.accountId);
  const realised = realisedAccountOf(input.accountId);

  const netCents =
    input.side === "BUY"
      ? -(input.grossCents + input.feeCents)
      : input.grossCents - input.feeCents;

  const entries =
    input.side === "BUY"
      ? [
          { accountId: custody, amountCents: input.grossCents },
          { accountId: BROKERAGE_REVENUE_ACCOUNT, amountCents: input.feeCents },
          { accountId: settlement, amountCents: netCents },
        ]
      : buildSellEntries(input, custody, settlement, realised, netCents);

  const transaction = ledger.post({
    kind: "TRADE",
    idempotencyKey: input.idempotencyKey,
    ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }),
    entries,
  });

  if (!transaction.replayed) {
    ledger.scheduleSettlement(
      transaction.id,
      input.accountId,
      tradeDate,
      settlementDate,
      netCents,
    );

    if (input.reservationId !== undefined) {
      ledger.reverse(input.reservationId, `release:trade:${transaction.id}`);
    }
  }

  return {
    transactionId: transaction.id,
    tradeDate,
    settlementDate,
    netCents,
    replayed: transaction.replayed,
  };
}

function buildSellEntries(
  input: BookTradeInput,
  custody: string,
  settlement: string,
  realised: string,
  netCents: bigint,
): { accountId: string; amountCents: bigint }[] {
  if (input.costBasisCents === undefined) throw new MissingCostBasisError();

  /**
   * Income accounts are credit-normal, so a gain lands here as a negative
   * amount. The report negates it before showing a number to a human.
   */
  const resultCents = input.costBasisCents - input.grossCents;

  return [
    { accountId: custody, amountCents: -input.costBasisCents },
    { accountId: realised, amountCents: resultCents },
    { accountId: BROKERAGE_REVENUE_ACCOUNT, amountCents: input.feeCents },
    { accountId: settlement, amountCents: netCents },
  ];
}

export interface SettlementRun {
  readonly date: TradingDate;
  readonly settled: number;
  readonly movedCents: bigint;
  readonly shortfalls: readonly { accountId: string; requiredCents: bigint }[];
}

export function runSettlement(ledger: Ledger, date: TradingDate): SettlementRun {
  const due = ledger.dueOn(date);
  const shortfalls: { accountId: string; requiredCents: bigint }[] = [];
  let settled = 0;
  let movedCents = 0n;

  for (const obligation of due) {
    const cash = cashAccountOf(obligation.account_id);
    const settlement = settlementAccountOf(obligation.account_id);
    const amount = BigInt(obligation.amount_cents);

    if (amount < 0n && ledger.balance(cash) < -amount) {
      shortfalls.push({ accountId: obligation.account_id, requiredCents: -amount });
      continue;
    }

    const transaction: PostedTransaction = ledger.post({
      kind: "SETTLEMENT",
      idempotencyKey: `settle:${obligation.transaction_id}`,
      entries: [
        { accountId: settlement, amountCents: -amount },
        { accountId: cash, amountCents: amount },
      ],
    });

    ledger.markSettledBy(obligation.transaction_id, transaction.id);
    settled += 1;
    movedCents += amount;
  }

  return { date, settled, movedCents, shortfalls };
}

export { InsufficientFundsError };
