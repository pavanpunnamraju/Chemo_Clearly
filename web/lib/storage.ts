import { mkdirSync, copyFileSync } from "node:fs";
import path from "node:path";

// Storage abstraction for generated videos. Design doc: output stored in
// Supabase Storage. Without a live Supabase project/credentials to verify
// against, this falls back to local disk so the pipeline stays runnable
// end-to-end — swap in the Supabase branch once NEXT_PUBLIC_SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY are set and verified with a real call.

export interface StoredVideo {
  url: string;
  backend: "supabase" | "local";
}

export async function storeVideo(localPath: string, key: string): Promise<StoredVideo> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceKey) {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, serviceKey);
    const { readFileSync } = await import("node:fs");
    const fileBuffer = readFileSync(localPath);

    const { error } = await supabase.storage
      .from("videos")
      .upload(key, fileBuffer, { contentType: "video/mp4", upsert: true });
    if (error) throw new Error(`Supabase Storage upload failed: ${error.message}`);

    const { data } = supabase.storage.from("videos").getPublicUrl(key);
    return { url: data.publicUrl, backend: "supabase" };
  }

  const outDir = path.join(process.cwd(), "out", "videos");
  mkdirSync(outDir, { recursive: true });
  const destPath = path.join(outDir, key);
  mkdirSync(path.dirname(destPath), { recursive: true });
  copyFileSync(localPath, destPath);
  return { url: `file://${destPath}`, backend: "local" };
}
