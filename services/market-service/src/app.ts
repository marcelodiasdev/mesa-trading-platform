import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import {
  createMarketEngine,
  type MarketEngine,
  type Quote,
  type OrderBook,
} from "./engine.ts";
import { createQuoteHub, type QuoteHub } from "./hub.ts";
import { INSTRUMENTS } from "./instruments.ts";

const TickerParamsSchema = z.object({
  ticker: z.string().regex(/^[A-Z]{4}\d{1,2}F?$/, "not a valid B3 ticker"),
});

const BookQuerySchema = z.object({
  depth: z.coerce.number().int().min(1).max(20).default(5),
});

const StreamQuerySchema = z.object({
  tickers: z
    .string()
    .optional()
    .transform((value) =>
      value === undefined || value.length === 0
        ? null
        : value
            .split(",")
            .map((t) => t.trim().toUpperCase())
            .filter(Boolean),
    ),
});

export interface AppOptions {
  readonly engine?: MarketEngine;
  readonly hub?: QuoteHub;
  readonly logger?: boolean;
  readonly heartbeatMs?: number;
}

const serialiseQuote = (quote: Quote) => ({
  ticker: quote.ticker,
  priceCents: quote.priceCents.toString(),
  openingPriceCents: quote.openingPriceCents.toString(),
  changeCents: quote.changeCents.toString(),
  changeBps: quote.changeBps,
  bidCents: quote.bidCents.toString(),
  askCents: quote.askCents.toString(),
  at: quote.at,
});

const serialiseBook = (book: OrderBook) => ({
  ticker: book.ticker,
  bids: book.bids.map((level) => ({
    priceCents: level.priceCents.toString(),
    quantity: level.quantity,
  })),
  asks: book.asks.map((level) => ({
    priceCents: level.priceCents.toString(),
    quantity: level.quantity,
  })),
  at: book.at,
});

export function buildApp(options: AppOptions = {}): FastifyInstance {
  const engine = options.engine ?? createMarketEngine();
  const hub = options.hub ?? createQuoteHub(engine);
  const heartbeatMs = options.heartbeatMs ?? 15_000;

  const app = Fastify({
    logger: options.logger ?? false,
    genReqId: (request) =>
      (request.headers["x-correlation-id"] as string | undefined) ?? crypto.randomUUID(),
  });

  app.register(cors, {
    origin: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Correlation-Id"],
    exposedHeaders: ["X-Correlation-Id"],
  });

  app.addHook("onClose", async () => {
    hub.stop();
  });

  app.get("/health", async () => ({ status: "ok", subscribers: hub.subscriberCount }));

  app.get("/instruments", async () => ({
    instruments: INSTRUMENTS.map((instrument) => ({
      ticker: instrument.ticker,
      name: instrument.name,
      openingPriceCents: instrument.openingPriceCents.toString(),
      tickSizeCents: instrument.tickSizeCents.toString(),
    })),
  }));

  app.get("/quotes", async () => ({
    quotes: engine.snapshot().map(serialiseQuote),
  }));

  app.get("/quotes/:ticker", async (request, reply) => {
    const params = TickerParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "invalid ticker" });

    const quote = engine.quote(params.data.ticker);
    if (quote === undefined) return reply.code(404).send({ error: "unknown instrument" });

    return serialiseQuote(quote);
  });

  app.get("/quotes/:ticker/book", async (request, reply) => {
    const params = TickerParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "invalid ticker" });

    const query = BookQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: "invalid depth" });

    const book = engine.book(params.data.ticker, query.data.depth);
    if (book === undefined) return reply.code(404).send({ error: "unknown instrument" });

    return serialiseBook(book);
  });

  app.get("/stream", (request, reply) => {
    const query = StreamQuerySchema.safeParse(request.query);
    if (!query.success) {
      reply.code(400).send({ error: "invalid tickers" });
      return;
    }

    const wanted = query.data.tickers;
    const watching = wanted === null ? null : new Set(wanted);

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*",
    });

    const send = (event: string, data: unknown): void => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const initial = engine
      .snapshot()
      .filter((quote) => watching === null || watching.has(quote.ticker));
    send("snapshot", { quotes: initial.map(serialiseQuote) });

    const unsubscribe = hub.subscribe((quote) => {
      if (watching !== null && !watching.has(quote.ticker)) return;
      send("quote", serialiseQuote(quote));
    });

    const heartbeat = setInterval(() => {
      reply.raw.write(`: keep-alive\n\n`);
    }, heartbeatMs);
    heartbeat.unref?.();

    const close = (): void => {
      clearInterval(heartbeat);
      unsubscribe();
      reply.raw.end();
    };

    request.raw.on("close", close);
    request.raw.on("error", close);
  });

  return app;
}
