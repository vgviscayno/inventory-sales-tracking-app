/**
 * The shop's single shared passcode, held as a session cookie. There are no
 * user accounts, so the cookie only proves that somebody knew the passcode.
 * The token is a hash of the passcode. The server therefore recomputes the
 * expected token from `APP_PASSCODE` and keeps no session table.
 * The cookie lasts ten years, so the till tablet stays logged in between shifts.
 */
export const SESSION_COOKIE = "store_session";
const TEN_YEARS_SECONDS = 60 * 60 * 24 * 365 * 10;

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function expectedSessionToken(): Promise<string> {
  const passcode = process.env.APP_PASSCODE;
  if (!passcode) throw new Error("APP_PASSCODE is not set");
  return sha256Hex(`store-session:${passcode}`);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TEN_YEARS_SECONDS,
  };
}
