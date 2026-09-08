import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export const TRADING_DRAFT_KEY = "tradingDraft";

export type Side = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT" | "STOP";

export interface TradingDraftState {
  readonly ticker: string | null;
  readonly side: Side;
  readonly type: OrderType;
  readonly quantity: number;
  readonly limitPrice: string;
  readonly stopPrice: string;
  readonly idempotencyKey: string;
}

const freshKey = (): string => crypto.randomUUID();

const initialState: TradingDraftState = {
  ticker: null,
  side: "BUY",
  type: "LIMIT",
  quantity: 100,
  limitPrice: "",
  stopPrice: "",
  idempotencyKey: freshKey(),
};

const tradingDraftSlice = createSlice({
  name: TRADING_DRAFT_KEY,
  initialState,
  reducers: {
    draftPrefilled(
      state,
      action: PayloadAction<{ ticker: string; side?: Side; quantity?: number }>,
    ) {
      state.ticker = action.payload.ticker;
      if (action.payload.side !== undefined) state.side = action.payload.side;
      if (action.payload.quantity !== undefined) state.quantity = action.payload.quantity;
    },
    tickerChanged(state, action: PayloadAction<string | null>) {
      state.ticker = action.payload;
    },
    draftChanged(
      state,
      action: PayloadAction<Partial<Omit<TradingDraftState, "idempotencyKey">>>,
    ) {
      Object.assign(state, action.payload);
    },
    draftSubmitted(state) {
      state.idempotencyKey = freshKey();
      state.limitPrice = "";
      state.stopPrice = "";
    },
    draftReset() {
      return { ...initialState, idempotencyKey: freshKey() };
    },
  },
});

export const { draftPrefilled, tickerChanged, draftChanged, draftSubmitted, draftReset } =
  tradingDraftSlice.actions;

export const tradingDraftReducer = tradingDraftSlice.reducer;

export const selectDraft = (state: Record<string, unknown>): TradingDraftState =>
  (state[TRADING_DRAFT_KEY] as TradingDraftState | undefined) ?? initialState;
