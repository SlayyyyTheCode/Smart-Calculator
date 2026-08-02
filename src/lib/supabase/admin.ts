import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { requirePublicEnv, requireServiceRoleKey } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Service-role client. Bypasses RLS entirely.
 *
 * Only the cron route handlers may use this, and only after they have verified
 * the CRON_SECRET header. Every such query MUST filter by user_id explicitly,
 * because the database will no longer do it for you.
 *
 * The `server-only` import above makes bundling this into a client component a
 * build error rather than a silent key leak.
 */
export function createAdminClient() {
  const { supabaseUrl } = requirePublicEnv();

  return createSupabaseClient<Database>(supabaseUrl, requireServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
