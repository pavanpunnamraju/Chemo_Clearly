import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedPatient } from "@/lib/auth/patient";
import { listNotes, saveNote } from "@/lib/notes/store";

// Phase 1 goal #5: patient-only notes capture. Never accepts a client-supplied
// patient_id — scoping always comes from the authenticated JWT.
export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedPatient(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const regimenId = typeof body.regimenId === "string" ? body.regimenId.trim() : "";
  const questionText = typeof body.questionText === "string" ? body.questionText.trim() : "";
  if (!regimenId || !questionText) {
    return NextResponse.json({ error: "regimenId and questionText required" }, { status: 400 });
  }

  const note = await saveNote(auth.supabase, auth.patientId, regimenId, questionText);
  return NextResponse.json(note, { status: 201 });
}

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedPatient(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const regimenId = req.nextUrl.searchParams.get("regimenId") ?? undefined;
  const notes = await listNotes(auth.supabase, auth.patientId, regimenId);
  return NextResponse.json({ notes });
}
