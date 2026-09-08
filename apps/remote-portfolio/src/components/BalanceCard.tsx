import {
  Alert,
  Card,
  CardContent,
  Divider,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { Money } from "@mesa/ui-kit";
import { useBalance } from "../api/queries";

function Figure({ label, cents }: { label: string; cents: bigint }) {
  return (
    <Stack spacing={1}>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        {label}
      </Typography>
      <Money cents={cents} withSymbol />
    </Stack>
  );
}

export function BalanceCard() {
  const { data, isPending, isError, error } = useBalance();

  if (isPending) {
    return (
      <Card>
        <CardContent>
          <Skeleton variant="text" width={160} height={28} />
          <Skeleton variant="text" width={280} height={24} />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Alert severity="warning">
        Balance is unavailable. {error instanceof Error ? error.message : ""}
      </Alert>
    );
  }

  return (
    <Card>
      <CardContent>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          divider={<Divider orientation="vertical" flexItem />}
          spacing={6}
        >
          <Figure label="Equity" cents={data.equityCents} />
          <Figure label="Buying power" cents={data.buyingPowerCents} />
          <Figure label="Reserved for open orders" cents={data.reservedCents} />
        </Stack>
      </CardContent>
    </Card>
  );
}
