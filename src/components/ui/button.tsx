import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap select-none",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-fg hover:bg-primary-hover shadow-card",
        secondary: "bg-surface text-fg border border-border-strong hover:bg-surface-hover",
        ghost: "text-fg hover:bg-surface-hover",
        danger: "bg-danger text-danger-fg hover:opacity-90",
        accent: "bg-accent text-accent-fg hover:brightness-95",
        link: "text-primary-text underline-offset-4 hover:underline px-0",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4 text-sm",
        lg: "h-11 px-5 text-base",
        icon: "h-9 w-9",
        "icon-sm": "h-7 w-7",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className, variant, size, type, ...props }, ref) {
  return <button ref={ref} type={type ?? "button"} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
