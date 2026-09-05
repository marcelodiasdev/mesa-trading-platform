import { buildApp } from "./app.ts";

const port = Number(process.env.PORT ?? 4001);
const app = buildApp({ logger: true });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    app.log.info(`${signal} received, draining`);
    void app.close().then(() => process.exit(0));
  });
}

try {
  await app.listen({ port, host: "0.0.0.0" });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
