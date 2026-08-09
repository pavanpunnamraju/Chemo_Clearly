import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedPatient } from "@/lib/auth/patient";
import { assignRegimen } from "@/lib/watch/status";

// Phase 1 goal #6 (minimal slice): QR encodes a plain regimenId; scanning it
// (while logged in) assigns that regimen to the patient's account. No
// picker/search — this is the only path to a regimen. Token security
// hardening is explicitly Phase 3, not here.
export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedPatient(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const regimenId = typeof body.regimenId === "string" ? body.regimenId.trim() : "";
  if (!regimenId) return NextResponse.json({ error: "regimenId required" }, { status: 400 });

  try {
    const result = await assignRegimen(auth.supabase, auth.patientId, regimenId);
    return NextResponse.json({ regimenId, ...result });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
