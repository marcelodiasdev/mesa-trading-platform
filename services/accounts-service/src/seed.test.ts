import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";
import { DEMO_ACCOUNT_ID } from "./seed.ts";

let app: FastifyInstance;

afterEach(async () => {
  await app.close();
});

const balance = () =>
  app
    .inject({ method: "GET", url: `/accounts/${DEMO_ACCOUNT_ID}/balance` })
    .then((r) => r.json());

describe("seeding on boot", () => {
  beforeEach(async () => {
    app = buildApp({ seed: true });
    await app.ready();
  });

  it("opens the demo account with a balance", async () => {
    expect((await balance()).buyingPowerCents).toBe("12000000");
  });

  it("keeps the ledger balanced", async () => {
    const response = await app.inject({ method: "GET", url: "/internal/reconciliation" });
    expect(response.json()).toEqual({ balanced: true, deltaCents: "0" });
  });
});

describe("seeding on demand", () => {
  beforeEach(async () => {
    app = buildApp();
    await app.ready();
  });

  it("starts empty when seeding is off", async () => {
    expect((await balance()).buyingPowerCents).toBe("0");
  });

  it("funds the account when asked", async () => {
    const response = await app.inject({ method: "POST", url: "/internal/seed" });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ seeded: true, balanceCents: "12000000" });
  });

  it("does not fund it twice", async () => {
    await app.inject({ method: "POST", url: "/internal/seed" });
    const second = await app.inject({ method: "POST", url: "/internal/seed" });

    expect(second.statusCode).toBe(200);
    expect(second.json().seeded).toBe(false);
    expect((await balance()).buyingPowerCents).toBe("12000000");
  });

  it("leaves the account usable for reservations", async () => {
    await app.inject({ method: "POST", url: "/internal/seed" });

    const reservation = await app.inject({
      method: "POST",
      url: `/accounts/${DEMO_ACCOUNT_ID}/reservations`,
      headers: { "Idempotency-Key": crypto.randomUUID() },
      payload: { amountCents: "385000" },
    });

    expect(reservation.statusCode).toBe(201);
    expect((await balance()).reservedCents).toBe("385000");
  });
});
