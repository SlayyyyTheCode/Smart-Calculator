"use client";

import { useActionState } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { materializeNow } from "@/lib/actions/recurring";
import { IDLE } from "@/lib/actions/result";
import { cn } from "@/lib/utils";

/**
 * Posts anything currently due without waiting for the nightly job. Safe to
 * press repeatedly — the insert ignores occurrences that already exist.
 */
export function RunNowButton() {
  const [state, formAction, isPending] = useActionState(materializeNow, IDLE);

  return (
    <form action={formAction} className="flex items-center gap-3">
      <Button type="submit" variant="outline" size="sm" disabled={isPending}>
        <RefreshCw className={cn(isPending && "animate-spin")} aria-hidden />
        {isPending ? "Posting…" : "Post what is due"}
      </Button>
      {state.message ? (
        <p
          role="status"
          className={cn(
            "text-sm",
            state.status === "error"
              ? "text-rose-600 dark:text-rose-400"
              : "text-muted-foreground",
          )}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
