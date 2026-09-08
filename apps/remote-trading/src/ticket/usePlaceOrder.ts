import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { HttpError, useHttp } from "@mesa/shell-sdk";
import { z } from "zod";
import type { OrderPayload } from "./schema";

const Cents = z.union([
  z
    .string()
    .regex(/^-?\d+$/)
    .transform(BigInt),
  z.null(),
]);

const AcceptedOrderSchema = z.object({
  id: z.string(),
  ticker: z.string(),
  side: z.enum(["BUY", "SELL"]),
  status: z.string(),
  quantity: z.number().int(),
  averagePriceCents: Cents.optional(),
  reservationId: z.union([z.string(), z.null()]).optional(),
  replayed: z.boolean().optional(),
});

export type AcceptedOrder = z.infer<typeof AcceptedOrderSchema>;

export type RejectionCode =
  "INSUFFICIENT_BUYING_POWER" | "INSUFFICIENT_POSITION" | "EXPOSURE_LIMIT_EXCEEDED";

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
  readonly issues: readonly { path: string; message: string }[];
}

export type OrderFailure = OrderRejected | OrderUnavailable | OrderInvalid;

const asCents = (value: unknown): bigint | undefined =>
  typeof value === "string" && /^-?\d+$/.test(value) ? BigInt(value) : undefined;

function interpret(error: unknown): OrderFailure {
  if (!(error instanceof HttpError)) {
    return { kind: "unavailable", correlationId: "unknown" };
  }

  const body = (error.body ?? {}) as Record<string, unknown>;

  if (error.status === 422 && body.rejection !== undefined) {
    const rejection = body.rejection as Record<string, unknown>;
    return {
      kind: "rejected",
      code: (rejection.code as RejectionCode | undefined) ?? "UNKNOWN",
      ...(asCents(rejection.requiredCents) === undefined
        ? {}
        : { requiredCents: asCents(rejection.requiredCents)! }),
      ...(asCents(rejection.availableCents) === undefined
        ? {}
        : { availableCents: asCents(rejection.availableCents)! }),
      ...(asCents(rejection.notionalCents) === undefined
        ? {}
        : { notionalCents: asCents(rejection.notionalCents)! }),
      ...(asCents(rejection.limitCents) === undefined
        ? {}
        : { limitCents: asCents(rejection.limitCents)! }),
    };
  }

  if (error.status === 422 && Array.isArray(body.issues)) {
    return {
      kind: "invalid",
      issues: body.issues as readonly { path: string; message: string }[],
    };
  }

  return { kind: "unavailable", correlationId: error.correlationId };
}

export interface PlaceOrderInput {
  readonly payload: OrderPayload;
  readonly idempotencyKey: string;
}

type PlaceOrderResult = UseMutationResult<AcceptedOrder, OrderFailure, PlaceOrderInput>;

export function usePlaceOrder(): PlaceOrderResult {
  const http = useHttp();
  const queryClient = useQueryClient();

  return useMutation<AcceptedOrder, OrderFailure, PlaceOrderInput>({
    mutationFn: async ({ payload, idempotencyKey }) => {
      try {
        return await http.request({
          service: "orders",
          path: "/orders",
          method: "POST",
          body: payload,
          idempotencyKey,
          schema: AcceptedOrderSchema,
        });
      } catch (error) {
        throw interpret(error);
      }
    },

    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
    },

    retry: false,
  });
}
