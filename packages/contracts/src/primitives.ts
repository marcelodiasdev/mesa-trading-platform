import { z } from "zod";

export const CentsSchema = z
  .string()
  .regex(/^-?\d+$/, "must be an integer number of cents")
  .transform((value) => BigInt(value));

export const centsToWire = (cents: bigint): string => cents.toString();

export const TickerSchema = z
  .string()
  .regex(/^[A-Z]{4}\d{1,2}F?$/, "not a valid B3 ticker");

export const AccountIdSchema = z.uuid();
export const OrderIdSchema = z.uuid();

export const IdempotencyKeySchema = z.uuid();

export const CorrelationIdSchema = z.uuid();

export const TimestampSchema = z.iso.datetime({ offset: true });

export type Ticker = z.infer<typeof TickerSchema>;
export type AccountId = z.infer<typeof AccountIdSchema>;
export type OrderId = z.infer<typeof OrderIdSchema>;
export type IdempotencyKey = z.infer<typeof IdempotencyKeySchema>;
export type CorrelationId = z.infer<typeof CorrelationIdSchema>;
