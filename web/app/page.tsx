// Phase 1 backend only — no UI journey yet (that's Phase 2 goal 1). This page
// just confirms the app boots; the real deliverables are the API routes
// (app/api/intake, app/api/video/generate) and the demo scripts
// (npm run demo:intake, npm run demo:video).
export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 40 }}>
      <h1>Chemo Patient Education — Phase 1 backend</h1>
      <p>No patient-facing UI yet (Phase 2). Endpoints: POST /api/intake, POST /api/video/generate.</p>
    </main>
  );
}
