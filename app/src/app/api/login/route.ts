import { type NextRequest, NextResponse } from "next/server";
import {
  expectedSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";

/**
 * The one login path. It compares the posted passcode against `APP_PASSCODE`
 * itself, and not against the token.
 * `expectedSessionToken` hashes that same passcode for the cookie. `proxy.ts`
 * recomputes the token to check every request its matcher covers. The matcher
 * covers every route but the login pair and the Next.js assets.
 * One environment variable therefore backs both the login and the check. See
 * src/lib/auth.ts.
 */
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
