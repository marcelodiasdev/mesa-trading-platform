import { type UseQueryResult } from "@tanstack/react-query";
import { type Balance, type Order, type Quote, type Statement } from "./schemas";
export declare const portfolioKeys: {
    balance: (accountId: string) => readonly ["portfolio", string, "balance"];
    statement: (accountId: string) => readonly ["portfolio", string, "statement"];
    orders: (accountId: string) => readonly ["portfolio", string, "orders"];
    quotes: () => readonly ["market", "quotes"];
};
export declare function useBalance(): UseQueryResult<Balance>;
export declare function useStatement(limit?: number): UseQueryResult<Statement>;
export declare function useOrders(): UseQueryResult<readonly Order[]>;
/**
 * The portfolio marks positions to market on a slow poll rather than the live
 * feed. A statement screen does not need sub-second prices, and the streaming
 * subscription belongs to the trading remote.
 */
export declare function useQuotes(): UseQueryResult<ReadonlyMap<string, Quote>>;
//# sourceMappingURL=queries.d.ts.map