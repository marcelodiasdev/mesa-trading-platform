import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CssBaseline, ThemeProvider } from "@mui/material";
import {
  ShellProvider,
  createEventBus,
  createHttpClient,
  type FlagStore,
} from "@mesa/shell-sdk";
import { theme } from "./theme";
import Panel from "./Panel";

const flags: FlagStore = {
  isEnabled: () => true,
  subscribe: () => () => {},
};

const shell = {
  session: {
    userId: "11111111-1111-4111-8111-111111111111",
    accountId: "acc-1",
    displayName: "Standalone",
  },
  http: createHttpClient({
    baseUrls: {
      accounts: "http://localhost:4001/",
      orders: "http://localhost:4002/",
      market: "http://localhost:4003/",
    },
    getToken: async () => "standalone-token",
  }),
  bus: createEventBus(),
  flags,
  navigate: (path: string) => {
    console.info(`[standalone] navigate to ${path}`);
  },
};

const container = document.getElementById("root");
if (container === null) throw new Error("#root is missing from index.html");

createRoot(container).render(
  <QueryClientProvider client={new QueryClient()}>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ShellProvider {...shell}>
        <Panel />
      </ShellProvider>
    </ThemeProvider>
  </QueryClientProvider>,
);
