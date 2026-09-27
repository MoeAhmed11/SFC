import type { NextRequest } from "next/server";
import { requireStaffContext } from "@/server/http/session";
import { errorResponse, jsonOk } from "@/server/http/respond";
import { validateImport } from "@/server/csv/import";
import { ValidationError } from "@/server/errors";

// Validates CSV content and returns a preview with per-row errors. Writes
// NOTHING (FR-10) — staff review the preview before calling /commit.
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireStaffContext();
    const body = await request.json().catch(() => null);
    const csv = body && typeof body === "object" ? (body as { csv?: unknown }).csv : undefined;
    if (typeof csv !== "string") throw new ValidationError("CSV content is required.");

    const preview = validateImport(ctx, csv);
    return jsonOk({ preview });
  } catch (err) {
    return errorResponse(err);
  }
}
