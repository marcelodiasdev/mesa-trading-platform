import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpError, FLAGS } from "@mesa/shell-sdk";
import { OrderTicket } from "./OrderTicket";
import { renderWithShell, TEST_ACCOUNT_ID, type RequestStub } from "../test/harness";
import { createQuoteStore } from "../market/store";
import type { Quote } from "../market/store";

const quote = (ticker: string, priceCents: bigint): Quote => ({
  ticker,
  priceCents,
  openingPriceCents: 38_50n,
  changeCents: 0n,
  changeBps: 0,
  bidCents: priceCents - 1n,
  askCents: priceCents + 1n,
  at: "2026-09-08T13:00:00.000Z",
});

function withQuote(ticker = "PETR4", priceCents = 38_50n) {
  const store = createQuoteStore({ schedule: (flush) => flush() });
  store.apply(quote(ticker, priceCents));
  return store;
}

const accepted = {
  id: "order-1",
  ticker: "PETR4",
  side: "BUY" as const,
  status: "WORKING",
  quantity: 100,
};

async function fillPrice(digits: string) {
  const field = screen.getByLabelText(/limit price/i);
  await userEvent.clear(field);
  await userEvent.type(field, digits);
  return field;
}

describe("the kill switch", () => {
  it("disables the form when order entry is off", () => {
    renderWithShell(<OrderTicket ticker="PETR4" />, {
      flags: { [FLAGS.orderEntry]: false },
      store: withQuote(),
    });

    expect(screen.getByRole("button", { name: /review order/i })).toBeDisabled();
  });

  it("says why, rather than failing silently", () => {
    renderWithShell(<OrderTicket ticker="PETR4" />, {
      flags: { [FLAGS.orderEntry]: false },
      store: withQuote(),
    });

    expect(screen.getByText(/order entry is disabled/i)).toBeInTheDocument();
  });

  it("enables the form when the flag is on", () => {
    renderWithShell(<OrderTicket ticker="PETR4" />, { store: withQuote() });
    expect(screen.getByRole("button", { name: /review order/i })).toBeEnabled();
  });
});

describe("choosing an instrument", () => {
  it("waits for one before letting an order through", () => {
    renderWithShell(<OrderTicket ticker={null} />, { store: withQuote() });
    expect(screen.getByRole("button", { name: /review order/i })).toBeDisabled();
  });

  it("names the instrument once it is chosen", () => {
    renderWithShell(<OrderTicket ticker="VALE3" />, {
      store: withQuote("VALE3", 61_20n),
    });
    expect(screen.getByText(/order ticket · VALE3/i)).toBeInTheDocument();
  });
});

