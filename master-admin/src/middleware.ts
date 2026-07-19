import { NextResponse, type NextRequest } from "next/server";
import { AUTH_FLAG_COOKIE, verifyAuthFlag } from "@/lib/auth-flag";

const PUBLIC_PATHS = ["/auth/login", "/auth/forgot"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/_next") || pathname.startsWith("/api")) {
    return NextResponse.next();
  }
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const flag = req.cookies.get(AUTH_FLAG_COOKIE)?.value;
  const isAuthed = await verifyAuthFlag(flag, process.env.AUTH_FLAG_SECRET);

  if (!isPublic && !isAuthed) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth/login";
    const res = NextResponse.redirect(url);
    // Drop a stale/forged cookie so the client doesn't keep retrying with it.
    if (flag) res.cookies.delete(AUTH_FLAG_COOKIE);
    return res;
  }
  if (isPublic && isAuthed && pathname.startsWith("/auth/login")) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|public).*)"],
};
