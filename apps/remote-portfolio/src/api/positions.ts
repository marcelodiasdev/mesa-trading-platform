import type { Order, Quote } from "./schemas";

export interface Position {
  readonly ticker: string;
  readonly quantity: number;
  readonly averageCostCents: bigint;
  readonly totalCostCents: bigint;
  readonly lastPriceCents: bigint | null;
  readonly marketValueCents: bigint | null;
  readonly unrealisedCents: bigint | null;
  readonly unrealisedBps: number | null;
}

const isFilled = (order: Order): boolean =>
  order.filledQuantity > 0 &&
  (order.status === "FILLED" || order.status === "PARTIALLY_FILLED");

export function buildPositions(
  orders: readonly Order[],
  quotes: ReadonlyMap<string, Quote>,
): Position[] {
  const running = new Map<string, { quantity: number; costCents: bigint }>();

  const chronological = [...orders].sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
  );

  for (const order of chronological) {
    if (!isFilled(order)) continue;

    const price = order.averagePriceCents ?? null;
    if (price === null) continue;

    const current = running.get(order.ticker) ?? { quantity: 0, costCents: 0n };

    if (order.side === "BUY") {
      running.set(order.ticker, {
        quantity: current.quantity + order.filledQuantity,
        costCents: current.costCents + price * BigInt(order.filledQuantity),
      });
      continue;
    }

    if (current.quantity === 0) continue;

    const sold = Math.min(order.filledQuantity, current.quantity);
    const averageCost = current.costCents / BigInt(current.quantity);
    running.set(order.ticker, {
      quantity: current.quantity - sold,
      costCents: current.costCents - averageCost * BigInt(sold),
    });
  }

  const positions: Position[] = [];

  for (const [ticker, holding] of running) {
    if (holding.quantity === 0) continue;

    const quantity = BigInt(holding.quantity);
    const averageCostCents = holding.costCents / quantity;
    const quote = quotes.get(ticker);
    const lastPriceCents = quote?.priceCents ?? null;

    const marketValueCents = lastPriceCents === null ? null : lastPriceCents * quantity;
    const unrealisedCents =
      marketValueCents === null ? null : marketValueCents - holding.costCents;
    const unrealisedBps =
      unrealisedCents === null || holding.costCents === 0n
        ? null
        : Number((unrealisedCents * 10_000n) / holding.costCents);

    positions.push({
      ticker,
      quantity: holding.quantity,
      averageCostCents,
      totalCostCents: holding.costCents,
      lastPriceCents,
      marketValueCents,
      unrealisedCents,
      unrealisedBps,
    });
  }

  return positions.sort((a, b) => a.ticker.localeCompare(b.ticker));
}
