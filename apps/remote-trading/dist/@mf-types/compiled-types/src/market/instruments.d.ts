import { type UseQueryResult } from "@tanstack/react-query";
import { z } from "zod";
declare const InstrumentsSchema: z.ZodObject<{
    instruments: z.ZodArray<z.ZodObject<{
        ticker: z.ZodString;
        name: z.ZodString;
        openingPriceCents: z.ZodPipe<z.ZodString, z.ZodTransform<bigint, string>>;
        tickSizeCents: z.ZodPipe<z.ZodString, z.ZodTransform<bigint, string>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type Instrument = z.infer<typeof InstrumentsSchema>["instruments"][number];
export declare function useInstruments(): UseQueryResult<readonly Instrument[]>;
export {};
//# sourceMappingURL=instruments.d.ts.map