describe("the price field", () => {
  it("moves digits in from the right without corrupting the value", async () => {
    renderWithShell(<OrderTicket ticker="PETR4" />, { store: withQuote() });

    const field = await fillPrice("3850");
    expect(field).toHaveValue("38,50");
  });

  it("ignores anything that is not a digit", async () => {
    renderWithShell(<OrderTicket ticker="PETR4" />, { store: withQuote() });

    const field = await fillPrice("R$ 38,50");
    expect(field).toHaveValue("38,50");
  });

  it("disappears on a market order, which carries no price", async () => {
    renderWithShell(<OrderTicket ticker="PETR4" />, { store: withQuote() });

    expect(screen.getByLabelText(/limit price/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("combobox", { name: /type/i }));
    await userEvent.click(await screen.findByRole("option", { name: /market/i }));

    expect(screen.queryByLabelText(/limit price/i)).not.toBeInTheDocument();
  });
});

describe("the estimated cost", () => {
  it("multiplies the typed price by the quantity", async () => {
    renderWithShell(<OrderTicket ticker="PETR4" />, { store: withQuote() });

    await fillPrice("3850");

    expect(screen.getByText("R$ 3.850,00")).toBeInTheDocument();
  });
});

describe("confirming before sending", () => {
  it("shows a summary instead of submitting straight away", async () => {
    const request = vi.fn<RequestStub>().mockResolvedValue(accepted);
    renderWithShell(<OrderTicket ticker="PETR4" />, { store: withQuote(), request });

    await fillPrice("3850");
    await userEvent.click(screen.getByRole("button", { name: /review order/i }));

    expect(screen.getByText(/confirm this order/i)).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });

  it("does not open the dialog for an invalid ticket", async () => {
    renderWithShell(<OrderTicket ticker="PETR4" />, { store: withQuote() });

    await userEvent.click(screen.getByRole("button", { name: /review order/i }));

    expect(screen.queryByText(/confirm this order/i)).not.toBeInTheDocument();
    expect(
      await screen.findByText(/enter a price greater than zero/i),
    ).toBeInTheDocument();
  });

  it("sends nothing when the dialog is cancelled", async () => {
    const request = vi.fn<RequestStub>().mockResolvedValue(accepted);
    renderWithShell(<OrderTicket ticker="PETR4" />, { store: withQuote(), request });

    await fillPrice("3850");
    await userEvent.click(screen.getByRole("button", { name: /review order/i }));
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(request).not.toHaveBeenCalled();
  });
});

describe("submitting", () => {
  async function submit(request: RequestStub) {
    renderWithShell(<OrderTicket ticker="PETR4" />, { store: withQuote(), request });
    await fillPrice("3850");
    await userEvent.click(screen.getByRole("button", { name: /review order/i }));
    await userEvent.click(screen.getByRole("button", { name: /send order/i }));
  }

  it("posts the order in integer cents", async () => {
    const request = vi.fn<RequestStub>().mockResolvedValue(accepted);
    await submit(request);

    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(request.mock.calls[0]![0]).toMatchObject({
      service: "orders",
      path: "/orders",
      method: "POST",
      body: {
        accountId: TEST_ACCOUNT_ID,
        ticker: "PETR4",
        side: "BUY",
        type: "LIMIT",
        quantity: 100,
        limitPriceCents: "3850",
      },
    });
  });

  it("carries an idempotency key", async () => {
    const request = vi.fn<RequestStub>().mockResolvedValue(accepted);
    await submit(request);

    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(request.mock.calls[0]![0].idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("reports the order once it is accepted", async () => {
    const request = vi.fn<RequestStub>().mockResolvedValue(accepted);
    await submit(request);

    expect(await screen.findByText(/order accepted/i)).toBeInTheDocument();
  });

  it("says the order was already submitted on a replay", async () => {
    const request = vi
      .fn<RequestStub>()
      .mockResolvedValue({ ...accepted, replayed: true });
    await submit(request);

    expect(await screen.findByText(/already submitted/i)).toBeInTheDocument();
  });

  it("clears the price so the next order starts fresh", async () => {
    const request = vi.fn<RequestStub>().mockResolvedValue(accepted);
    await submit(request);

    await screen.findByText(/order accepted/i);
    expect(screen.getByLabelText(/limit price/i)).toHaveValue("");
  });
});

describe("when the order is refused", () => {
  const rejection = (body: unknown) =>
    vi
      .fn<RequestStub>()
      .mockRejectedValue(new HttpError(422, "orders", "/orders", "corr-1", body));

  it("explains a shortfall in buying power with both figures", async () => {
    const request = rejection({
      error: "rejected by pre-trade risk",
      rejection: {
        code: "INSUFFICIENT_BUYING_POWER",
        requiredCents: "385000",
        availableCents: "100000",
      },
    });

    renderWithShell(<OrderTicket ticker="PETR4" />, { store: withQuote(), request });
    await fillPrice("3850");
    await userEvent.click(screen.getByRole("button", { name: /review order/i }));
    await userEvent.click(screen.getByRole("button", { name: /send order/i }));

    expect(
      await screen.findByText(/rejected before reaching the book/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/needs R\$ 3\.850,00 · has R\$ 1\.000,00/),
    ).toBeInTheDocument();
  });

  it("explains a concentration limit", async () => {
    const request = rejection({
      error: "rejected by pre-trade risk",
      rejection: {
        code: "EXPOSURE_LIMIT_EXCEEDED",
        notionalCents: "385000",
        limitCents: "250000",
      },
    });

    renderWithShell(<OrderTicket ticker="PETR4" />, { store: withQuote(), request });
    await fillPrice("3850");
    await userEvent.click(screen.getByRole("button", { name: /review order/i }));
    await userEvent.click(screen.getByRole("button", { name: /send order/i }));

    expect(await screen.findByText(/too much of the portfolio/i)).toBeInTheDocument();
  });
});

describe("when the service cannot be reached", () => {
  it("says nothing was submitted, and gives a reference", async () => {
    const request = vi
      .fn<RequestStub>()
      .mockRejectedValue(new HttpError(503, "orders", "/orders", "corr-xyz", {}));

    renderWithShell(<OrderTicket ticker="PETR4" />, { store: withQuote(), request });
    await fillPrice("3850");
    await userEvent.click(screen.getByRole("button", { name: /review order/i }));
    await userEvent.click(screen.getByRole("button", { name: /send order/i }));

    expect(await screen.findByText(/the order was not sent/i)).toBeInTheDocument();
    expect(screen.getByText(/corr-xyz/)).toBeInTheDocument();
  });
});
