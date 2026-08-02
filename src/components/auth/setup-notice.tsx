import { Card, CardContent } from "@/components/ui/card";

/**
 * Shown instead of the sign-in form when Supabase credentials are absent, so a
 * fresh clone explains itself rather than throwing on first render.
 */
export function SetupNotice() {
  return (
    <Card>
      <CardContent className="space-y-3 pt-5 text-sm">
        <p className="font-medium">Supabase is not configured yet</p>
        <p className="text-muted-foreground">
          Copy <code className="rounded bg-surface-muted px-1">.env.example</code> to{" "}
          <code className="rounded bg-surface-muted px-1">.env.local</code> and fill in your
          project URL and anon key, then restart the dev server. Full steps are in{" "}
          <code className="rounded bg-surface-muted px-1">README.md</code>.
        </p>
      </CardContent>
    </Card>
  );
}
