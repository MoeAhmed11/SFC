import { createEmailProvider } from "@/server/notifications/EmailProviderConfig";
import { buildStaffInviteEmail } from "@/server/notifications/templates";
import { makeDateFormatter } from "@/server/notifications/format";

// Sends the staff invite-acceptance email synchronously, at invite time —
// unlike parent notifications, staff invites are not queued as Notification
// rows (there is exactly one send, not a scheduled series of reminders), so
// this goes straight through the configured EmailProvider rather than through
// processDueNotifications.
//
// Deliberately never throws: a transient provider failure must not block
// staff onboarding. The invite (and its link) has already been created by the
// time this runs, so the caller always has the copy-paste fallback available
// regardless of the outcome here (Section 18.3 residual gap, documented in
// PILOT_READINESS.md).

export interface SendStaffInviteEmailInput {
  to: string;
  schoolName: string;
  schoolTimezone: string;
  inviteUrl: string;
  expiresAt: Date;
}

export interface SendStaffInviteEmailResult {
  sent: boolean;
  // Present only when sent is false — a short, non-sensitive reason, useful
  // for logs/audit metadata. Never includes provider response bodies.
  error?: string;
}

export async function sendStaffInviteEmail(
  input: SendStaffInviteEmailInput,
): Promise<SendStaffInviteEmailResult> {
  try {
    const provider = createEmailProvider();
    const message = buildStaffInviteEmail(input.to, {
      schoolName: input.schoolName,
      inviteUrl: input.inviteUrl,
      expiresAt: input.expiresAt,
      formatDate: makeDateFormatter(input.schoolTimezone),
    });
    await provider.send(message);
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return { sent: false, error: message };
  }
}
