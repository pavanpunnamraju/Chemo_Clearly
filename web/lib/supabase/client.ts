// Server-side Supabase client. Returns null when unconfigured so callers can
// fall back gracefully (e.g. log-only) instead of crashing — no live project
// exists yet to verify this against, see docs/references/handoff.md.
export async function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, serviceKey);
}
