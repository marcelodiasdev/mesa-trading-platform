export declare const TRADING_DRAFT_KEY = "tradingDraft";
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
export declare const draftPrefilled: import("@reduxjs/toolkit").ActionCreatorWithPayload<{
    ticker: string;
    side?: Side;
    quantity?: number;
}, "tradingDraft/draftPrefilled">, tickerChanged: import("@reduxjs/toolkit").ActionCreatorWithPayload<string | null, "tradingDraft/tickerChanged">, draftChanged: import("@reduxjs/toolkit").ActionCreatorWithPayload<Partial<Omit<TradingDraftState, "idempotencyKey">>, "tradingDraft/draftChanged">, draftSubmitted: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"tradingDraft/draftSubmitted">, draftReset: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"tradingDraft/draftReset">;
export declare const tradingDraftReducer: import("@reduxjs/toolkit").Reducer<TradingDraftState>;
export declare const selectDraft: (state: Record<string, unknown>) => TradingDraftState;
//# sourceMappingURL=slice.d.ts.map