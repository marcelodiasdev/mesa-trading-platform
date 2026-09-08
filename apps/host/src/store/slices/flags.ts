import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export const KILL_SWITCH_ORDER_ENTRY = "orderEntry.enabled";

export interface FlagsState {
  readonly values: Readonly<Record<string, boolean>>;
}

const initialState: FlagsState = {
  values: {
    [KILL_SWITCH_ORDER_ENTRY]: true,
    "portfolio.showUnrealised": true,
    "book.depth10": false,
  },
};

const flagsSlice = createSlice({
  name: "flags",
  initialState,
  reducers: {
    flagsLoaded(state, action: PayloadAction<Record<string, boolean>>) {
      state.values = { ...state.values, ...action.payload };
    },
    flagToggled(state, action: PayloadAction<string>) {
      const key = action.payload;
      state.values = { ...state.values, [key]: !state.values[key] };
    },
    flagSet(state, action: PayloadAction<{ flag: string; enabled: boolean }>) {
      state.values = { ...state.values, [action.payload.flag]: action.payload.enabled };
    },
  },
});

export const { flagsLoaded, flagToggled, flagSet } = flagsSlice.actions;
export const flagsReducer = flagsSlice.reducer;
