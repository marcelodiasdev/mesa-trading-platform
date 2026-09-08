import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack, Typography } from "@mui/material";
import { Money } from "./Money";

const meta = {
  title: "Market/Money",
  component: Money,
  parameters: {
    docs: {
      description: {
        component:
          "Renders an amount held as an integer number of cents. Figures use " +
          "tabular numerals so digits keep a fixed width and columns stay " +
          "aligned as values change. A missing figure shows a dash rather than " +
          "zero, because unknown and nothing are different facts.",
      },
    },
  },
  argTypes: {
    cents: { control: false },
    withSymbol: { control: "boolean" },
    dense: { control: "boolean" },
    signed: { control: "boolean" },
    coloured: { control: "boolean" },
  },
} satisfies Meta<typeof Money>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Amount: Story = {
  args: { cents: 123_456_78n },
};

export const WithCurrencySymbol: Story = {
  args: { cents: 123_456_78n, withSymbol: true },
};

export const Negative: Story = {
  args: { cents: -385_000n, withSymbol: true },
};

export const SignedDelta: Story = {
  args: { cents: 15_000n, signed: true, coloured: true },
};

export const Unknown: Story = {
  name: "Unknown, not zero",
  args: { cents: null },
};

export const Dense: Story = {
  args: { cents: 38_50n, dense: true },
};

export const TabularAlignment: Story = {
  name: "Tabular alignment",
  args: { cents: 0n },
  parameters: {
    docs: {
      description: {
        story:
          "Four amounts of different lengths. The decimal separators line up " +
          "vertically, which is what stops a column from shifting while prices " +
          "update.",
      },
    },
  },
  render: () => (
    <Stack alignItems="flex-end">
      <Money cents={11_11n} />
      <Money cents={1_234_56n} />
      <Money cents={9n} />
      <Money cents={88_888_88n} />
    </Stack>
  ),
};

export const BeyondSafeInteger: Story = {
  name: "Beyond Number.MAX_SAFE_INTEGER",
  args: { cents: 0n },
  parameters: {
    docs: {
      description: {
        story:
          "Amounts are bigint all the way through, so a figure past 2^53 " +
          "survives intact. The same value as a JSON number would lose its " +
          "last digits.",
      },
    },
  },
  render: () => (
    <Stack spacing={2}>
      <Money cents={9_007_199_254_740_993n} withSymbol />
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        as a JavaScript number: {String(Number("9007199254740993"))}
      </Typography>
    </Stack>
  ),
};
