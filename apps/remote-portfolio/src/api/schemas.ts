import { z } from "zod";

const Cents = z
  .string()
  .regex(/^-?\d+$/, "must be an integer number of cents")
  .transform(BigInt);

const NullableCents = z.union([Cents, z.null()]);

export const BalanceSchema = z.object({
  accountId: z.string(),
  buyingPowerCents: Cents,
  reservedCents: Cents,
  equityCents: Cents,
  currency: z.literal("BRL"),
});

export const StatementSchema = z.object({
  accountId: z.string(),
  lines: z.array(
    z.object({
      entryId: z.number().int(),
      transactionId: z.string(),
      kind: z.enum([
        "DEPOSIT",
        "WITHDRAWAL",
        "RESERVATION",
        "RELEASE",
        "TRADE",
        "SETTLEMENT",
        "FEE",
        "REVERSAL",
      ]),
      amountCents: Cents,
      balanceCents: Cents,
      occurredAt: z.string(),
    }),
  ),
});

export const OrderSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  ticker: z.string(),
  side: z.enum(["BUY", "SELL"]),
  type: z.enum(["MARKET", "LIMIT", "STOP"]),
  status: z.enum([
    "RECEIVED",
    "VALIDATED",
    "WORKING",
    "PARTIALLY_FILLED",
    "FILLED",
    "CANCELLED",
    "REJECTED",
    "EXPIRED",
  ]),
  quantity: z.number().int(),
  filledQuantity: z.number().int(),
  limitPriceCents: NullableCents.optional(),
  stopPriceCents: NullableCents.optional(),
  averagePriceCents: NullableCents.optional(),
  reservationId: z.union([z.string(), z.null()]).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const OrdersSchema = z.object({
  accountId: z.string(),
  orders: z.array(OrderSchema),
});

export const QuotesSchema = z.object({
  quotes: z.array(
    z.object({
      ticker: z.string(),
      priceCents: Cents,
      openingPriceCents: Cents,
      changeCents: Cents,
      changeBps: z.number(),
      bidCents: Cents,
      askCents: Cents,
      at: z.string(),
    }),
  ),
});

export type Balance = z.infer<typeof BalanceSchema>;
export type Statement = z.infer<typeof StatementSchema>;
export type Order = z.infer<typeof OrderSchema>;
export type Quotes = z.infer<typeof QuotesSchema>;
export type Quote = Quotes["quotes"][number];
