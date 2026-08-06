"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

type Status = { kind: "idle" | "sending" | "sent" | "error"; message?: string };

/**
 * Email magic link plus Google OAuth. No passwords to store, reset or leak.
 * Both paths land on /auth/callback, which exchanges the code for a session.
 */
export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const redirectTo = `${publicEnv.siteUrl}/auth/callback?next=${encodeURIComponent(next)}`;

  async function sendMagicLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus({ kind: "sending" });

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });

    setStatus(
      error
        ? { kind: "error", message: error.message }
        : { kind: "sent", message: `Check ${email} for your sign-in link.` },
    );
  }

  async function signInWithGoogle() {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) setStatus({ kind: "error", message: error.message });
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        {/* Only offered when the project has Google configured. Rendering it
            otherwise sends the browser to Supabase, which answers "provider is
            not enabled" as raw JSON — past the point where this form could
            catch it and say so. */}
        {googleEnabled ? (
          <>
            <Button variant="outline" className="w-full" onClick={signInWithGoogle}>
              Continue with Google
            </Button>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>
          </>
        ) : null}

        <form onSubmit={sendMagicLink} className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
            />
          </div>

          <Button type="submit" className="w-full" disabled={status.kind === "sending"}>
            <Mail aria-hidden />
            {status.kind === "sending" ? "Sending…" : "Email me a sign-in link"}
          </Button>
        </form>

        {status.message ? (
          <p
            role="status"
            className={
              status.kind === "error"
                ? "text-sm text-rose-600 dark:text-rose-400"
                : "text-sm text-emerald-600 dark:text-emerald-400"
            }
          >
            {status.message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
