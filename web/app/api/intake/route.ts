import { NextRequest, NextResponse } from "next/server";
import { IntakeSchema, toPersonalizationFilter } from "@/lib/intake/schema";
import { getSupabaseServerClient } from "@/lib/supabase/client";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = IntakeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const intake = parsed.data;
  const filter = toPersonalizationFilter(intake);

  const supabase = await getSupabaseServerClient();
  let intakeResponseId: string | null = null;
  if (supabase) {
    const { data, error } = await supabase
      .from("intake_responses")
      .insert({
        regimen_id: intake.regimenId,
        education_level: intake.educationLevel,
        topics: intake.topics,
        depth_preference: intake.depthPreference,
        follow_up_questions: intake.followUpQuestions ?? null,
      })
      .select("id")
      .single();
    if (error) {
      console.error("Failed to persist intake response:", error);
    } else {
      intakeResponseId = data.id;
    }
  } else {
    console.log("Supabase not configured — intake response not persisted:", intake);
  }

  return NextResponse.json({ intakeResponseId, filter });
}
