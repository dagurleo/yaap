import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-medium whitespace-nowrap cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] pointer-fine:after:hidden",
  {
    variants: {
      variant: {
        default:
          "bg-control text-foreground ring-1 ring-input shadow-xs dark:shadow-none hover:bg-accent active:bg-secondary",
        outline:
          "bg-control text-foreground ring-1 ring-input shadow-xs dark:shadow-none hover:bg-accent active:bg-secondary",
        primary:
          "bg-primary text-primary-foreground ring-1 ring-primary shadow-xs dark:shadow-none hover:bg-primary-hover active:bg-primary-hover",
        secondary: "bg-muted text-foreground hover:bg-accent",
        ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
        destructive:
          "bg-control text-destructive ring-1 ring-input hover:bg-destructive/10",
        link: "text-foreground underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-9 px-3 has-[>svg:first-child]:pl-2.5 has-[>svg:last-child]:pr-2.5",
        sm: "h-7.5 px-2.5",
        icon: "size-9",
        "icon-sm": "size-7.5",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);
function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  type,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      type={asChild ? type : (type ?? "button")}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}
export { Button, buttonVariants };
