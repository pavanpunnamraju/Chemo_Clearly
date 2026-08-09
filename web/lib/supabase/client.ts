// Server-side Supabase client (service-role key, bypasses RLS). Returns null
// when unconfigured so callers can fall back gracefully (e.g. log-only)
// instead of crashing. Care-team/pipeline use only — never use this to act on
// a patient's behalf, see getSupabaseUserClient below.
export async function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, serviceKey);
}

// Request-scoped client authenticated as a specific patient (their Supabase
// Auth access token), using the anon key. Reads/writes through this client
// are subject to RLS (`patient_id = auth.uid()`) — this is what patient-facing
// routes use instead of the service-role client above, so a patient can never
// touch another patient's rows even if a bug omits a WHERE clause.
export async function getSupabaseUserClient(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
