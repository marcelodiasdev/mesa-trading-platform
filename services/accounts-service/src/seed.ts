import type { Ledger } from "./ledger.ts";

export const DEMO_ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";
export const DEMO_OPENING_BALANCE_CENTS = 12_000_000n;

const SEED_KEY = "seed:demo-account:v1";

export interface SeedResult {
  readonly accountId: string;
  readonly balanceCents: bigint;
  readonly seeded: boolean;
}

export function seedDemoAccount(
  ledger: Ledger,
  externalAccountId: string,
  cashAccountId: string,
  reservedAccountId: string,
  amountCents = DEMO_OPENING_BALANCE_CENTS,
): SeedResult {
  ledger.openAccount(cashAccountId, "CLIENT_CASH", DEMO_ACCOUNT_ID);
  ledger.openAccount(reservedAccountId, "CLIENT_RESERVED", DEMO_ACCOUNT_ID);

  const transaction = ledger.post({
    kind: "DEPOSIT",
    idempotencyKey: SEED_KEY,
    entries: [
      { accountId: externalAccountId, amountCents: -amountCents },
      { accountId: cashAccountId, amountCents },
    ],
  });

  return {
    accountId: DEMO_ACCOUNT_ID,
    balanceCents: ledger.balance(cashAccountId),
    seeded: !transaction.replayed,
  };
}
