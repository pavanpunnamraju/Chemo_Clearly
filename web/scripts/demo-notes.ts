// Runnable, real-Supabase demonstration of Phase 1 goal #5 (patient notes
// capture). Run: npm run demo:notes
//
// Uses the service-role admin API only to create synthetic, pre-confirmed
// test patients. All note reads/writes go through the same anon-key +
// user-JWT client a real patient/browser would use, never the service-role
// key, to prove RLS (patient_id = auth.uid()) is what protects the data.

import { config as loadEnvLocal } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listNotes, saveNote } from "../lib/notes/store";

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
  console.log("--- setup: real Supabase Auth signup + login ---");
  const patientA = await createConfirmedPatient("a");
  console.log(`Patient A logged in: ${patientA.email} (${patientA.userId})`);

  console.log("\n--- #5: save + list notes ---");
  const saved = await saveNote(patientA.userClient, patientA.userId, "rchop", "What should I eat before infusion?");
  console.log("Saved note:", saved);
  const listed = await listNotes(patientA.userClient, patientA.userId);
  console.log("Listed notes (all regimens):", listed);
  if (listed.length !== 1 || listed[0]?.id !== saved.id) {
    throw new Error("Expected exactly the saved note to be listed back");
  }

  const listedScoped = await listNotes(patientA.userClient, patientA.userId, "act");
  console.log(`Listed notes scoped to a different regimen (expect 0): ${listedScoped.length}`);
  if (listedScoped.length !== 0) throw new Error("Regimen-scoped list leaked a note from another regimen");

  console.log("\n--- RLS check: patient B cannot see patient A's notes ---");
  const patientB = await createConfirmedPatient("b");
  const crossRead = await listNotes(patientB.userClient, patientA.userId);
  console.log(`Patient B listing (own client, patient A's id passed in) sees: ${crossRead.length} rows (expect 0)`);
  if (crossRead.length !== 0) {
    throw new Error("RLS FAILED: patient B could see patient A's notes");
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
