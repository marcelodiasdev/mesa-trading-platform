import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useHttp } from "@mesa/shell-sdk";
import { z } from "zod";

const InstrumentsSchema = z.object({
  instruments: z.array(
    z.object({
      ticker: z.string(),
      name: z.string(),
      openingPriceCents: z.string().regex(/^\d+$/).transform(BigInt),
      tickSizeCents: z.string().regex(/^\d+$/).transform(BigInt),
    }),
  ),
});

export type Instrument = z.infer<typeof InstrumentsSchema>["instruments"][number];

export function useInstruments(): UseQueryResult<readonly Instrument[]> {
  const http = useHttp();

  return useQuery({
    queryKey: ["market", "instruments"],
    queryFn: ({ signal }) =>
      http.request({
        service: "market",
        path: "/instruments",
        schema: InstrumentsSchema,
        signal,
      }),
    select: (data) => data.instruments,
    staleTime: Infinity,
  });
}
