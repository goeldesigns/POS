import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic routing guard: send visitors without a session cookie to the
 * right login screen. This is only a UX shortcut — every page, server action
 * and API route re-validates the session and permissions on the server.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/super-admin") && pathname !== "/super-admin/login") {
    if (!request.cookies.has("tabla_admin_session")) {
      const url = new URL("/super-admin/login", request.url);
      if (pathname !== "/super-admin") url.searchParams.set("next", pathname + search);
      return NextResponse.redirect(url);
    }
  }

  if (pathname === "/app" || pathname.startsWith("/app/") || pathname.startsWith("/print/")) {
    if (!request.cookies.has("tabla_session")) {
      const url = new URL("/auth/login", request.url);
      url.searchParams.set("next", pathname + search);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/app", "/super-admin/:path*", "/print/:path*"],
};
