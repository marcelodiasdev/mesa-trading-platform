import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mui/material";
import { PriceChange } from "./PriceChange";

const meta = {
  title: "Market/PriceChange",
  component: PriceChange,
  parameters: {
    docs: {
      description: {
        component:
          "Displays a price movement. Direction is encoded three ways — colour, " +
          "arrow glyph and explicit sign — so the value stays readable for users " +
          "with colour vision deficiency. Numbers use tabular figures so digits " +
          "keep a fixed width and columns do not shift as prices update.",
      },
    },
  },
  argTypes: {
    percent: { control: { type: "number", step: 0.01 } },
    absolute: { control: "text" },
    dense: { control: "boolean" },
  },
} satisfies Meta<typeof PriceChange>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Up: Story = { args: { percent: 1.24, absolute: "R$ 0,48" } };
export const Down: Story = { args: { percent: -2.07, absolute: "R$ 0,79" } };
export const Flat: Story = { args: { percent: 0 } };
export const Dense: Story = { args: { percent: -0.35, dense: true } };

export const TabularAlignment: Story = {
  args: { percent: 1.11 },
  render: () => (
    <Stack>
      <PriceChange percent={11.11} />
      <PriceChange percent={-8.88} />
      <PriceChange percent={1.01} />
      <PriceChange percent={-10.1} />
    </Stack>
  ),
};
