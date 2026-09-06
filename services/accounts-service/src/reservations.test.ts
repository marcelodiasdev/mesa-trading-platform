import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";

const ACCOUNT = "acc-7";
let app: FastifyInstance;

beforeEach(async () => {
  app = buildApp();
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

const deposit = (amountCents: string, key = crypto.randomUUID()) =>
  app.inject({
    method: "POST",
    url: `/accounts/${ACCOUNT}/deposits`,
    headers: { "Idempotency-Key": key },
    payload: { amountCents },
  });

const reserve = (amountCents: string, key = crypto.randomUUID()) =>
  app.inject({
    method: "POST",
    url: `/accounts/${ACCOUNT}/reservations`,
    headers: { "Idempotency-Key": key },
    payload: { amountCents },
  });

const release = (reservationId: string, key = crypto.randomUUID()) =>
  app.inject({
    method: "POST",
    url: `/accounts/${ACCOUNT}/reservations/${reservationId}/release`,
    headers: { "Idempotency-Key": key },
  });

const balance = () =>
  app
    .inject({ method: "GET", url: `/accounts/${ACCOUNT}/balance` })
    .then((r) => r.json());

describe("reserving funds", () => {
  it("moves cash out of buying power without changing what is owned", async () => {
    await deposit("100000");
    const response = await reserve("38500");

    expect(response.statusCode).toBe(201);
    const body = await balance();
    expect(body.buyingPowerCents).toBe("61500");
    expect(body.reservedCents).toBe("38500");
    expect(body.equityCents).toBe("100000");
  });

  it("refuses a reservation the account cannot cover", async () => {
    await deposit("10000");
    const response = await reserve("38500");

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: "insufficient funds",
      availableCents: "10000",
      requestedCents: "38500",
    });
  });

  it("stops a second order from committing the same cash", async () => {
    await deposit("50000");

    const first = await reserve("38500");
    const second = await reserve("38500");

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(409);

    const body = await balance();
    expect(body.reservedCents).toBe("38500");
  });

  it("allows reservations up to the exact balance", async () => {
    await deposit("50000");
    expect((await reserve("30000")).statusCode).toBe(201);
    expect((await reserve("20000")).statusCode).toBe(201);
    expect((await balance()).buyingPowerCents).toBe("0");
  });

  it("returns the original reservation on replay", async () => {
    await deposit("100000");
    const key = crypto.randomUUID();

    const first = await reserve("38500", key);
    const second = await reserve("38500", key);

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json().reservationId).toBe(first.json().reservationId);
    expect((await balance()).reservedCents).toBe("38500");
  });

  it("refuses a reservation with no idempotency key", async () => {
    await deposit("100000");
    const response = await app.inject({
      method: "POST",
      url: `/accounts/${ACCOUNT}/reservations`,
      payload: { amountCents: "38500" },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe("releasing a reservation", () => {
  it("puts the money back into buying power", async () => {
    await deposit("100000");
    const reservation = await reserve("38500");

    const response = await release(reservation.json().reservationId);
    expect(response.statusCode).toBe(201);

    const body = await balance();
    expect(body.buyingPowerCents).toBe("100000");
    expect(body.reservedCents).toBe("0");
  });

  it("keeps both the commitment and its release in the statement", async () => {
    await deposit("100000");
    const reservation = await reserve("38500");
    await release(reservation.json().reservationId);

    const statement = await app
      .inject({ method: "GET", url: `/accounts/${ACCOUNT}/statement` })
      .then((r) => r.json());

    expect(statement.lines.map((l: { kind: string }) => l.kind)).toEqual([
      "REVERSAL",
      "RESERVATION",
      "DEPOSIT",
    ]);
  });

  it("does not release twice on replay", async () => {
    await deposit("100000");
    const reservation = await reserve("38500");
    const key = crypto.randomUUID();

    await release(reservation.json().reservationId, key);
    const second = await release(reservation.json().reservationId, key);

    expect(second.statusCode).toBe(200);
    expect((await balance()).buyingPowerCents).toBe("100000");
  });

  it("answers 404 for an unknown reservation", async () => {
    const response = await release("does-not-exist");
    expect(response.statusCode).toBe(404);
  });
});

describe("the ledger stays balanced through the whole cycle", () => {
  it("nets to zero after deposits, reservations and releases", async () => {
    await deposit("100000");
    const a = await reserve("30000");
    await reserve("20000");
    await release(a.json().reservationId);

    const response = await app.inject({ method: "GET", url: "/internal/reconciliation" });
    expect(response.json()).toEqual({ balanced: true, deltaCents: "0" });
  });
});
