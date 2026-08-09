import type { NextRequest } from "next/server";
import { getSupabaseUserClient } from "@/lib/supabase/client";

// Extracts the patient's Supabase Auth access token from the request and
// returns an RLS-scoped client + their patient id (auth.uid()), or null if
// unauthenticated/misconfigured. Patient-facing routes use this instead of
// the service-role client — never trust a client-supplied patient_id.
export async function getAuthenticatedPatient(req: NextRequest) {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;

  const supabase = await getSupabaseUserClient(token);
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  return { supabase, patientId: data.user.id };
}
