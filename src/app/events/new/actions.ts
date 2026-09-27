"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireStaffContext } from "@/server/http/session";
import { createEventDraft } from "@/server/services/eventService";
import { AppError } from "@/server/errors";

export interface CreateEventFormState {
  error?: string;
}

export async function createEventAction(
  _prevState: CreateEventFormState,
  formData: FormData,
): Promise<CreateEventFormState> {
  const ctx = await requireStaffContext();

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const startsAt = String(formData.get("startsAt") ?? "");
  const endsAt = String(formData.get("endsAt") ?? "");
  const consentDeadline = String(formData.get("consentDeadline") ?? "");
  const classGroupId = String(formData.get("classGroupId") ?? "").trim();

  if (!title || !startsAt || !endsAt || !consentDeadline) {
    return { error: "Title, start, end, and consent deadline are required." };
  }

  let event;
  try {
    event = await createEventDraft(prisma, ctx, {
      title,
      description: description || undefined,
      location: location || undefined,
      startsAt,
      endsAt,
      consentDeadline,
      classGroupId: classGroupId || undefined,
    });
  } catch (err) {
    if (err instanceof AppError) {
      return { error: err.message };
    }
    return { error: "Something went wrong. Please try again." };
  }

  redirect(`/events/${event.id}`);
}
