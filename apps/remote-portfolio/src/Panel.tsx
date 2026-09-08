import { Stack } from "@mui/material";
import { BalanceCard } from "./components/BalanceCard";
import { PositionsTable } from "./components/PositionsTable";
import { OrdersTable } from "./components/OrdersTable";
import { StatementTable } from "./components/StatementTable";

export default function Panel() {
  return (
    <Stack spacing={4}>
      <BalanceCard />
      <PositionsTable />
      <OrdersTable />
      <StatementTable />
    </Stack>
  );
}
