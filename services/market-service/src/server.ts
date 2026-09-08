import { buildApp } from "./app.ts";
import { createMarketEngine } from "./engine.ts";
import { createQuoteHub } from "./hub.ts";

const port = Number(process.env.PORT ?? 4003);
const seed = Number(process.env.MARKET_SEED ?? Date.now() % 100_000);
const tickIntervalMs = Number(process.env.TICK_INTERVAL_MS ?? 50);

const engine = createMarketEngine({ seed });
const hub = createQuoteHub(engine, { tickIntervalMs });

const app = buildApp({ engine, hub, logger: true });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    app.log.info(`${signal} received, draining`);
    void app.close().then(() => process.exit(0));
  });
}

try {
  await app.listen({ port, host: "0.0.0.0" });
  app.log.info({ seed, tickIntervalMs }, "market feed ready");
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
