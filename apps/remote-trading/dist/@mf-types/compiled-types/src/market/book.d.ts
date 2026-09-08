import { type UseQueryResult } from "@tanstack/react-query";
import { z } from "zod";
declare const BookSchema: z.ZodObject<{
    ticker: z.ZodString;
    bids: z.ZodArray<z.ZodObject<{
        priceCents: z.ZodPipe<z.ZodString, z.ZodTransform<bigint, string>>;
        quantity: z.ZodNumber;
    }, z.core.$strip>>;
    asks: z.ZodArray<z.ZodObject<{
        priceCents: z.ZodPipe<z.ZodString, z.ZodTransform<bigint, string>>;
        quantity: z.ZodNumber;
    }, z.core.$strip>>;
    at: z.ZodString;
}, z.core.$strip>;
export type OrderBook = z.infer<typeof BookSchema>;
export type BookLevel = OrderBook["bids"][number];
export declare function useOrderBook(ticker: string | null): UseQueryResult<OrderBook>;
export {};
//# sourceMappingURL=book.d.ts.map