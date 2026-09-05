import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type AccountKind =
  | "CLIENT_CASH"
  | "CLIENT_RESERVED"
  | "CUSTODY"
  | "BROKERAGE_REVENUE"
  | "EXCHANGE_FEES"
  | "SETTLEMENT_PENDING"
  | "EXTERNAL";

export type TransactionKind =
  "DEPOSIT" | "WITHDRAWAL" | "TRADE" | "SETTLEMENT" | "FEE" | "REVERSAL";

export interface EntryInput {
  readonly accountId: string;
  readonly amountCents: bigint;
}

export interface PostInput {
  readonly kind: TransactionKind;
  readonly entries: readonly EntryInput[];
  readonly idempotencyKey?: string;
  readonly correlationId?: string;
  readonly reversesId?: string;
  readonly occurredAt?: Date;
}

export interface PostedTransaction {
  readonly id: string;
  readonly kind: TransactionKind;
  readonly occurredAt: string;
  readonly entries: readonly { accountId: string; amountCents: bigint }[];
  readonly replayed: boolean;
}

export class UnbalancedTransactionError extends Error {
  readonly deltaCents: bigint;
  constructor(deltaCents: bigint) {
    super(`Entries must sum to zero, off by ${deltaCents}`);
    this.name = "UnbalancedTransactionError";
    this.deltaCents = deltaCents;
  }
}

export class InsufficientFundsError extends Error {
  readonly accountId: string;
  readonly balanceCents: bigint;
  readonly requestedCents: bigint;
  constructor(accountId: string, balanceCents: bigint, requestedCents: bigint) {
    super(`Account ${accountId} holds ${balanceCents}, needs ${requestedCents}`);
    this.name = "InsufficientFundsError";
    this.accountId = accountId;
    this.balanceCents = balanceCents;
    this.requestedCents = requestedCents;
  }
}

const SCHEMA = readFileSync(
  fileURLToPath(new URL("./schema.sql", import.meta.url)),
  "utf8",
);

export function createLedger(location = ":memory:") {
  const db = new DatabaseSync(location);
  db.exec(SCHEMA);

  const insertTransaction = db.prepare(
    `INSERT INTO transactions (id, kind, occurred_at, idempotency_key, correlation_id, reverses_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertEntry = db.prepare(
    `INSERT INTO entries (transaction_id, account_id, amount_cents, created_at)
     VALUES (?, ?, ?, ?)`,
  );
  const findByKey = db.prepare(
    `SELECT id, kind, occurred_at FROM transactions WHERE idempotency_key = ?`,
  );
  const entriesOf = db.prepare(
    `SELECT account_id, amount_cents FROM entries WHERE transaction_id = ? ORDER BY id`,
  );
  const balanceOf = db.prepare(
    `SELECT COALESCE(SUM(amount_cents), 0) AS balance FROM entries WHERE account_id = ?`,
  );
  const globalSum = db.prepare(
    `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM entries`,
  );

  for (const statement of [entriesOf, balanceOf, globalSum]) {
    statement.setReadBigInts(true);
  }

  function openAccount(id: string, kind: AccountKind, ownerId?: string): void {
    db.prepare(
      `INSERT OR IGNORE INTO accounts (id, kind, owner_id) VALUES (?, ?, ?)`,
    ).run(id, kind, ownerId ?? null);
  }

  function balance(accountId: string): bigint {
    const row = balanceOf.get(accountId) as { balance: bigint };
    return BigInt(row.balance);
  }

  function readTransaction(
    id: string,
    kind: TransactionKind,
    occurredAt: string,
    replayed: boolean,
  ): PostedTransaction {
    const rows = entriesOf.all(id) as { account_id: string; amount_cents: bigint }[];
    return {
      id,
      kind,
      occurredAt,
      replayed,
      entries: rows.map((r) => ({
        accountId: r.account_id,
        amountCents: BigInt(r.amount_cents),
      })),
    };
  }

  function post(input: PostInput): PostedTransaction {
    if (input.idempotencyKey) {
      const existing = findByKey.get(input.idempotencyKey) as
        { id: string; kind: TransactionKind; occurred_at: string } | undefined;
      if (existing) {
        return readTransaction(existing.id, existing.kind, existing.occurred_at, true);
      }
    }

    const delta = input.entries.reduce((sum, e) => sum + e.amountCents, 0n);
    if (delta !== 0n) throw new UnbalancedTransactionError(delta);
    if (input.entries.length < 2) {
      throw new UnbalancedTransactionError(0n);
    }

    const id = crypto.randomUUID();
    const occurredAt = (input.occurredAt ?? new Date()).toISOString();

    db.exec("BEGIN IMMEDIATE");
    try {
      insertTransaction.run(
        id,
        input.kind,
        occurredAt,
        input.idempotencyKey ?? null,
        input.correlationId ?? null,
        input.reversesId ?? null,
      );
      for (const entry of input.entries) {
        insertEntry.run(id, entry.accountId, entry.amountCents, occurredAt);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return readTransaction(id, input.kind, occurredAt, false);
  }

  function statement(accountId: string, limit = 50) {
    const query = db.prepare(
      `SELECT e.id, e.amount_cents, e.created_at, t.kind, t.id AS transaction_id,
              SUM(e.amount_cents) OVER (ORDER BY e.id) AS running
       FROM entries e
       JOIN transactions t ON t.id = e.transaction_id
       WHERE e.account_id = ?
       ORDER BY e.id DESC
       LIMIT ?`,
    );
    query.setReadBigInts(true);
    const rows = query.all(accountId, limit) as {
      id: bigint;
      amount_cents: bigint;
      created_at: string;
      kind: TransactionKind;
      transaction_id: string;
      running: bigint;
    }[];

    return rows.map((r) => ({
      entryId: Number(r.id),
      transactionId: r.transaction_id,
      kind: r.kind,
      amountCents: BigInt(r.amount_cents),
      balanceCents: BigInt(r.running),
      occurredAt: r.created_at,
    }));
  }

  function reverse(transactionId: string, idempotencyKey?: string): PostedTransaction {
    const rows = entriesOf.all(transactionId) as {
      account_id: string;
      amount_cents: bigint;
    }[];
    if (rows.length === 0) throw new Error(`Unknown transaction ${transactionId}`);

    return post({
      kind: "REVERSAL",
      reversesId: transactionId,
      ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      entries: rows.map((r) => ({
        accountId: r.account_id,
        amountCents: -BigInt(r.amount_cents),
      })),
    });
  }

  function totalAcrossAllAccounts(): bigint {
    const row = globalSum.get() as { total: bigint };
    return BigInt(row.total);
  }

  return {
    db,
    openAccount,
    balance,
    post,
    reverse,
    statement,
    totalAcrossAllAccounts,
  };
}

export type Ledger = ReturnType<typeof createLedger>;
