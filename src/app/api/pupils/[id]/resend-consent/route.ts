import type { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { requireStaffContext } from "@/server/http/session";
import { errorResponse, jsonOk } from "@/server/http/respond";
import { resendConsentLink } from "@/server/services/consentResendService";
import { ValidationError } from "@/server/errors";

interface Params {
  params: Promise<{ id: string }>;
}

// Resends/reissues a consent link for one pupil+event+guardian (Requirement 3
// of the MVP admin & consent enhancements spec). Available to admin and
// organiser via the consent.resend capability, checked inside the service.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireStaffContext();
    const { id: pupilId } = await params;
    const body = await request.json().catch(() => null);
    const eventId = body && typeof body === "object" ? (body as { eventId?: unknown }).eventId : undefined;
    const guardianId =
      body && typeof body === "object" ? (body as { guardianId?: unknown }).guardianId : undefined;
    if (typeof eventId !== "string" || !eventId) throw new ValidationError("eventId is required.");
    if (typeof guardianId !== "string" || !guardianId) throw new ValidationError("guardianId is required.");

    const result = await resendConsentLink(prisma, ctx, { eventId, pupilId, guardianId });
    return jsonOk(result);
  } catch (err) {
    return errorResponse(err);
  }
}
