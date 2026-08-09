import type { SupabaseClient } from "@supabase/supabase-js";

export type Note = {
  id: string;
  regimenId: string;
  questionText: string;
  createdAt: string;
};

// Phase 1 goal #5: patient's post-video questions, patient-only (never
// exposed to care-team views — see product_requirements.md Notes section).
export async function saveNote(
  supabase: SupabaseClient,
  patientId: string,
  regimenId: string,
  questionText: string,
): Promise<Note> {
  const { data, error } = await supabase
    .from("notes")
    .insert({ patient_id: patientId, regimen_id: regimenId, question_text: questionText })
    .select("id, regimen_id, question_text, created_at")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id, regimenId: data.regimen_id, questionText: data.question_text, createdAt: data.created_at };
}

export async function listNotes(
  supabase: SupabaseClient,
  patientId: string,
  regimenId?: string,
): Promise<Note[]> {
  let query = supabase
    .from("notes")
    .select("id, regimen_id, question_text, created_at")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });
  if (regimenId) query = query.eq("regimen_id", regimenId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data.map((row) => ({
    id: row.id,
    regimenId: row.regimen_id,
    questionText: row.question_text,
    createdAt: row.created_at,
  }));
}
