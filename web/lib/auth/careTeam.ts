import { timingSafeEqual, createHash } from "node:crypto";
import type { NextRequest } from "next/server";

// Care-team auth (Phase 1 goal #7b). Nurse-facing, shared passcode across all
// nurses — no per-nurse identity, so this is a stateless "knows the passcode
// or doesn't" check, not a session/JWT system. The token is a hash of the
// configured passcode rather than the raw passcode, so the client never
// stores/re-sends the plaintext secret — same shared-secret model either way.
function expectedToken(): string | null {
  const passcode = process.env.CARE_TEAM_PASSCODE;
  if (!passcode) return null;
  return createHash("sha256").update(passcode).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

// Login step: checks a submitted passcode against CARE_TEAM_PASSCODE, returns
// the token the client re-sends on subsequent care-team requests.
export function checkPasscode(passcode: string): string | null {
  const expected = process.env.CARE_TEAM_PASSCODE;
  if (!expected || !passcode || !safeEqual(passcode, expected)) return null;
  return expectedToken();
}

// Gate for care-team-facing routes: verifies the Bearer token from login.
export function isAuthenticatedCareTeam(req: NextRequest): boolean {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  const expected = expectedToken();
  if (!token || !expected) return false;
  return safeEqual(token, expected);
}
