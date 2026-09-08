import { z } from "zod";

const EnvSchema = z.object({
  VITE_ACCOUNTS_URL: z.string().url().default("http://localhost:4001/"),
  VITE_ORDERS_URL: z.string().url().default("http://localhost:4002/"),
  VITE_MARKET_URL: z.string().url().default("http://localhost:4003/"),
});

const parsed = EnvSchema.safeParse(import.meta.env);

if (!parsed.success) {
  const detail = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid environment configuration — ${detail}`);
}

export const config = {
  serviceUrls: {
    accounts: parsed.data.VITE_ACCOUNTS_URL,
    orders: parsed.data.VITE_ORDERS_URL,
    market: parsed.data.VITE_MARKET_URL,
  },
} as const;
