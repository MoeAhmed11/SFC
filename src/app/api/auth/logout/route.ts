import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { logout } from "@/server/services/authService";
import { clearSessionCookie, getStaffContext, readSessionCookie } from "@/server/http/session";
import { errorResponse, jsonOk } from "@/server/http/respond";

export async function POST(request: NextRequest) {
  try {
    const token = await readSessionCookie();
    if (token) {
      const ctx = await getStaffContext();
      await logout(prisma, token, ctx ?? undefined);
    }
    await clearSessionCookie();

    // A plain HTML <form method="post"> (no JS) expects a navigation response;
    // a fetch()-based caller expects JSON. Distinguish by Accept header.
    if (request.headers.get("accept")?.includes("application/json")) {
      return jsonOk({ ok: true });
    }
    // Build the redirect from APP_BASE_URL (same convention as invite/parent
    // links), not request.url — request.url reflects whatever host/port the
    // Next.js process itself sees, which is wrong behind Render's internal
    // port/proxying or any other reverse proxy in front of the app.
    const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
    return NextResponse.redirect(new URL("/login", base), { status: 303 });
  } catch (err) {
    return errorResponse(err);
  }
}
