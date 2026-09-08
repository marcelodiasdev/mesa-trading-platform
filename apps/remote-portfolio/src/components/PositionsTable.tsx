import {
  Alert,
  Box,
  Card,
  CardContent,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { PriceChange } from "@mesa/ui-kit";
import { Money } from "./Money";
import { buildPositions } from "../api/positions";
import { useOrders, useQuotes } from "../api/queries";

export function PositionsTable() {
  const orders = useOrders();
  const quotes = useQuotes();

  if (orders.isPending) {
    return <Skeleton variant="rounded" height={200} />;
  }

  if (orders.isError) {
    return <Alert severity="warning">Positions are unavailable.</Alert>;
  }

  const positions = buildPositions(orders.data, quotes.data ?? new Map());

  return (
    <Card>
      <CardContent>
        <Stack spacing={3}>
          <Stack direction="row" alignItems="baseline" spacing={2}>
            <Typography variant="subtitle2">Positions</Typography>
            {quotes.isError ? (
              <Typography variant="caption" sx={{ color: "warning.main" }}>
                prices unavailable
              </Typography>
            ) : null}
          </Stack>

          {positions.length === 0 ? (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              No open positions. Filled orders appear here.
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Instrument</TableCell>
                  <TableCell align="right">Quantity</TableCell>
                  <TableCell align="right">Average cost</TableCell>
                  <TableCell align="right">Last</TableCell>
                  <TableCell align="right">Market value</TableCell>
                  <TableCell align="right">Unrealised</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {positions.map((position) => (
                  <TableRow key={position.ticker} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {position.ticker}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="numeric">{position.quantity}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Money cents={position.averageCostCents} />
                    </TableCell>
                    <TableCell align="right">
                      <Money cents={position.lastPriceCents} />
                    </TableCell>
                    <TableCell align="right">
                      <Money cents={position.marketValueCents} />
                    </TableCell>
                    <TableCell align="right">
                      {position.unrealisedBps === null ? (
                        <Money cents={null} />
                      ) : (
                        <Box
                          sx={{ display: "inline-flex", gap: 2, alignItems: "baseline" }}
                        >
                          <Money cents={position.unrealisedCents} signed dense />
                          <PriceChange percent={position.unrealisedBps / 100} dense />
                        </Box>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
