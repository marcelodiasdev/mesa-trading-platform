import { z } from "zod";
export declare const BalanceSchema: z.ZodObject<{
    accountId: z.ZodString;
    buyingPowerCents: z.ZodPipe<z.ZodString, z.ZodTransform<bigint, string>>;
    reservedCents: z.ZodPipe<z.ZodString, z.ZodTransform<bigint, string>>;
    equityCents: z.ZodPipe<z.ZodString, z.ZodTransform<bigint, string>>;
    currency: z.ZodLiteral<"BRL">;
}, z.core.$strip>;
export declare const StatementSchema: z.ZodObject<{
    accountId: z.ZodString;
    lines: z.ZodArray<z.ZodObject<{
        entryId: z.ZodNumber;
        transactionId: z.ZodString;
        kind: z.ZodEnum<{
            DEPOSIT: "DEPOSIT";
            WITHDRAWAL: "WITHDRAWAL";
            RESERVATION: "RESERVATION";
            RELEASE: "RELEASE";
            TRADE: "TRADE";
            SETTLEMENT: "SETTLEMENT";
            FEE: "FEE";
            REVERSAL: "REVERSAL";
        }>;
        amountCents: z.ZodPipe<z.ZodString, z.ZodTransform<bigint, string>>;
        balanceCents: z.ZodPipe<z.ZodString, z.ZodTransform<bigint, string>>;
        occurredAt: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const OrderSchema: z.ZodObject<{
    id: z.ZodString;
    accountId: z.ZodString;
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
    status: z.ZodEnum<{
        RECEIVED: "RECEIVED";
        VALIDATED: "VALIDATED";
        WORKING: "WORKING";
        PARTIALLY_FILLED: "PARTIALLY_FILLED";
        FILLED: "FILLED";
        CANCELLED: "CANCELLED";
        REJECTED: "REJECTED";
        EXPIRED: "EXPIRED";
    }>;
    quantity: z.ZodNumber;
    filledQuantity: z.ZodNumber;
    limitPriceCents: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodString, z.ZodTransform<bigint, string>>, z.ZodNull]>>;
    stopPriceCents: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodString, z.ZodTransform<bigint, string>>, z.ZodNull]>>;
    averagePriceCents: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodString, z.ZodTransform<bigint, string>>, z.ZodNull]>>;
    reservationId: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNull]>>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, z.core.$strip>;
export declare const OrdersSchema: z.ZodObject<{
    accountId: z.ZodString;
    orders: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        accountId: z.ZodString;
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
        status: z.ZodEnum<{
            RECEIVED: "RECEIVED";
            VALIDATED: "VALIDATED";
            WORKING: "WORKING";
            PARTIALLY_FILLED: "PARTIALLY_FILLED";
            FILLED: "FILLED";
            CANCELLED: "CANCELLED";
            REJECTED: "REJECTED";
            EXPIRED: "EXPIRED";
        }>;
        quantity: z.ZodNumber;
        filledQuantity: z.ZodNumber;
        limitPriceCents: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodString, z.ZodTransform<bigint, string>>, z.ZodNull]>>;
        stopPriceCents: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodString, z.ZodTransform<bigint, string>>, z.ZodNull]>>;
        averagePriceCents: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodString, z.ZodTransform<bigint, string>>, z.ZodNull]>>;
        reservationId: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNull]>>;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const QuotesSchema: z.ZodObject<{
    quotes: z.ZodArray<z.ZodObject<{
        ticker: z.ZodString;
        priceCents: z.ZodPipe<z.ZodString, z.ZodTransform<bigint, string>>;
        openingPriceCents: z.ZodPipe<z.ZodString, z.ZodTransform<bigint, string>>;
        changeCents: z.ZodPipe<z.ZodString, z.ZodTransform<bigint, string>>;
        changeBps: z.ZodNumber;
        bidCents: z.ZodPipe<z.ZodString, z.ZodTransform<bigint, string>>;
        askCents: z.ZodPipe<z.ZodString, z.ZodTransform<bigint, string>>;
        at: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type Balance = z.infer<typeof BalanceSchema>;
export type Statement = z.infer<typeof StatementSchema>;
export type Order = z.infer<typeof OrderSchema>;
export type Quotes = z.infer<typeof QuotesSchema>;
export type Quote = Quotes["quotes"][number];
//# sourceMappingURL=schemas.d.ts.map