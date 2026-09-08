import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useHttp, useSession, type HttpClient } from "@mesa/shell-sdk";
import {
  BalanceSchema,
  OrdersSchema,
  QuotesSchema,
  StatementSchema,
  type Balance,
  type Order,
  type Quote,
  type Statement,
} from "./schemas";

export const portfolioKeys = {
  balance: (accountId: string) => ["portfolio", accountId, "balance"] as const,
  statement: (accountId: string) => ["portfolio", accountId, "statement"] as const,
  orders: (accountId: string) => ["portfolio", accountId, "orders"] as const,
  quotes: () => ["market", "quotes"] as const,
};

const REFRESH_MS = 5_000;

export function useBalance(): UseQueryResult<Balance> {
  const http = useHttp();
  const { accountId } = useSession();

  return useQuery({
    queryKey: portfolioKeys.balance(accountId),
    queryFn: ({ signal }) =>
      http.request({
        service: "accounts",
        path: `/accounts/${accountId}/balance`,
        schema: BalanceSchema,
        signal,
      }),
    refetchInterval: REFRESH_MS,
  });
}

export function useStatement(limit = 25): UseQueryResult<Statement> {
  const http = useHttp();
  const { accountId } = useSession();

  return useQuery({
    queryKey: [...portfolioKeys.statement(accountId), limit],
    queryFn: ({ signal }) =>
      http.request({
        service: "accounts",
        path: `/accounts/${accountId}/statement`,
        query: { limit },
        schema: StatementSchema,
        signal,
      }),
    refetchInterval: REFRESH_MS,
  });
}

export function useOrders(): UseQueryResult<readonly Order[]> {
  const http = useHttp();
  const { accountId } = useSession();

  return useQuery({
    queryKey: portfolioKeys.orders(accountId),
    queryFn: ({ signal }) =>
      http.request({
        service: "orders",
        path: `/accounts/${accountId}/orders`,
        schema: OrdersSchema,
        signal,
      }),
    select: (data) => data.orders,
    refetchInterval: REFRESH_MS,
  });
}

/**
 * The portfolio marks positions to market on a slow poll rather than the live
 * feed. A statement screen does not need sub-second prices, and the streaming
 * subscription belongs to the trading remote.
 */
export function useQuotes(): UseQueryResult<ReadonlyMap<string, Quote>> {
  const http: HttpClient = useHttp();

  return useQuery({
    queryKey: portfolioKeys.quotes(),
    queryFn: ({ signal }) =>
      http.request({
        service: "market",
        path: "/quotes",
        schema: QuotesSchema,
        signal,
      }),
    select: (data) => new Map(data.quotes.map((quote) => [quote.ticker, quote])),
    refetchInterval: REFRESH_MS,
  });
}
