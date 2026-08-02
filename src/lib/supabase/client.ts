import { createBrowserClient } from "@supabase/ssr";

import { requirePublicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Supabase client for use inside client components.
 * Carries the anon key only; every query it makes is subject to RLS.
 */
export function createClient() {
  const { supabaseUrl, supabaseAnonKey } = requirePublicEnv();
  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}
