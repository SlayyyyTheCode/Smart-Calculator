/**
 * Environment access.
 *
 * Public values are inlined by Next at build time, so they must be referenced
 * as full `process.env.NEXT_PUBLIC_*` literals rather than looked up
 * dynamically. Server-only secrets are read lazily and throw on first use if
 * missing, which keeps a missing cron secret from breaking an unrelated page.
 */

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  siteUrl:
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"),
};

export function requirePublicEnv() {
  return {
    supabaseUrl: required(publicEnv.supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey: required(publicEnv.supabaseAnonKey, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    siteUrl: publicEnv.siteUrl,
  };
}

/** Server-only. Never import this from a client component. */
export function requireServiceRoleKey(): string {
  return required(process.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY");
}

/** Server-only. Shared secret that gates the cron route handlers. */
export function requireCronSecret(): string {
  return required(process.env.CRON_SECRET, "CRON_SECRET");
}

/** True once Supabase credentials are present, used to show setup hints. */
export const isSupabaseConfigured = Boolean(
  publicEnv.supabaseUrl && publicEnv.supabaseAnonKey,
);
