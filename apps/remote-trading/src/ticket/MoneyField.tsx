import { TextField } from "@mui/material";
import { maskTyping } from "./money-input";

export interface MoneyFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (masked: string) => void;
  readonly error?: string | undefined;
  readonly disabled?: boolean;
}

export function MoneyField({ label, value, onChange, error, disabled }: MoneyFieldProps) {
  return (
    <TextField
      label={label}
      value={value}
      onChange={(event) => onChange(maskTyping(event.target.value))}
      error={error !== undefined}
      helperText={error ?? " "}
      disabled={disabled ?? false}
      size="small"
      fullWidth
      inputMode="numeric"
      slotProps={{
        input: { startAdornment: <span style={{ marginRight: 8 }}>R$</span> },
        htmlInput: { inputMode: "numeric", style: { textAlign: "right" } },
      }}
    />
  );
}
