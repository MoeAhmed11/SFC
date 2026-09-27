import { NextResponse } from "next/server";
import { AppError, type AppErrorCode } from "@/server/errors";

// Consistent error -> HTTP status mapping for route handlers. Keeping this in
// one place means every route surfaces AppError the same way, and messages are
// always the safe, generic ones already chosen in the service layer.

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
};

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json({ error: err.message }, { status: STATUS_BY_CODE[err.code] });
  }
  // Never leak internal error details to the client.
  console.error(err);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

export function jsonOk(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}
