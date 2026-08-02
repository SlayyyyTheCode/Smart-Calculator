"use client";

import { usePathname } from "next/navigation";
import { LogOut, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { findNavItem } from "@/lib/nav";

type TopbarProps = {
  displayName: string | null;
  email: string | null;
};

export function Topbar({ displayName, email }: TopbarProps) {
  const pathname = usePathname();
  const current = findNavItem(pathname);
  const who = displayName ?? email ?? "Signed in";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur lg:px-6">
      <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground lg:hidden">
        <Wallet className="size-4" aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{current?.label ?? "Smart Planner"}</p>
        <p className="hidden truncate text-xs text-muted-foreground sm:block">
          {current?.description}
        </p>
      </div>

      <span className="hidden max-w-40 truncate text-sm text-muted-foreground sm:inline">
        {who}
      </span>

      <form action="/auth/signout" method="post">
        <Button type="submit" variant="ghost" size="sm" aria-label="Sign out">
          <LogOut aria-hidden />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </form>
    </header>
  );
}
