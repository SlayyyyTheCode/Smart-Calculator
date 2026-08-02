import * as React from "react";

import { cn } from "@/lib/utils";

const controlClasses =
  "w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 disabled:opacity-50 aria-[invalid=true]:border-rose-500 aria-[invalid=true]:ring-rose-500/20";

// ComponentPropsWithRef, not the HTMLAttributes types: React 19 passes `ref`
// as an ordinary prop, and these need to accept one.
export function Input({ className, ...props }: React.ComponentPropsWithRef<"input">) {
  return <input className={cn(controlClasses, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentPropsWithRef<"textarea">) {
  return <textarea className={cn(controlClasses, "min-h-20 py-2", className)} {...props} />;
}

export function Select({ className, ...props }: React.ComponentPropsWithRef<"select">) {
  return <select className={cn(controlClasses, "h-10 pr-8", className)} {...props} />;
}

type FieldProps = {
  label: string;
  htmlFor: string;
  /** Validation message for this field. Its presence marks the control invalid. */
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
};

/**
 * Label, control and message as one unit. The error is wired to the control by
 * id convention (`${htmlFor}-error`), so a screen reader announces it — pass
 * `aria-describedby` on the control to match.
 */
export function Field({ label, htmlFor, error, hint, className, children }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type SegmentedProps<T extends string> = {
  name: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; description?: string }[];
  className?: string;
};

/**
 * Radio group styled as a segmented control. Kept as real radio inputs so
 * keyboard and screen reader behaviour comes for free.
 */
export function Segmented<T extends string>({
  name,
  value,
  onChange,
  options,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      className={cn("grid gap-1 rounded-lg border border-border bg-surface-muted p-1", className)}
      // Column count varies with the option count, which Tailwind cannot
      // generate a class for at build time.
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      role="radiogroup"
    >
      {options.map((option) => {
        const id = `${name}-${option.value}`;
        const active = value === option.value;
        return (
          <label
            key={option.value}
            htmlFor={id}
            title={option.description}
            className={cn(
              "cursor-pointer rounded-md px-3 py-1.5 text-center text-sm font-medium transition-colors",
              active
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <input
              id={id}
              type="radio"
              name={name}
              value={option.value}
              checked={active}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}
