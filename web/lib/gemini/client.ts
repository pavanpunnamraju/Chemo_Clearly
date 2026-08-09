// Shared Gemini client construction, routed through Vertex AI rather than
// the AI-Studio API-key-based Gemini Developer API — billed against the GCP
// project's Cloud Billing account (so the $300 trial credit applies)
// instead of AI Studio's free-tier "10 requests/day per model" cap, which
// blocked narration generation. Reuses the same GOOGLE_APPLICATION_CREDENTIALS
// service account already used for Speech-to-Text — no separate API key.

export async function getGenAIClient() {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  if (!project) return null;

  const location = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";
  const { GoogleGenAI } = await import("@google/genai");
  return new GoogleGenAI({ vertexai: true, project, location });
}
