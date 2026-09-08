import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface UiState {
  readonly navigationOpen: boolean;
  readonly selectedTicker: string | null;
  readonly degradedServices: readonly string[];
}

const initialState: UiState = {
  navigationOpen: true,
  selectedTicker: null,
  degradedServices: [],
};

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    navigationToggled(state) {
      state.navigationOpen = !state.navigationOpen;
    },
    tickerSelected(state, action: PayloadAction<string | null>) {
      state.selectedTicker = action.payload;
    },
    serviceDegraded(state, action: PayloadAction<string>) {
      if (!state.degradedServices.includes(action.payload)) {
        state.degradedServices = [...state.degradedServices, action.payload];
      }
    },
    serviceRecovered(state, action: PayloadAction<string>) {
      state.degradedServices = state.degradedServices.filter((s) => s !== action.payload);
    },
  },
});

export const { navigationToggled, tickerSelected, serviceDegraded, serviceRecovered } =
  uiSlice.actions;
export const uiReducer = uiSlice.reducer;
