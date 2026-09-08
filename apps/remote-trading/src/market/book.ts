import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useHttp } from "@mesa/shell-sdk";
import { z } from "zod";

const Cents = z.string().regex(/^\d+$/).transform(BigInt);

const BookSchema = z.object({
  ticker: z.string(),
  bids: z.array(z.object({ priceCents: Cents, quantity: z.number().int() })),
  asks: z.array(z.object({ priceCents: Cents, quantity: z.number().int() })),
  at: z.string(),
});

export type OrderBook = z.infer<typeof BookSchema>;
export type BookLevel = OrderBook["bids"][number];

export function useOrderBook(ticker: string | null): UseQueryResult<OrderBook> {
  const http = useHttp();

  return useQuery({
    queryKey: ["market", "book", ticker],
    enabled: ticker !== null,
    queryFn: ({ signal }) =>
      http.request({
        service: "market",
        path: `/quotes/${ticker}/book`,
        query: { depth: 5 },
        schema: BookSchema,
        signal,
      }),
    refetchInterval: 1_000,
  });
}
