import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedPatient } from "@/lib/auth/patient";
import { recordPlaybackEvent } from "@/lib/watch/status";

const EVENTS = ["start", "end"] as const;

// Phase 1 goal #4: two client-side playback events (not heartbeat/progress
// tracking) move watch_status. `done` is sticky, see lib/watch/status.ts.
export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedPatient(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const regimenId = typeof body.regimenId === "string" ? body.regimenId.trim() : "";
  const event = body.event;
  if (!regimenId || !EVENTS.includes(event)) {
    return NextResponse.json({ error: "regimenId and event ('start'|'end') required" }, { status: 400 });
  }

  try {
    const result = await recordPlaybackEvent(auth.supabase, auth.patientId, regimenId, event);
    return NextResponse.json({ regimenId, ...result });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 404 });
  }
}
