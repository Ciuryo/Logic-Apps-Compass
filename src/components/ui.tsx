import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes } from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...values: Parameters<typeof clsx>) { return twMerge(clsx(...values)); }

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }>(
  function Button({ variant = "primary", className, type = "button", ...props }, ref) {
    return <button ref={ref} type={type} className={cn(variant === "primary" ? "button" : `button-${variant}`, className)} {...props} />;
  }
);

export function Badge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "success" | "warning" | "critical" }) {
  return <span className={cn("badge", `badge-${tone}`, className)} {...props} />;
}

export function CodeBlock({ children, testId }: { children: string; testId?: string }) {
  return <pre className="code-block" role="region" aria-label="Conteúdo JSON" tabIndex={0} data-testid={testId}><code>{children}</code></pre>;
}
