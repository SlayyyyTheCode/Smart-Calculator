import { Suspense } from "react";
import type { Metadata } from "next";
import { Wallet } from "lucide-react";

import { LoginForm } from "@/components/auth/login-form";
import { SetupNotice } from "@/components/auth/setup-notice";
import { getEnabledProviders } from "@/lib/auth/providers";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const providers = isSupabaseConfigured
    ? await getEnabledProviders()
    : { google: false };

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <Wallet className="size-5" aria-hidden />
          </span>
          <h1 className="text-xl font-semibold tracking-tight">Smart Planner</h1>
          <p className="text-sm text-muted-foreground">
            Expenses, income and budgets in one place — on your phone and your laptop.
          </p>
        </div>

        {/* LoginForm reads the ?next= param, so it needs a Suspense boundary. */}
        {isSupabaseConfigured ? (
          <Suspense fallback={<div className="h-64 rounded-xl border border-border bg-surface" />}>
            <LoginForm googleEnabled={providers.google} />
          </Suspense>
        ) : (
          <SetupNotice />
        )}
      </div>
    </main>
  );
}
