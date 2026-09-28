import type { NotificationType } from "@/server/domain";
import type { EmailMessage } from "@/server/notifications/EmailProvider";

// Accessible, plain-English email templates (FR-08). Rules:
//  - NO child personal data in the subject or body (Section 11 / FR-08). We
//    refer to "your child" and name the ACTIVITY and SCHOOL, never the pupil.
//  - A secure link is included where action is required.
//  - Bodies are plain text, short, and clear.

export interface TemplateContext {
  schoolName: string;
  eventTitle: string;
  eventStartsAt: Date;
  eventLocation: string | null;
  consentDeadline: Date;
  instructions: string | null;
  // The recipient's secure link (raw token URL). Present for actionable types.
  link?: string;
  // Formatter for dates in the school's timezone.
  formatDate: (d: Date) => string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
}

export function renderEmail(type: NotificationType, ctx: TemplateContext): RenderedEmail {
  switch (type) {
    case "consent_request":
      return {
        subject: `Consent needed: ${ctx.eventTitle} — ${ctx.schoolName}`,
        text: [
          `Hello,`,
          ``,
          `${ctx.schoolName} needs your consent for your child to take part in "${ctx.eventTitle}".`,
          `Date: ${ctx.formatDate(ctx.eventStartsAt)}`,
          ctx.eventLocation ? `Location: ${ctx.eventLocation}` : ``,
          `Please respond by ${ctx.formatDate(ctx.consentDeadline)}.`,
          ``,
          ctx.link ? `Give or decline consent here: ${ctx.link}` : ``,
          ``,
          `Thank you.`,
        ]
          .filter(Boolean)
          .join("\n"),
      };

    case "deadline_reminder":
      return {
        subject: `Reminder: consent needed for ${ctx.eventTitle}`,
        text: [
          `Hello,`,
          ``,
          `This is a reminder that ${ctx.schoolName} is still waiting for your consent for "${ctx.eventTitle}".`,
          `Please respond by ${ctx.formatDate(ctx.consentDeadline)}.`,
          ``,
          ctx.link ? `Respond here: ${ctx.link}` : ``,
          ``,
          `Thank you.`,
        ]
          .filter(Boolean)
          .join("\n"),
      };

    case "event_reminder":
      return {
        subject: `Reminder: ${ctx.eventTitle} is coming up`,
        text: [
          `Hello,`,
          ``,
          `A reminder that "${ctx.eventTitle}" at ${ctx.schoolName} is on ${ctx.formatDate(ctx.eventStartsAt)}.`,
          ctx.eventLocation ? `Location: ${ctx.eventLocation}` : ``,
          ctx.instructions ? `Please note: ${ctx.instructions}` : ``,
          ``,
          `Thank you.`,
        ]
          .filter(Boolean)
          .join("\n"),
      };

    case "change_notice":
      return {
        subject: `Update: ${ctx.eventTitle} — ${ctx.schoolName}`,
        text: [
          `Hello,`,
          ``,
          `There has been a change to "${ctx.eventTitle}" at ${ctx.schoolName}.`,
          `Current date: ${ctx.formatDate(ctx.eventStartsAt)}`,
          ctx.eventLocation ? `Location: ${ctx.eventLocation}` : ``,
          ``,
          ctx.link ? `View the latest details: ${ctx.link}` : ``,
          ``,
          `Thank you.`,
        ]
          .filter(Boolean)
          .join("\n"),
      };

    case "confirmation":
      return {
        subject: `Confirmation received: ${ctx.eventTitle}`,
        text: [
          `Hello,`,
          ``,
          `Thank you — your response for "${ctx.eventTitle}" at ${ctx.schoolName} has been recorded.`,
          ``,
          `If this was not you, please contact the school.`,
        ].join("\n"),
      };
  }
}

// Builds the final EmailMessage for a recipient's email address.
export function buildEmail(to: string, type: NotificationType, ctx: TemplateContext): EmailMessage {
  const rendered = renderEmail(type, ctx);
  return { to, subject: rendered.subject, text: rendered.text };
}

// Staff invite-acceptance email. Kept separate from renderEmail/NotificationType
// above because staff invites are sent synchronously from the invite request
// itself, not queued as a Notification row processed by processDueNotifications.
// Same accessibility/no-PII rules apply — this never contains pupil data.
export interface StaffInviteEmailContext {
  schoolName: string;
  inviteUrl: string;
  expiresAt: Date;
  formatDate: (d: Date) => string;
}

export function buildStaffInviteEmail(to: string, ctx: StaffInviteEmailContext): EmailMessage {
  return {
    to,
    subject: `You've been invited to join ${ctx.schoolName} on ConsaPass`,
    text: [
      `Hello,`,
      ``,
      `${ctx.schoolName} has invited you to join their ConsaPass account.`,
      `Set your password to activate your account:`,
      ``,
      ctx.inviteUrl,
      ``,
      `This link expires on ${ctx.formatDate(ctx.expiresAt)} and can only be used once.`,
      `If you weren't expecting this invite, you can ignore this email.`,
      ``,
      `Thank you.`,
    ].join("\n"),
  };
}
