import "server-only";

import { publicEnv } from "@/lib/env";

/**
 * Which third-party sign-in providers the Supabase project actually has
 * configured.
 *
 * Asking rather than assuming, because offering a button that cannot work is
 * worse than offering nothing. `signInWithOAuth` navigates the browser to
 * Supabase before any error comes back, so a disabled provider does not
 * surface as a message in the form — the user just lands on a page of raw
 * JSON reading "Unsupported provider: provider is not enabled". There is no
 * client-side error handler that can catch that, so the button has to be
 * absent in the first place.
 *
 * The settings endpoint is public and unauthenticated; it reports which
 * external providers are on, never any secret.
 */
export type EnabledProviders = { google: boolean };

const NONE: EnabledProviders = { google: false };

export async function getEnabledProviders(): Promise<EnabledProviders> {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) return NONE;

  try {
    const response = await fetch(`${publicEnv.supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: publicEnv.supabaseAnonKey },
      // Providers change when someone edits project settings, not per request.
      next: { revalidate: 300 },
    });
    if (!response.ok) return NONE;

    const settings = (await response.json()) as { external?: Record<string, boolean> };
    return { google: settings.external?.google === true };
  } catch {
    // Unreachable Supabase is already handled by the rest of the page; there is
    // nothing useful to say here beyond "do not offer the button".
    return NONE;
  }
}
