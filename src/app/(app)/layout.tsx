import { redirect } from "next/navigation";

import { MobileNav } from "@/components/shell/mobile-nav";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

// Every screen behind this layout is per-user and reads the session cookie, so
// none of it can be prerendered at build time.
export const dynamic = "force-dynamic";

/**
 * Shell for every signed-in screen: sidebar on desktop, tab bar on phones.
 *
 * The middleware already redirects anonymous visitors, but this layout checks
 * again because a layout is the last place a page can be protected if the
 * matcher is ever edited.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured) {
    redirect("/login");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar displayName={profile?.display_name ?? null} email={user.email ?? null} />
        <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 pb-24 pt-6 lg:px-6 lg:pb-10">
          {children}
        </main>
        <MobileNav />
      </div>
    </div>
  );
}
