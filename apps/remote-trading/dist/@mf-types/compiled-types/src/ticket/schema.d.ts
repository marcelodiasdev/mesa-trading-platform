import { z } from "zod";
export declare const LOT_SIZE = 100;
export declare const TicketSchema: z.ZodObject<{
    ticker: z.ZodString;
    side: z.ZodEnum<{
        BUY: "BUY";
        SELL: "SELL";
    }>;
    type: z.ZodEnum<{
        MARKET: "MARKET";
        LIMIT: "LIMIT";
        STOP: "STOP";
    }>;
    quantity: z.ZodCoercedNumber<unknown>;
    limitPrice: z.ZodString;
    stopPrice: z.ZodString;
}, z.core.$strip>;
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
export declare function toPayload(values: TicketValues, accountId: string, referencePriceCents: bigint): OrderPayload;
export declare function estimateNotionalCents(values: TicketValues, referencePriceCents: bigint): bigint;
//# sourceMappingURL=schema.d.ts.map