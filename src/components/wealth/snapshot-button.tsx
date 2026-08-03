"use client";

import { useActionState } from "react";
import { CameraIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { IDLE } from "@/lib/actions/result";
import { snapshotNetWorthNow } from "@/lib/actions/wealth";
import { cn } from "@/lib/utils";

/**
 * Takes today's snapshot without waiting for the monthly job. Re-recording on
 * the same day overwrites rather than duplicating.
 */
export function SnapshotButton() {
  const [state, formAction, isPending] = useActionState(snapshotNetWorthNow, IDLE);

  return (
    <form action={formAction} className="flex items-center gap-3">
      <Button type="submit" variant="outline" size="sm" disabled={isPending}>
        <CameraIcon aria-hidden />
        {isPending ? "Recording…" : "Record today"}
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
