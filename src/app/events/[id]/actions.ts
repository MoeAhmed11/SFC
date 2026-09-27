"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireStaffContext } from "@/server/http/session";
import { cancelEvent, completeEvent, publishEvent } from "@/server/services/eventService";
import { AppError } from "@/server/errors";

export interface EventActionState {
  error?: string;
}

export async function publishEventAction(
  eventId: string,
  classGroupId: string | undefined,
  _prevState: EventActionState,
  _formData: FormData,
): Promise<EventActionState> {
  const ctx = await requireStaffContext();
  try {
    await publishEvent(prisma, ctx, eventId, { classGroupId: classGroupId || undefined });
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    return { error: "Something went wrong. Please try again." };
  }
  revalidatePath(`/events/${eventId}`);
  return {};
}

export async function cancelEventAction(
  eventId: string,
  _prevState: EventActionState,
  _formData: FormData,
): Promise<EventActionState> {
  const ctx = await requireStaffContext();
  try {
    await cancelEvent(prisma, ctx, eventId);
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    return { error: "Something went wrong. Please try again." };
  }
  revalidatePath(`/events/${eventId}`);
  return {};
}

export async function completeEventAction(
  eventId: string,
  _prevState: EventActionState,
  _formData: FormData,
): Promise<EventActionState> {
  const ctx = await requireStaffContext();
  try {
    await completeEvent(prisma, ctx, eventId);
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    return { error: "Something went wrong. Please try again." };
  }
  revalidatePath(`/events/${eventId}`);
  return {};
}
