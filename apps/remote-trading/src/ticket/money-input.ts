const formatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function digitsOf(input: string): string {
  return input.replace(/\D/g, "");
}

export function centsFromTyping(input: string): bigint {
  const digits = digitsOf(input);
  if (digits.length === 0) return 0n;
  return BigInt(digits);
}

export function formatCents(cents: bigint): string {
  if (cents === 0n) return "";
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "−" : ""}${formatter.format(Number(`${whole}.${fraction}`))}`;
}

export function maskTyping(input: string): string {
  return formatCents(centsFromTyping(input));
}

export function snapToTick(cents: bigint, tickSizeCents: bigint): bigint {
  if (tickSizeCents <= 1n) return cents;
  return cents - (cents % tickSizeCents);
}
