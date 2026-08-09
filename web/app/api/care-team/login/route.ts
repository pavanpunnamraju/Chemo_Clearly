import { NextRequest, NextResponse } from "next/server";
import { checkPasscode } from "@/lib/auth/careTeam";

// Phase 1 goal #7b: nurse-facing shared passcode, no per-nurse identity.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const passcode = typeof body.passcode === "string" ? body.passcode : "";
  if (!passcode) return NextResponse.json({ error: "passcode required" }, { status: 400 });

  const token = checkPasscode(passcode);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({ token });
}
