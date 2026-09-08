import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface SessionUser {
  readonly userId: string;
  readonly displayName: string;
  readonly accounts: readonly string[];
}

export interface SessionState {
  readonly status: "anonymous" | "authenticated";
  readonly user: SessionUser | null;
  readonly activeAccountId: string | null;
}

const initialState: SessionState = {
  status: "anonymous",
  user: null,
  activeAccountId: null,
};

const sessionSlice = createSlice({
  name: "session",
  initialState,
  reducers: {
    signedIn(_state, action: PayloadAction<SessionUser>): SessionState {
      return {
        status: "authenticated",
        user: action.payload,
        activeAccountId: action.payload.accounts[0] ?? null,
      };
    },
    signedOut() {
      return initialState;
    },
    accountSwitched(state, action: PayloadAction<string>): SessionState {
      if (!state.user?.accounts.includes(action.payload)) return state as SessionState;
      return { ...(state as SessionState), activeAccountId: action.payload };
    },
  },
});

export const { signedIn, signedOut, accountSwitched } = sessionSlice.actions;
export const sessionReducer = sessionSlice.reducer;
