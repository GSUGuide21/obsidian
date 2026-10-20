import { cva, type VariantProps } from "class-variance-authority";

/**
 * The look shared by text-like controls (inputs, text areas, select triggers):
 * an `input`-colored edge that lightens on hover, the accent while focused, and
 * danger while invalid (set by <Field error> through useFieldAria).
 * `size` sets the height; "auto" grows with the content (text areas, tag lists).
 * `frame` is for a box wrapping its own input: it lights up while anything
 * inside has focus.
 */
export const inputVariants = cva(
  "w-full rounded-lg border border-input bg-surface-2 text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted hover:border-muted disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-input aria-invalid:border-danger aria-invalid:hover:border-danger",
  {
    variants: {
      size: {
        sm: "h-9 px-2.5",
        md: "h-10 px-3",
        auto: "px-3 py-2",
      },
      frame: {
        false:
          "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 aria-invalid:focus-visible:border-danger aria-invalid:focus-visible:ring-danger/30",
        true: "focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30 has-disabled:opacity-50 has-aria-invalid:border-danger",
      },
    },
    defaultVariants: { size: "md", frame: false },
  },
);

export type InputVariants = VariantProps<typeof inputVariants>;
