import { Construction } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

type PhaseNoticeProps = {
  /** Which build phase fills this screen in, per the project plan. */
  phase: string;
  /** What the finished screen will do. */
  children: React.ReactNode;
};

/**
 * Placeholder for a route that exists in the skeleton but is implemented in a
 * later phase. Deliberately explicit about what is coming so a half-built app
 * never looks broken.
 */
export function PhaseNotice({ phase, children }: PhaseNoticeProps) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex gap-4 pt-5">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-muted-foreground">
          <Construction className="size-4" aria-hidden />
        </span>
        <div className="space-y-1.5 text-sm">
          <p className="font-medium">Coming in {phase}</p>
          <div className="text-muted-foreground">{children}</div>
        </div>
      </CardContent>
    </Card>
  );
}
