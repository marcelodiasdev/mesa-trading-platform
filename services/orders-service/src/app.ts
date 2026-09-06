import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import {
  AccountsUnavailableError,
  InsufficientFundsError,
  type AccountsClient,
} from "./accounts-client.ts";
import { assessRisk, type RiskLimits } from "./risk.ts";
import {
  IllegalTransitionError,
  OrderNotFoundError,
  OverfillError,
  createOrderRepository,
  type Order,
  type OrderRepository,
} from "./repository.ts";
import { LOT_SIZE } from "@mesa/contracts";

const cents = (value: bigint | null): string | null =>
  value === null ? null : value.toString();

const CentsSchema = z
  .string()
  .regex(/^\d+$/, "must be an integer number of cents")
  .transform(BigInt);

const PlaceOrderBodySchema = z
  .object({
    accountId: z.string().min(1),
    ticker: z.string().regex(/^[A-Z]{4}\d{1,2}F?$/, "not a valid B3 ticker"),
    side: z.enum(["BUY", "SELL"]),
    type: z.enum(["MARKET", "LIMIT", "STOP"]),
    quantity: z
      .int()
      .positive()
      .refine((q) => q % LOT_SIZE === 0, `must be a multiple of ${LOT_SIZE}`),
    limitPriceCents: CentsSchema.optional(),
    stopPriceCents: CentsSchema.optional(),
    referencePriceCents: CentsSchema,
  })
  .superRefine((input, ctx) => {
    if (input.type === "LIMIT" && input.limitPriceCents === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["limitPriceCents"],
        message: "a limit order requires a limit price",
      });
    }
    if (input.type === "STOP" && input.stopPriceCents === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["stopPriceCents"],
        message: "a stop order requires a stop price",
      });
    }
    if (input.type === "MARKET" && input.limitPriceCents !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["limitPriceCents"],
        message: "a market order must not carry a limit price",
      });
    }
  });

const OrderParamsSchema = z.object({ orderId: z.string().min(1) });
const AccountParamsSchema = z.object({ accountId: z.string().min(1) });
const FillBodySchema = z.object({
  quantity: z.int().positive(),
  priceCents: CentsSchema,
});

export interface AppOptions {
  readonly accounts: AccountsClient;
  readonly repository?: OrderRepository;
  readonly limits?: RiskLimits;
  readonly logger?: boolean;
}

const serialise = (order: Order) => ({
  id: order.id,
  accountId: order.accountId,
  ticker: order.ticker,
  side: order.side,
  type: order.type,
  status: order.status,
  quantity: order.quantity,
  filledQuantity: order.filledQuantity,
  limitPriceCents: cents(order.limitPriceCents),
  stopPriceCents: cents(order.stopPriceCents),
  averagePriceCents: cents(order.averagePriceCents),
  reservationId: order.reservationId,
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
});

