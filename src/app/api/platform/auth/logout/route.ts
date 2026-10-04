import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { platformLogout } from "@/server/services/platformAuthService";
import {
  clearPlatformSessionCookie,
  getPlatformContext,
  readPlatformSessionCookie,
} from "@/server/http/platformSession";
import { errorResponse, jsonOk } from "@/server/http/respond";

export async function POST(request: NextRequest) {
  try {
    const token = await readPlatformSessionCookie();
    if (token) {
      const ctx = await getPlatformContext();
      await platformLogout(prisma, token, ctx ?? undefined);
    }
    await clearPlatformSessionCookie();

    if (request.headers.get("accept")?.includes("application/json")) {
      return jsonOk({ ok: true });
    }
    const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
    return NextResponse.redirect(new URL("/platform/login", base), { status: 303 });
  } catch (err) {
    return errorResponse(err);
  }
}
