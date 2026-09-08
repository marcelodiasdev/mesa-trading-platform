import type { ReactNode } from "react";
import { Card, CardContent, Skeleton, Stack, Typography } from "@mui/material";
import { DepthLadder } from "@mesa/ui-kit";
import { useOrderBook } from "../market/book";

export interface OrderBookLadderProps {
  readonly ticker: string | null;
}

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardContent>
        <Stack spacing={3}>
          <Typography variant="subtitle2">{title}</Typography>
          {children}
        </Stack>
      </CardContent>
    </Card>
  );
}

export function OrderBookLadder({ ticker }: OrderBookLadderProps) {
  const { data, isPending, isError } = useOrderBook(ticker);

  if (ticker === null) {
    return (
      <Shell title="Depth">
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Pick an instrument to see its depth.
        </Typography>
      </Shell>
    );
  }

  if (isPending) return <Skeleton variant="rounded" height={260} />;

  if (isError || data === undefined) {
    return (
      <Shell title={`Depth · ${ticker}`}>
        <Typography variant="body2" sx={{ color: "warning.main" }}>
          Depth is unavailable for {ticker}.
        </Typography>
      </Shell>
    );
  }

  return (
    <Shell title={`Depth · ${data.ticker}`}>
      <DepthLadder bids={data.bids} asks={data.asks} />
    </Shell>
  );
}
