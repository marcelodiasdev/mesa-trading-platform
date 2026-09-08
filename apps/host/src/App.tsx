import { useEffect, useMemo, useState } from "react";
import { BrowserRouter, useNavigate } from "react-router";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CssBaseline, CircularProgress, Stack, ThemeProvider } from "@mui/material";
import { ShellProvider, type ShellContextValue } from "@mesa/shell-sdk";
import { theme } from "@mesa/ui-kit/theme";
import { createAppStore, type AppStore } from "./store/index";
import { signedIn } from "./store/slices/session";
import { createShell } from "./shell/create-shell";
import { signIn } from "./auth/mock-session";
import { AppRoutes } from "./routes/index";

function Booting() {
  return (
    <Stack sx={{ height: "100vh" }} alignItems="center" justifyContent="center">
      <CircularProgress size={28} />
    </Stack>
  );
}

function Shell({ store }: { store: AppStore }) {
  const navigate = useNavigate();
  const [shell, setShell] = useState<ShellContextValue | null>(null);

  useEffect(() => {
    let cancelled = false;

    void signIn().then((user) => {
      if (cancelled) return;
      store.dispatch(signedIn(user));
      setShell(createShell({ store, navigate: (path) => navigate(path) }));
    });

    return () => {
      cancelled = true;
    };
  }, [store, navigate]);

  if (shell === null) return <Booting />;

  return (
    <ShellProvider {...shell}>
      <AppRoutes />
    </ShellProvider>
  );
}

export function App() {
  const store = useMemo(() => createAppStore(), []);
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
    [],
  );

  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <BrowserRouter>
            <Shell store={store} />
          </BrowserRouter>
        </ThemeProvider>
      </QueryClientProvider>
    </Provider>
  );
}