export function buildApp(options: AppOptions): FastifyInstance {
  const repo = options.repository ?? createOrderRepository();
  const accounts = options.accounts;

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

  app.addHook("onSend", async (request, reply) => {
    reply.header("X-Correlation-Id", request.id);
  });

  app.get("/health", async () => ({ status: "ok" }));

  app.post("/orders", async (request, reply) => {
    const idempotencyKey = request.headers["idempotency-key"];
    if (typeof idempotencyKey !== "string" || idempotencyKey.length === 0) {
      return reply.code(400).send({ error: "Idempotency-Key header is required" });
    }

    const body = PlaceOrderBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(422).send({
        error: "invalid order",
        issues: body.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
    }

    const input = body.data;

    const order = repo.place({
      accountId: input.accountId,
      ticker: input.ticker,
      side: input.side,
      type: input.type,
      quantity: input.quantity,
      ...(input.limitPriceCents === undefined
        ? {}
        : { limitPriceCents: input.limitPriceCents }),
      ...(input.stopPriceCents === undefined
        ? {}
        : { stopPriceCents: input.stopPriceCents }),
      idempotencyKey,
      correlationId: request.id,
    });

    if (order.replayed) {
      return reply.code(200).send({ ...serialise(repo.get(order.id)), replayed: true });
    }

    let snapshot;
    try {
      snapshot = await accounts.snapshot(input.accountId, request.id);
    } catch (error) {
      if (error instanceof AccountsUnavailableError) {
        repo.advance(order.id, "REJECTED", "ACCOUNTS_UNAVAILABLE");
        return reply.code(503).send({
          error: "accounts service unavailable",
          order: serialise(repo.get(order.id)),
        });
      }
      throw error;
    }

    const decision = assessRisk(
      {
        side: input.side,
        type: input.type,
        quantity: input.quantity,
        referencePriceCents: input.referencePriceCents,
        buyingPowerCents: snapshot.buyingPowerCents,
        equityCents: snapshot.equityCents,
        heldQuantity: repo.heldQuantity(input.accountId, input.ticker),
      },
      options.limits,
    );

    if (!decision.accepted) {
      repo.advance(order.id, "REJECTED", decision.rejection?.code);
      return reply.code(422).send({
        error: "rejected by pre-trade risk",
        rejection: decision.rejection && {
          ...decision.rejection,
          ...("requiredCents" in decision.rejection
            ? {
                requiredCents: decision.rejection.requiredCents.toString(),
                availableCents: decision.rejection.availableCents.toString(),
              }
            : {}),
          ...("notionalCents" in decision.rejection
            ? {
                notionalCents: decision.rejection.notionalCents.toString(),
                limitCents: decision.rejection.limitCents.toString(),
              }
            : {}),
        },
        order: serialise(repo.get(order.id)),
      });
    }

    if (input.side === "BUY") {
      try {
        const reservation = await accounts.reserve(
          input.accountId,
          decision.notionalCents,
          `reserve:${order.id}`,
          request.id,
        );
        repo.attach(order.id, reservation.reservationId);
      } catch (error) {
        if (error instanceof InsufficientFundsError) {
          repo.advance(order.id, "REJECTED", "INSUFFICIENT_BUYING_POWER");
          return reply.code(422).send({
            error: "rejected by pre-trade risk",
            rejection: {
              code: "INSUFFICIENT_BUYING_POWER",
              requiredCents: error.requestedCents.toString(),
              availableCents: error.availableCents.toString(),
            },
            order: serialise(repo.get(order.id)),
          });
        }
        repo.advance(order.id, "REJECTED", "ACCOUNTS_UNAVAILABLE");
        return reply.code(503).send({
          error: "accounts service unavailable",
          order: serialise(repo.get(order.id)),
        });
      }
    }

    repo.advance(order.id, "VALIDATED");
    const working = repo.advance(order.id, "WORKING");

    return reply.code(201).send({ ...serialise(working), replayed: false });
  });

  app.get("/orders/:orderId", async (request, reply) => {
    const params = OrderParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "invalid order id" });

    try {
      return serialise(repo.get(params.data.orderId));
    } catch (error) {
      if (error instanceof OrderNotFoundError) {
        return reply.code(404).send({ error: "unknown order" });
      }
      throw error;
    }
  });

  app.get("/orders/:orderId/events", async (request, reply) => {
    const params = OrderParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "invalid order id" });

    try {
      repo.get(params.data.orderId);
    } catch {
      return reply.code(404).send({ error: "unknown order" });
    }

    return {
      orderId: params.data.orderId,
      events: repo.events(params.data.orderId).map((event) => ({
        sequence: event.sequence,
        from: event.from,
        to: event.to,
        filledDelta: event.filledDelta,
        priceCents: cents(event.priceCents),
        reason: event.reason,
        occurredAt: event.occurredAt,
      })),
    };
  });

  app.get("/accounts/:accountId/orders", async (request, reply) => {
    const params = AccountParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "invalid account id" });

    return {
      accountId: params.data.accountId,
      orders: repo.listByAccount(params.data.accountId).map(serialise),
    };
  });

  app.post("/orders/:orderId/cancel", async (request, reply) => {
    const params = OrderParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "invalid order id" });

    const idempotencyKey = request.headers["idempotency-key"];
    if (typeof idempotencyKey !== "string" || idempotencyKey.length === 0) {
      return reply.code(400).send({ error: "Idempotency-Key header is required" });
    }

    let current: Order;
    try {
      current = repo.get(params.data.orderId);
    } catch {
      return reply.code(404).send({ error: "unknown order" });
    }

    if (current.status === "CANCELLED") {
      return reply.code(200).send({ ...serialise(current), replayed: true });
    }

    let cancelled: Order;
    try {
      cancelled = repo.advance(params.data.orderId, "CANCELLED", "client requested");
    } catch (error) {
      if (error instanceof IllegalTransitionError) {
        return reply.code(409).send({
          error: "order can no longer be cancelled",
          status: current.status,
        });
      }
      throw error;
    }

    if (cancelled.reservationId) {
      try {
        await accounts.release(
          cancelled.accountId,
          cancelled.reservationId,
          `release:${cancelled.id}`,
          request.id,
        );
      } catch {
        request.log.error(
          { orderId: cancelled.id, reservationId: cancelled.reservationId },
          "reservation left dangling after cancel",
        );
      }
    }

    return reply.code(200).send({ ...serialise(cancelled), replayed: false });
  });

  app.post("/internal/orders/:orderId/fills", async (request, reply) => {
    const params = OrderParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "invalid order id" });

    const body = FillBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(422).send({ error: "invalid fill" });
    }

    try {
      const filled = repo.fill(
        params.data.orderId,
        body.data.quantity,
        body.data.priceCents,
      );
      return serialise(filled);
    } catch (error) {
      if (error instanceof OrderNotFoundError) {
        return reply.code(404).send({ error: "unknown order" });
      }
      if (error instanceof OverfillError) {
        return reply.code(409).send({ error: error.message });
      }
      if (error instanceof IllegalTransitionError) {
        return reply.code(409).send({ error: error.message });
      }
      throw error;
    }
  });

  return app;
}
