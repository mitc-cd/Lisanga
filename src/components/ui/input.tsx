import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type LabelHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const field =
  "w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-fg placeholder:text-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60 aria-[invalid=true]:border-danger";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn(field, "h-10", className)} {...p} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cn(field, "py-2 min-h-24", className)} {...p} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...p }, ref) {
  return <select ref={ref} className={cn(field, "h-10 pr-8", className)} {...p} />;
});

export function Label({ className, ...p }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("block text-sm font-medium text-fg mb-1", className)} {...p} />;
}

export function FieldHint({ id, children, error }: { id?: string; children: React.ReactNode; error?: boolean }) {
  return (
    <p id={id} className={cn("mt-1 text-xs", error ? "text-danger" : "text-muted")} role={error ? "alert" : undefined}>
      {children}
    </p>
  );
}
