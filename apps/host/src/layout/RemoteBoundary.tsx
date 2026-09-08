import { Component, Suspense, type ErrorInfo, type ReactNode } from "react";
import { Alert, AlertTitle, Box, Button, Skeleton, Stack } from "@mui/material";

interface Props {
  readonly name: string;
  readonly children: ReactNode;
}

interface State {
  readonly error: Error | null;
}

class RemoteErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[remote:${this.props.name}] failed to render`, error, info);
  }

  private readonly retry = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    if (this.state.error === null) return this.props.children;

    return (
      <Alert
        severity="warning"
        action={
          <Button color="inherit" size="small" onClick={this.retry}>
            Retry
          </Button>
        }
      >
        <AlertTitle>{this.props.name} is unavailable</AlertTitle>
        The rest of the platform keeps working. This module could not be loaded.
      </Alert>
    );
  }
}

function RemoteSkeleton() {
  return (
    <Stack spacing={2} sx={{ p: 2 }}>
      <Skeleton variant="text" width={220} height={32} />
      <Skeleton variant="rounded" height={120} />
      <Skeleton variant="rounded" height={120} />
    </Stack>
  );
}

export function RemoteBoundary({ name, children }: Props) {
  return (
    <RemoteErrorBoundary name={name}>
      <Suspense fallback={<RemoteSkeleton />}>
        <Box>{children}</Box>
      </Suspense>
    </RemoteErrorBoundary>
  );
}
