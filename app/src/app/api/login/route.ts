import { type NextRequest, NextResponse } from "next/server";
import {
  expectedSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  const { passcode } = await request.json();

  if (typeof passcode !== "string" || passcode !== process.env.APP_PASSCODE) {
    return NextResponse.json({ error: "Incorrect passcode" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    SESSION_COOKIE,
    await expectedSessionToken(),
    sessionCookieOptions(),
  );
  return response;
}
