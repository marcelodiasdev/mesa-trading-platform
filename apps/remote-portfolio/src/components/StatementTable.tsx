import {
  Alert,
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
import { Money } from "@mesa/ui-kit";
import { useStatement } from "../api/queries";

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const LABELS: Record<string, string> = {
  DEPOSIT: "Deposit",
  WITHDRAWAL: "Withdrawal",
  RESERVATION: "Reserved for order",
  RELEASE: "Reservation released",
  TRADE: "Trade",
  SETTLEMENT: "Settlement",
  FEE: "Fee",
  REVERSAL: "Reversal",
};

export function StatementTable() {
  const { data, isPending, isError } = useStatement();

  if (isPending) return <Skeleton variant="rounded" height={200} />;
  if (isError) return <Alert severity="warning">The statement is unavailable.</Alert>;

  return (
    <Card>
      <CardContent>
        <Stack spacing={3}>
          <Typography variant="subtitle2">Statement</Typography>

          {data.lines.length === 0 ? (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              No movements yet.
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Movement</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell align="right">Balance</TableCell>
                  <TableCell align="right">When</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.lines.map((line) => (
                  <TableRow key={line.entryId} hover>
                    <TableCell>{LABELS[line.kind] ?? line.kind}</TableCell>
                    <TableCell align="right">
                      <Typography
                        component="span"
                        sx={{
                          color: line.amountCents < 0n ? "market.down" : "market.up",
                        }}
                      >
                        <Money cents={line.amountCents} signed coloured />
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Money cents={line.balanceCents} />
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="numericSmall" sx={{ color: "text.secondary" }}>
                        {dateFormat.format(new Date(line.occurredAt))}
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
