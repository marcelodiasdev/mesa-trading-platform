import { z } from "zod";
import {
  AccountIdSchema,
  CentsSchema,
  IdempotencyKeySchema,
  OrderIdSchema,
  TickerSchema,
  TimestampSchema,
} from "./primitives";

export const ORDER_SIDES = ["BUY", "SELL"] as const;
export const OrderSideSchema = z.enum(ORDER_SIDES);
export type OrderSide = z.infer<typeof OrderSideSchema>;

export const ORDER_TYPES = ["MARKET", "LIMIT", "STOP"] as const;
export const OrderTypeSchema = z.enum(ORDER_TYPES);
export type OrderType = z.infer<typeof OrderTypeSchema>;

export const ORDER_STATUSES = [
  "RECEIVED",
  "VALIDATED",
  "WORKING",
  "PARTIALLY_FILLED",
  "FILLED",
  "CANCELLED",
  "REJECTED",
  "EXPIRED",
] as const;
export const OrderStatusSchema = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  RECEIVED: ["VALIDATED", "REJECTED"],
  VALIDATED: ["WORKING", "REJECTED"],
  WORKING: ["PARTIALLY_FILLED", "FILLED", "CANCELLED", "EXPIRED"],
  PARTIALLY_FILLED: ["PARTIALLY_FILLED", "FILLED", "CANCELLED", "EXPIRED"],
  FILLED: [],
  CANCELLED: [],
  REJECTED: [],
  EXPIRED: [],
} as const;

export const TERMINAL_STATUSES = ORDER_STATUSES.filter(
  (status) => ORDER_TRANSITIONS[status].length === 0,
);

export const isTerminal = (status: OrderStatus): boolean =>
  ORDER_TRANSITIONS[status].length === 0;

export const canTransition = (from: OrderStatus, to: OrderStatus): boolean =>
  ORDER_TRANSITIONS[from].includes(to);

export class IllegalTransitionError extends Error {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
  ) {
    super(`Illegal order transition: ${from} -> ${to}`);
    this.name = "IllegalTransitionError";
  }
}

export function transition(from: OrderStatus, to: OrderStatus): OrderStatus {
  if (!canTransition(from, to)) throw new IllegalTransitionError(from, to);
  return to;
}

export const LOT_SIZE = 100;

const baseOrderInput = z.object({
  accountId: AccountIdSchema,
  ticker: TickerSchema,
  side: OrderSideSchema,
  type: OrderTypeSchema,
  quantity: z
    .int()
    .positive()
    .refine((q) => q % LOT_SIZE === 0, `must be a multiple of ${LOT_SIZE}`),
  limitPriceCents: CentsSchema.optional(),
  stopPriceCents: CentsSchema.optional(),
  idempotencyKey: IdempotencyKeySchema,
});

export const PlaceOrderInputSchema = baseOrderInput.superRefine((input, ctx) => {
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
  if (input.limitPriceCents !== undefined && input.limitPriceCents <= 0n) {
    ctx.addIssue({
      code: "custom",
      path: ["limitPriceCents"],
      message: "price must be greater than zero",
    });
  }
});

export type PlaceOrderInput = z.infer<typeof PlaceOrderInputSchema>;

export const OrderSchema = z.object({
  id: OrderIdSchema,
  accountId: AccountIdSchema,
  ticker: TickerSchema,
  side: OrderSideSchema,
  type: OrderTypeSchema,
  status: OrderStatusSchema,
  quantity: z.int().positive(),
  filledQuantity: z.int().nonnegative(),
  limitPriceCents: CentsSchema.optional(),
  stopPriceCents: CentsSchema.optional(),
  averagePriceCents: CentsSchema.optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export type Order = z.infer<typeof OrderSchema>;

export const OrderEventSchema = z.object({
  orderId: OrderIdSchema,
  sequence: z.int().positive(),
  from: OrderStatusSchema.nullable(),
  to: OrderStatusSchema,
  occurredAt: TimestampSchema,
  reason: z.string().max(200).optional(),
});

export type OrderEvent = z.infer<typeof OrderEventSchema>;
