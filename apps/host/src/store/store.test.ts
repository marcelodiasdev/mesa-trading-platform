import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { describe, expect, it } from "vitest";
import { createAppStore } from "./index";
import { accountSwitched, signedIn, signedOut } from "./slices/session";
import { KILL_SWITCH_ORDER_ENTRY, flagSet, flagToggled } from "./slices/flags";
import { serviceDegraded, serviceRecovered, tickerSelected } from "./slices/ui";

const user = {
  userId: "u-1",
  displayName: "Marcelo",
  accounts: ["acc-1", "acc-2"],
};

const draftSlice = createSlice({
  name: "tradingDraft",
  initialState: { ticker: null as string | null, quantity: 0 },
  reducers: {
    draftOpened(state, action: PayloadAction<{ ticker: string }>) {
      state.ticker = action.payload.ticker;
      state.quantity = 100;
    },
  },
});

describe("session", () => {
  it("starts anonymous", () => {
    const store = createAppStore();
    expect(store.getState().session.status).toBe("anonymous");
    expect(store.getState().session.activeAccountId).toBeNull();
  });

  it("selects the first account on sign in", () => {
    const store = createAppStore();
    store.dispatch(signedIn(user));
    expect(store.getState().session.activeAccountId).toBe("acc-1");
  });

  it("switches to another account the user owns", () => {
    const store = createAppStore();
    store.dispatch(signedIn(user));
    store.dispatch(accountSwitched("acc-2"));
    expect(store.getState().session.activeAccountId).toBe("acc-2");
  });

  it("refuses to switch to an account the user does not own", () => {
    const store = createAppStore();
    store.dispatch(signedIn(user));
    store.dispatch(accountSwitched("acc-99"));
    expect(store.getState().session.activeAccountId).toBe("acc-1");
  });

  it("clears everything on sign out", () => {
    const store = createAppStore();
    store.dispatch(signedIn(user));
    store.dispatch(signedOut());
    expect(store.getState().session).toEqual({
      status: "anonymous",
      user: null,
      activeAccountId: null,
    });
  });
});

describe("flags", () => {
  it("enables order entry by default", () => {
    const store = createAppStore();
    expect(store.getState().flags.values[KILL_SWITCH_ORDER_ENTRY]).toBe(true);
  });

  it("flips the kill switch", () => {
    const store = createAppStore();
    store.dispatch(flagSet({ flag: KILL_SWITCH_ORDER_ENTRY, enabled: false }));
    expect(store.getState().flags.values[KILL_SWITCH_ORDER_ENTRY]).toBe(false);
  });

  it("treats an unknown flag as disabled", () => {
    const store = createAppStore();
    expect(store.getState().flags.values["does.not.exist"]).toBeUndefined();
  });

  it("toggles", () => {
    const store = createAppStore();
    store.dispatch(flagToggled("book.depth10"));
    expect(store.getState().flags.values["book.depth10"]).toBe(true);
  });
});

describe("degraded services", () => {
  it("records a service as degraded once", () => {
    const store = createAppStore();
    store.dispatch(serviceDegraded("market"));
    store.dispatch(serviceDegraded("market"));
    expect(store.getState().ui.degradedServices).toEqual(["market"]);
  });

  it("clears it on recovery", () => {
    const store = createAppStore();
    store.dispatch(serviceDegraded("market"));
    store.dispatch(serviceRecovered("market"));
    expect(store.getState().ui.degradedServices).toEqual([]);
  });
});

describe("dynamic reducer injection", () => {
  it("knows which reducers are mounted", () => {
    const store = createAppStore();
    expect(store.hasReducer("session")).toBe(true);
    expect(store.hasReducer("tradingDraft")).toBe(false);
  });

  it("mounts a slice a remote brings with it", () => {
    const store = createAppStore();
    store.injectReducer("tradingDraft", draftSlice.reducer);

    expect(store.hasReducer("tradingDraft")).toBe(true);
    expect(store.getState().tradingDraft).toEqual({ ticker: null, quantity: 0 });
  });

  it("handles actions from the injected slice", () => {
    const store = createAppStore();
    store.injectReducer("tradingDraft", draftSlice.reducer);
    store.dispatch(draftSlice.actions.draftOpened({ ticker: "PETR4" }));

    expect(store.getState().tradingDraft).toEqual({ ticker: "PETR4", quantity: 100 });
  });

  it("keeps the static state intact when a remote mounts", () => {
    const store = createAppStore();
    store.dispatch(signedIn(user));
    store.dispatch(tickerSelected("VALE3"));

    store.injectReducer("tradingDraft", draftSlice.reducer);

    expect(store.getState().session.activeAccountId).toBe("acc-1");
    expect(store.getState().ui.selectedTicker).toBe("VALE3");
  });

  it("keeps the injected state when another remote mounts later", () => {
    const store = createAppStore();
    store.injectReducer("tradingDraft", draftSlice.reducer);
    store.dispatch(draftSlice.actions.draftOpened({ ticker: "PETR4" }));

    const otherSlice = createSlice({
      name: "positions",
      initialState: { count: 0 },
      reducers: {
        loaded: (state) => {
          state.count = 3;
        },
      },
    });
    store.injectReducer("positions", otherSlice.reducer);

    expect(store.getState().tradingDraft).toEqual({ ticker: "PETR4", quantity: 100 });
    expect(store.getState().positions).toEqual({ count: 0 });
  });

  it("ignores a second injection of the same key", () => {
    const store = createAppStore();
    store.injectReducer("tradingDraft", draftSlice.reducer);
    store.dispatch(draftSlice.actions.draftOpened({ ticker: "PETR4" }));
    store.injectReducer("tradingDraft", draftSlice.reducer);

    expect(store.getState().tradingDraft).toEqual({ ticker: "PETR4", quantity: 100 });
  });

  it("unmounts a remote's slice", () => {
    const store = createAppStore();
    store.injectReducer("tradingDraft", draftSlice.reducer);
    store.ejectReducer("tradingDraft");

    expect(store.hasReducer("tradingDraft")).toBe(false);
    expect(store.getState().tradingDraft).toBeUndefined();
  });

  it("accepts preloaded state", () => {
    const store = createAppStore({
      ui: { navigationOpen: false, selectedTicker: "ITUB4", degradedServices: [] },
    });
    expect(store.getState().ui.selectedTicker).toBe("ITUB4");
    expect(store.getState().session.status).toBe("anonymous");
  });
});
