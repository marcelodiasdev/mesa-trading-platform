import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { UnbalancedTransactionError, createLedger, type Ledger } from "./ledger.ts";

const cents = (value: bigint): string => value.toString();

const AmountSchema = z
  .string()
  .regex(/^\d+$/, "amount must be an integer number of cents")
  .transform(BigInt)
  .refine((v) => v > 0n, "amount must be positive");

const DepositBodySchema = z.object({ amountCents: AmountSchema });
const AccountParamsSchema = z.object({ accountId: z.string().min(1) });
const StatementQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export interface AppOptions {
  readonly ledger?: Ledger;
  readonly logger?: boolean;
}

const EXTERNAL_ACCOUNT = "external:banking";

export function buildApp(options: AppOptions = {}): FastifyInstance {
  const ledger = options.ledger ?? createLedger();
  ledger.openAccount(EXTERNAL_ACCOUNT, "EXTERNAL");

  const app = Fastify({
    logger: options.logger ?? false,
    genReqId: (request) =>
      (request.headers["x-correlation-id"] as string | undefined) ?? crypto.randomUUID(),
  });

  app.register(cors, {
    origin: true,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Idempotency-Key",
      "X-Correlation-Id",
    ],
    exposedHeaders: ["X-Correlation-Id"],
  });

  /** Echo the correlation id back, so the client can tie a trace to a report. */
  app.addHook("onSend", async (request, reply) => {
    reply.header("X-Correlation-Id", request.id);
  });

  app.get("/health", async () => ({ status: "ok" }));

  app.get("/accounts/:accountId/balance", async (request, reply) => {
    const params = AccountParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "invalid account id" });

    return {
      accountId: params.data.accountId,
      balanceCents: cents(ledger.balance(params.data.accountId)),
      currency: "BRL",
    };
  });

  app.get("/accounts/:accountId/statement", async (request, reply) => {
    const params = AccountParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "invalid account id" });

    const query = StatementQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({
        error: "invalid query",
        issues: query.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
    }

    const lines = ledger.statement(params.data.accountId, query.data.limit);
    return {
      accountId: params.data.accountId,
      lines: lines.map((line) => ({
        entryId: line.entryId,
        transactionId: line.transactionId,
        kind: line.kind,
        amountCents: cents(line.amountCents),
        balanceCents: cents(line.balanceCents),
        occurredAt: line.occurredAt,
      })),
    };
  });

  app.post("/accounts/:accountId/deposits", async (request, reply) => {
    const params = AccountParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "invalid account id" });

    const idempotencyKey = request.headers["idempotency-key"];
    if (typeof idempotencyKey !== "string" || idempotencyKey.length === 0) {
      return reply.code(400).send({ error: "Idempotency-Key header is required" });
    }

    const body = DepositBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(422).send({
        error: "invalid deposit",
        issues: body.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
    }

    const accountId = params.data.accountId;
    ledger.openAccount(accountId, "CLIENT_CASH");

    try {
      const tx = ledger.post({
        kind: "DEPOSIT",
        idempotencyKey,
        correlationId: request.id,
        entries: [
          { accountId: EXTERNAL_ACCOUNT, amountCents: -body.data.amountCents },
          { accountId, amountCents: body.data.amountCents },
        ],
      });

      return reply.code(tx.replayed ? 200 : 201).send({
        transactionId: tx.id,
        occurredAt: tx.occurredAt,
        replayed: tx.replayed,
        balanceCents: cents(ledger.balance(accountId)),
      });
    } catch (error) {
      if (error instanceof UnbalancedTransactionError) {
        request.log.error({ delta: error.deltaCents.toString() }, "ledger imbalance");
        return reply.code(500).send({ error: "ledger imbalance" });
      }
      throw error;
    }
  });

  app.get("/internal/reconciliation", async () => {
    const total = ledger.totalAcrossAllAccounts();
    return { balanced: total === 0n, deltaCents: cents(total) };
  });

  return app;
}
