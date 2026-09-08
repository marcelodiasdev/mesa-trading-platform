import { type UseMutationResult } from "@tanstack/react-query";
import { z } from "zod";
import type { OrderPayload } from "./schema";
declare const AcceptedOrderSchema: z.ZodObject<{
    id: z.ZodString;
    ticker: z.ZodString;
    side: z.ZodEnum<{
        BUY: "BUY";
        SELL: "SELL";
    }>;
    status: z.ZodString;
    quantity: z.ZodNumber;
    averagePriceCents: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodString, z.ZodTransform<bigint, string>>, z.ZodNull]>>;
    reservationId: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNull]>>;
    replayed: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type AcceptedOrder = z.infer<typeof AcceptedOrderSchema>;
export type RejectionCode = "INSUFFICIENT_BUYING_POWER" | "INSUFFICIENT_POSITION" | "EXPOSURE_LIMIT_EXCEEDED";
export interface OrderRejected {
    readonly kind: "rejected";
    readonly code: RejectionCode | "UNKNOWN";
    readonly requiredCents?: bigint;
    readonly availableCents?: bigint;
    readonly notionalCents?: bigint;
    readonly limitCents?: bigint;
}
export interface OrderUnavailable {
    readonly kind: "unavailable";
    readonly correlationId: string;
}
export interface OrderInvalid {
    readonly kind: "invalid";
    readonly issues: readonly {
        path: string;
        message: string;
    }[];
}
export type OrderFailure = OrderRejected | OrderUnavailable | OrderInvalid;
export interface PlaceOrderInput {
    readonly payload: OrderPayload;
    readonly idempotencyKey: string;
}
type PlaceOrderResult = UseMutationResult<AcceptedOrder, OrderFailure, PlaceOrderInput>;
export declare function usePlaceOrder(): PlaceOrderResult;
export {};
//# sourceMappingURL=usePlaceOrder.d.ts.map