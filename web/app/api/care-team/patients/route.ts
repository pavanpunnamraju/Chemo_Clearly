import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedCareTeam } from "@/lib/auth/careTeam";
import { getSupabaseServerClient } from "@/lib/supabase/client";
import { listCareTeamPatients } from "@/lib/watch/status";

// Phase 1 goal #7c: single list, no drill-down — all patients + regimen +
// watch status. Never reads `notes` (patient-only, excluded by design).
export async function GET(req: NextRequest) {
  if (!isAuthenticatedCareTeam(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  try {
    const patients = await listCareTeamPatients(supabase);
    return NextResponse.json({ patients });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
