import { z } from "zod";
import type { Quote, QuoteStore } from "./store";

const Cents = z
  .string()
  .regex(/^-?\d+$/)
  .transform(BigInt);

const WireQuote = z.object({
  ticker: z.string(),
  priceCents: Cents,
  openingPriceCents: Cents,
  changeCents: Cents,
  changeBps: z.number(),
  bidCents: Cents,
  askCents: Cents,
  at: z.string(),
});

const WireSnapshot = z.object({ quotes: z.array(WireQuote) });

export type FeedStatus = "connecting" | "live" | "degraded";

export interface EventSourceLike {
  addEventListener(type: string, listener: (event: { data: string }) => void): void;
  close(): void;
}

export interface FeedOptions {
  readonly url: string;
  readonly store: QuoteStore;
  readonly tickers?: readonly string[];
  readonly open?: (url: string) => EventSourceLike;
  readonly onStatus?: (status: FeedStatus) => void;
  /** Called when a message cannot be parsed, so a bad tick is visible. */
  readonly onMalformed?: (raw: string, reason: string) => void;
}

function buildUrl(base: string, tickers: readonly string[] | undefined): string {
  const url = new URL(base);
  if (tickers !== undefined && tickers.length > 0) {
    url.searchParams.set("tickers", tickers.join(","));
  }
  return url.toString();
}

export function connectFeed(options: FeedOptions): () => void {
  const open = options.open ?? ((url: string) => new EventSource(url) as EventSourceLike);
  const source = open(buildUrl(options.url, options.tickers));

  const report = (status: FeedStatus): void => {
    options.onStatus?.(status);
  };

  report("connecting");

  const parse = <T>(schema: z.ZodType<T>, raw: string): T | null => {
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      options.onMalformed?.(raw, "not valid JSON");
      return null;
    }

    const result = schema.safeParse(payload);
    if (!result.success) {
      options.onMalformed?.(raw, result.error.issues[0]?.message ?? "shape mismatch");
      return null;
    }
    return result.data;
  };

  source.addEventListener("open", () => {
    report("live");
  });

  source.addEventListener("error", () => {
    report("degraded");
  });

  source.addEventListener("snapshot", (event) => {
    const parsed = parse(WireSnapshot, event.data);
    if (parsed === null) return;
    options.store.applyMany(parsed.quotes as readonly Quote[]);
    report("live");
  });

  source.addEventListener("quote", (event) => {
    const parsed = parse(WireQuote, event.data);
    if (parsed === null) return;
    options.store.apply(parsed as Quote);
    report("live");
  });

  return () => {
    source.close();
  };
}
