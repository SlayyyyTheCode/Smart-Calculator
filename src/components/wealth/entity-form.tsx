"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { IDLE, type ActionState } from "@/lib/actions/result";
import { cn } from "@/lib/utils";

type EntityFormProps = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  /** Receives the current field errors so each field can render its own. */
  children: (errors: Record<string, string>) => ReactNode;
};

/**
 * The shell shared by the goal, debt and asset forms: submit state, the
 * message, and clearing the fields once a save succeeds. Only the fields
 * differ between them, so only the fields are written three times.
 */
export function EntityForm({ action, submitLabel, children }: EntityFormProps) {
  const [state, formAction, isPending] = useActionState(action, IDLE);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state.status]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      {children(state.fieldErrors ?? {})}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : submitLabel}
        </Button>
        {state.message ? (
          <p
            role="status"
            className={cn(
              "text-sm",
              state.status === "error"
                ? "text-rose-600 dark:text-rose-400"
                : "text-emerald-600 dark:text-emerald-400",
            )}
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
