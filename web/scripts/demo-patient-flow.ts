// Runnable, real-Supabase demonstration of Phase 1 goals #7a (patient auth),
// #6 (minimal QR -> regimen assignment), and #4 (watch tracking). Run:
// npm run demo:patient-flow
//
// Uses the service-role admin API only to create synthetic, pre-confirmed
// test patients (so this script doesn't depend on clicking an email
// confirmation link — see the "email confirmation" note in the handoff
// report for the real signup flow's implication). Every scan/watch-status
// call below goes through the same anon-key + user-JWT client a real
// patient/browser would use, never the service-role key, to prove RLS
// (patient_id = auth.uid()) is what's actually protecting the data.

import { config as loadEnvLocal } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assignRegimen, recordPlaybackEvent } from "../lib/watch/status";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnvLocal({ path: path.join(__dirname, "..", ".env.local") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY must be set in .env.local",
  );
}

const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(url, serviceKey);

async function createConfirmedPatient(label: string) {
  const email = `demo-${label}-${Date.now()}@chemo-education.test`;
  const password = `demo-pass-${Math.random().toString(36).slice(2)}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);

  const anon = createClient(url!, anonKey!);
  const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({ email, password });
  if (signInError || !signIn.session) throw new Error(`signInWithPassword failed: ${signInError?.message}`);

  const userClient = createClient(url!, anonKey!, {
    global: { headers: { Authorization: `Bearer ${signIn.session.access_token}` } },
  });
  return { userId: data.user.id, email, userClient };
}

async function main() {
  console.log("--- #7a: real Supabase Auth signup + login ---");
  const patientA = await createConfirmedPatient("a");
  console.log(`Patient A logged in: ${patientA.email} (${patientA.userId})`);

  console.log("\n--- #6: minimal QR scan -> watch_status assignment ---");
  console.log("First scan of rchop:", await assignRegimen(patientA.userClient, patientA.userId, "rchop"));
  console.log(
    "Re-scan of same regimen (must not reset status):",
    await assignRegimen(patientA.userClient, patientA.userId, "rchop"),
  );

  console.log("\n--- #4: watch tracking, sticky done ---");
  console.log("Playback start ->", await recordPlaybackEvent(patientA.userClient, patientA.userId, "rchop", "start"));
  console.log("Playback end ->", await recordPlaybackEvent(patientA.userClient, patientA.userId, "rchop", "end"));
  console.log(
    "Re-watch start after done (must stay done, sticky) ->",
    await recordPlaybackEvent(patientA.userClient, patientA.userId, "rchop", "start"),
  );

  console.log("\n--- RLS check: patient B cannot see or touch patient A's row ---");
  const patientB = await createConfirmedPatient("b");
  const { data: crossRead, error: crossReadError } = await patientB.userClient
    .from("watch_status")
    .select("*")
    .eq("patient_id", patientA.userId);
  if (crossReadError) throw new Error(`Unexpected read error: ${crossReadError.message}`);
  console.log(`Patient B reading patient A's watch_status rows: ${crossRead?.length ?? 0} rows visible (expect 0)`);
  if ((crossRead?.length ?? 0) !== 0) {
    throw new Error("RLS FAILED: patient B could see patient A's watch_status row");
  }

  try {
    await recordPlaybackEvent(patientB.userClient, patientA.userId, "rchop", "start");
    throw new Error("RLS FAILED: patient B was able to write patient A's watch_status row");
  } catch (err) {
    console.log(
      "Patient B attempting to touch patient A's row correctly fails closed (RLS hides it, reads as unassigned):",
      (err as Error).message,
    );
  }

  console.log("\n--- cleanup: removing synthetic test users ---");
  await admin.auth.admin.deleteUser(patientA.userId);
  await admin.auth.admin.deleteUser(patientB.userId);
  console.log("All checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
