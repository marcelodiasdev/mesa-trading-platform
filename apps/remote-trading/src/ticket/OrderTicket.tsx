import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useDispatch, useSelector } from "react-redux";
import {
  Alert,
  AlertTitle,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { FLAGS, useFlag, useSession } from "@mesa/shell-sdk";
import { brl, formatBRL } from "@mesa/money";
import { MoneyField } from "./MoneyField";
import {
  TicketSchema,
  estimateNotionalCents,
  toPayload,
  type TicketValues,
} from "./schema";
import { usePlaceOrder, type OrderFailure } from "./usePlaceOrder";
import { useInjectDraft } from "./useInjectDraft";
import { draftSubmitted, selectDraft } from "./slice";
import { useQuote } from "../market/hooks";

const REJECTION_TEXT: Record<string, string> = {
  INSUFFICIENT_BUYING_POWER: "This order costs more than the account can commit.",
  INSUFFICIENT_POSITION: "You cannot sell more than the account holds.",
  EXPOSURE_LIMIT_EXCEEDED:
    "This order would concentrate too much of the portfolio in one instrument.",
  UNKNOWN: "Pre-trade risk refused this order.",
};

function FailureNotice({ failure }: { failure: OrderFailure }) {
  if (failure.kind === "unavailable") {
    return (
      <Alert severity="error">
        <AlertTitle>The order was not sent</AlertTitle>
        The order service could not be reached, so nothing was submitted. Reference{" "}
        {failure.correlationId}.
      </Alert>
    );
  }

  if (failure.kind === "invalid") {
    return (
      <Alert severity="error">
        <AlertTitle>The order was rejected as malformed</AlertTitle>
        {failure.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}
      </Alert>
    );
  }

  return (
    <Alert severity="warning">
      <AlertTitle>Rejected before reaching the book</AlertTitle>
      <Stack spacing={1}>
        <Typography variant="body2">{REJECTION_TEXT[failure.code]}</Typography>
        {failure.requiredCents !== undefined && failure.availableCents !== undefined ? (
          <Typography variant="numericSmall">
            needs {formatBRL(brl(failure.requiredCents))} · has{" "}
            {formatBRL(brl(failure.availableCents))}
          </Typography>
        ) : null}
        {failure.notionalCents !== undefined && failure.limitCents !== undefined ? (
          <Typography variant="numericSmall">
            order {formatBRL(brl(failure.notionalCents))} · cap{" "}
            {formatBRL(brl(failure.limitCents))}
          </Typography>
        ) : null}
      </Stack>
    </Alert>
  );
}

export interface OrderTicketProps {
  readonly ticker: string | null;
}

export function OrderTicket({ ticker }: OrderTicketProps) {
  const injected = useInjectDraft();
  const dispatch = useDispatch();
  const draft = useSelector(selectDraft);
  const { accountId } = useSession();
  const orderEntryEnabled = useFlag(FLAGS.orderEntry);
  const quote = useQuote(ticker ?? "");
  const placeOrder = usePlaceOrder();
  const [confirming, setConfirming] = useState(false);

  const form = useForm<TicketValues>({
    resolver: zodResolver(TicketSchema),
    mode: "onBlur",
    defaultValues: {
      ticker: ticker ?? "",
      side: "BUY",
      type: "LIMIT",
      quantity: 100,
      limitPrice: "",
      stopPrice: "",
    },
  });

  const type = form.watch("type");
  const values = form.watch();

  useEffect(() => {
    if (ticker === null) return;
    form.setValue("ticker", ticker, { shouldValidate: false });
  }, [ticker, form]);

  const referencePriceCents = quote?.priceCents ?? 0n;
  const notionalCents = estimateNotionalCents(values, referencePriceCents);

  const disabled = !orderEntryEnabled || ticker === null || placeOrder.isPending;

  const review = form.handleSubmit(() => {
    setConfirming(true);
  });

  const submit = (): void => {
    setConfirming(false);
    placeOrder.mutate(
      {
        payload: toPayload(form.getValues(), accountId, referencePriceCents),
        idempotencyKey: draft.idempotencyKey,
      },
      {
        onSuccess: () => {
          dispatch(draftSubmitted());
          form.setValue("limitPrice", "");
          form.setValue("stopPrice", "");
        },
      },
    );
  };

  return (
    <Card>
      <CardContent>
        <Stack spacing={3}>
          <Typography variant="subtitle2">
            Order ticket{ticker === null ? "" : ` · ${ticker}`}
          </Typography>

          {!orderEntryEnabled ? (
            <Alert severity="warning">
              <AlertTitle>Order entry is disabled</AlertTitle>
              Trading has been switched off centrally. Existing orders are unaffected.
            </Alert>
          ) : null}

          {!injected ? (
            <Alert severity="info">
              Running outside the shell, so the draft is not shared with the host.
            </Alert>
          ) : null}

          <Stack direction="row" spacing={3}>
            <TextField
              select
              label="Side"
              size="small"
              fullWidth
              disabled={disabled}
              {...form.register("side")}
              defaultValue="BUY"
            >
              <MenuItem value="BUY">Buy</MenuItem>
              <MenuItem value="SELL">Sell</MenuItem>
            </TextField>

            <TextField
              select
              label="Type"
              size="small"
              fullWidth
              disabled={disabled}
              {...form.register("type")}
              defaultValue="LIMIT"
            >
              <MenuItem value="LIMIT">Limit</MenuItem>
              <MenuItem value="MARKET">Market</MenuItem>
              <MenuItem value="STOP">Stop</MenuItem>
            </TextField>
          </Stack>

          <TextField
            label="Quantity"
            size="small"
            fullWidth
            disabled={disabled}
            error={form.formState.errors.quantity !== undefined}
            helperText={form.formState.errors.quantity?.message ?? "multiples of 100"}
            inputMode="numeric"
            {...form.register("quantity")}
          />

          {type === "LIMIT" ? (
            <MoneyField
              label="Limit price"
              value={form.watch("limitPrice")}
              onChange={(masked) =>
                form.setValue("limitPrice", masked, { shouldValidate: false })
              }
              error={form.formState.errors.limitPrice?.message}
              disabled={disabled}
            />
          ) : null}

          {type === "STOP" ? (
            <MoneyField
              label="Trigger price"
              value={form.watch("stopPrice")}
              onChange={(masked) =>
                form.setValue("stopPrice", masked, { shouldValidate: false })
              }
              error={form.formState.errors.stopPrice?.message}
              disabled={disabled}
            />
          ) : null}

          <Divider />

          <Stack direction="row" justifyContent="space-between" alignItems="baseline">
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Estimated cost
            </Typography>
            <Typography variant="numeric">{formatBRL(brl(notionalCents))}</Typography>
          </Stack>

          {placeOrder.isError ? <FailureNotice failure={placeOrder.error} /> : null}

          {placeOrder.isSuccess ? (
            <Alert severity="success">
              <AlertTitle>
                {placeOrder.data.replayed === true
                  ? "Already submitted"
                  : "Order accepted"}
              </AlertTitle>
              {placeOrder.data.ticker} · {placeOrder.data.side} ·{" "}
              {placeOrder.data.quantity} · {placeOrder.data.status}
            </Alert>
          ) : null}

          <Button
            variant="contained"
            color={values.side === "SELL" ? "error" : "primary"}
            disabled={disabled}
            onClick={() => void review()}
          >
            {placeOrder.isPending ? "Sending…" : "Review order"}
          </Button>
        </Stack>
      </CardContent>

      <Dialog open={confirming} onClose={() => setConfirming(false)}>
        <DialogTitle>Confirm this order</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ minWidth: 320 }}>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2">Instrument</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {values.ticker}
              </Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2">Side</Typography>
              <Typography
                variant="body2"
                sx={{ color: values.side === "BUY" ? "market.up" : "market.down" }}
              >
                {values.side}
              </Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2">Quantity</Typography>
              <Typography variant="numeric">{String(values.quantity)}</Typography>
            </Stack>
            <Divider />
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2">Estimated cost</Typography>
              <Typography variant="numeric">{formatBRL(brl(notionalCents))}</Typography>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(false)}>Cancel</Button>
          <Button variant="contained" onClick={submit}>
            Send order
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
