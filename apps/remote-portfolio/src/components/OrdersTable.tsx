import {
  Alert,
  Card,
  CardContent,
  Chip,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useBus } from "@mesa/shell-sdk";
import { Money } from "@mesa/ui-kit";
import { useOrders } from "../api/queries";
import type { Order } from "../api/schemas";

type Tone = "default" | "info" | "success" | "warning" | "error";

const STATUS_TONE: Record<Order["status"], Tone> = {
  RECEIVED: "default",
  VALIDATED: "default",
  WORKING: "info",
  PARTIALLY_FILLED: "info",
  FILLED: "success",
  CANCELLED: "default",
  REJECTED: "error",
  EXPIRED: "warning",
};

const timeFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function OrdersTable() {
  const { data, isPending, isError } = useOrders();
  const bus = useBus();

  if (isPending) return <Skeleton variant="rounded" height={200} />;
  if (isError) return <Alert severity="warning">Orders are unavailable.</Alert>;

  return (
    <Card>
      <CardContent>
        <Stack spacing={3}>
          <Typography variant="subtitle2">Orders</Typography>

          {data.length === 0 ? (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              No orders yet.
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Instrument</TableCell>
                  <TableCell>Side</TableCell>
                  <TableCell align="right">Quantity</TableCell>
                  <TableCell align="right">Filled</TableCell>
                  <TableCell align="right">Average</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Placed</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.map((order) => (
                  <TableRow
                    key={order.id}
                    hover
                    sx={{ cursor: "pointer" }}
                    onClick={() =>
                      bus.emit("ticket:open", {
                        ticker: order.ticker,
                        side: order.side,
                        quantity: order.quantity,
                      })
                    }
                  >
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {order.ticker}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{ color: order.side === "BUY" ? "market.up" : "market.down" }}
                      >
                        {order.side}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="numeric">{order.quantity}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="numeric">{order.filledQuantity}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Money cents={order.averagePriceCents ?? null} />
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={order.status.replace("_", " ")}
                        color={STATUS_TONE[order.status]}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="numericSmall" sx={{ color: "text.secondary" }}>
                        {timeFormat.format(new Date(order.createdAt))}
                      </Typography>
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
