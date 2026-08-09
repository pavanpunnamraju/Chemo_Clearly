import type { SupabaseClient } from "@supabase/supabase-js";

export type WatchStatusValue = "not_started" | "in_progress" | "done";

// QR scan -> regimen assignment (Phase 1 goal #6 slice). A watch_status row
// existing for (patientId, regimenId) IS the assignment, per
// docs/backend_schema.md. Re-scanning the same regimen only refreshes
// updated_at — it must never reset an in_progress/done patient back to
// not_started. Scanning a *different* regimen's QR creates a second row
// (unique per patient+regimen), which is how "most recent updated_at wins"
// re-assignment works.
export async function assignRegimen(
  supabase: SupabaseClient,
  patientId: string,
  regimenId: string,
): Promise<{ status: WatchStatusValue }> {
  const { data: existing, error: selectError } = await supabase
    .from("watch_status")
    .select("id, status")
    .eq("patient_id", patientId)
    .eq("regimen_id", regimenId)
    .maybeSingle();
  if (selectError) throw new Error(selectError.message);

  if (existing) {
    const { error } = await supabase
      .from("watch_status")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return { status: existing.status as WatchStatusValue };
  }

  const { error } = await supabase
    .from("watch_status")
    .insert({ patient_id: patientId, regimen_id: regimenId, status: "not_started" });
  if (error) throw new Error(error.message);
  return { status: "not_started" };
}

// Playback start/end events (Phase 1 goal #4). `done` is sticky — once
// reached, re-watching never reverts it, and hitting it again is a no-op.
export async function recordPlaybackEvent(
  supabase: SupabaseClient,
  patientId: string,
  regimenId: string,
  event: "start" | "end",
): Promise<{ status: WatchStatusValue }> {
  const { data: row, error: selectError } = await supabase
    .from("watch_status")
    .select("id, status")
    .eq("patient_id", patientId)
    .eq("regimen_id", regimenId)
    .maybeSingle();
  if (selectError) throw new Error(selectError.message);
  if (!row) throw new Error("No assigned regimen — scan QR first");

  const current = row.status as WatchStatusValue;
  const next: WatchStatusValue = current === "done" ? "done" : event === "start" ? "in_progress" : "done";
  if (next === current) return { status: current };

  const { error } = await supabase
    .from("watch_status")
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq("id", row.id);
  if (error) throw new Error(error.message);
  return { status: next };
}

export type CareTeamPatientRow = {
  patientId: string;
  email: string | null;
  regimenId: string;
  status: WatchStatusValue;
  updatedAt: string;
};

// Care-team list page (Phase 1 goal #7c). watch_status is unique per
// (patient_id, regimen_id), so each row already IS that pair's latest/only
// status — no separate "most recent wins" grouping needed here (that only
// applies when picking a single patient's *current* regimen elsewhere).
// Never touches `notes` — patient-only, excluded from this view by design.
export async function listCareTeamPatients(supabase: SupabaseClient): Promise<CareTeamPatientRow[]> {
  const { data: rows, error } = await supabase
    .from("watch_status")
    .select("patient_id, regimen_id, status, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  if (!rows.length) return [];

  const { data: usersPage, error: usersError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (usersError) throw new Error(usersError.message);
  const emailByPatientId = new Map(usersPage.users.map((u) => [u.id, u.email ?? null]));

  return rows.map((row) => ({
    patientId: row.patient_id,
    email: emailByPatientId.get(row.patient_id) ?? null,
    regimenId: row.regimen_id,
    status: row.status as WatchStatusValue,
    updatedAt: row.updated_at,
  }));
}
