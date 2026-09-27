import type { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { requireStaffContext } from "@/server/http/session";
import { errorResponse, jsonOk } from "@/server/http/respond";
import { commitImport } from "@/server/csv/import";
import { ValidationError } from "@/server/errors";

// Commits a previously-validated CSV. Re-validates internally and writes
// all-or-nothing (FR-10) — a single invalid row aborts the whole import.
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireStaffContext();
    const body = await request.json().catch(() => null);
    const csv = body && typeof body === "object" ? (body as { csv?: unknown }).csv : undefined;
    if (typeof csv !== "string") throw new ValidationError("CSV content is required.");

    const result = await commitImport(prisma, ctx, csv);
    return jsonOk({ result });
  } catch (err) {
    return errorResponse(err);
  }
}
