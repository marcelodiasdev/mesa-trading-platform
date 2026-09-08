import { z } from "zod";
import { centsFromTyping } from "./money-input";

export const LOT_SIZE = 100;

const PriceField = z
  .string()
  .transform(centsFromTyping)
  .refine((cents) => cents > 0n, "enter a price greater than zero");

export const TicketSchema = z
  .object({
    ticker: z.string().regex(/^[A-Z]{4}\d{1,2}F?$/, "pick an instrument"),
    side: z.enum(["BUY", "SELL"]),
    type: z.enum(["MARKET", "LIMIT", "STOP"]),
    quantity: z.coerce
      .number()
      .int("whole shares only")
      .positive("quantity must be positive")
      .refine((q) => q % LOT_SIZE === 0, `must be a multiple of ${LOT_SIZE}`),
    limitPrice: z.string(),
    stopPrice: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.type === "LIMIT") {
      const parsed = PriceField.safeParse(values.limitPrice);
      if (!parsed.success) {
        ctx.addIssue({
          code: "custom",
          path: ["limitPrice"],
          message: parsed.error.issues[0]?.message ?? "a limit order needs a price",
        });
      }
    }

    if (values.type === "STOP") {
      const parsed = PriceField.safeParse(values.stopPrice);
      if (!parsed.success) {
        ctx.addIssue({
          code: "custom",
          path: ["stopPrice"],
          message:
            parsed.error.issues[0]?.message ?? "a stop order needs a trigger price",
        });
      }
    }

    if (values.type === "MARKET" && centsFromTyping(values.limitPrice) > 0n) {
      ctx.addIssue({
        code: "custom",
        path: ["limitPrice"],
        message: "a market order takes whatever the book offers, so it carries no price",
      });
    }
  });

export type TicketValues = z.input<typeof TicketSchema>;

export interface OrderPayload {
  readonly accountId: string;
  readonly ticker: string;
  readonly side: "BUY" | "SELL";
  readonly type: "MARKET" | "LIMIT" | "STOP";
  readonly quantity: number;
  readonly limitPriceCents?: string;
  readonly stopPriceCents?: string;
  readonly referencePriceCents: string;
}

export function toPayload(
  values: TicketValues,
  accountId: string,
  referencePriceCents: bigint,
): OrderPayload {
  const limit = centsFromTyping(values.limitPrice);
  const stop = centsFromTyping(values.stopPrice);

  return {
    accountId,
    ticker: values.ticker,
    side: values.side,
    type: values.type,
    quantity: Number(values.quantity),
    ...(values.type === "LIMIT" ? { limitPriceCents: limit.toString() } : {}),
    ...(values.type === "STOP" ? { stopPriceCents: stop.toString() } : {}),
    referencePriceCents: referencePriceCents.toString(),
  };
}

export function estimateNotionalCents(
  values: TicketValues,
  referencePriceCents: bigint,
): bigint {
  const quantity = BigInt(Number(values.quantity) || 0);
  const price =
    values.type === "LIMIT" ? centsFromTyping(values.limitPrice) : referencePriceCents;
  return price * quantity;
}
