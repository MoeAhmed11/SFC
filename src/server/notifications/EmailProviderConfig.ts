import type { EmailProvider } from "@/server/notifications/EmailProvider";
import { MockEmailProvider } from "@/server/notifications/providers/mock";
import { ResendEmailProvider } from "@/server/notifications/providers/resend";

// Selects the EmailProvider implementation from environment configuration
// (spec decision 17.8: "keep it configurable upon implementation"). Adding a
// real provider means implementing EmailProvider once and adding a case here —
// no caller of processDueNotifications needs to change, because they already
// depend only on the EmailProvider interface, not on a concrete class.
//
// EMAIL_PROVIDER values:
//   "mock" (default) — in-memory, no network calls. Safe for dev/local runs.
//   "smtp"            — placeholder for a real SMTP-based provider. Not
//                       implemented — Resend (below) was selected instead;
//                       see PILOT_READINESS.md for the rationale.
//   "resend"          — https://resend.com. Requires RESEND_API_KEY and
//                       EMAIL_FROM (a verified sending domain). Section 18.3
//                       still applies: do not point this at real recipients
//                       until credentials, a verified domain, and a small
//                       end-to-end send test are in place.
//
// "smtp" is kept as a documented-but-unimplemented option in case a future
// deployment target requires it; its factory branch throws a clear
// configuration error rather than silently falling back to the mock, so a
// misconfigured production deployment fails loudly instead of quietly
// sending nothing.

export type EmailProviderKind = "mock" | "smtp" | "resend";

const KNOWN_KINDS: readonly EmailProviderKind[] = ["mock", "smtp", "resend"];

export function resolveEmailProviderKind(env: Record<string, string | undefined> = process.env): EmailProviderKind {
  const raw = (env.EMAIL_PROVIDER ?? "mock").trim().toLowerCase();
  if ((KNOWN_KINDS as readonly string[]).includes(raw)) {
    return raw as EmailProviderKind;
  }
  throw new Error(
    `Unknown EMAIL_PROVIDER "${raw}". Expected one of: ${KNOWN_KINDS.join(", ")}.`,
  );
}

// Builds the configured EmailProvider. Call this once per process (or per
// request) rather than constructing a concrete provider class directly, so
// swapping providers is purely a deployment/config change.
export function createEmailProvider(env: Record<string, string | undefined> = process.env): EmailProvider {
  const kind = resolveEmailProviderKind(env);

  switch (kind) {
    case "mock":
      return new MockEmailProvider();
    case "smtp":
      throw new Error(
        "EMAIL_PROVIDER=smtp is not implemented yet. Resend (EMAIL_PROVIDER=resend) was " +
          "selected instead — see PILOT_READINESS.md for the rationale.",
      );
    case "resend": {
      const apiKey = env.RESEND_API_KEY?.trim();
      const from = env.EMAIL_FROM?.trim();
      if (!apiKey) {
        throw new Error(
          "EMAIL_PROVIDER=resend requires RESEND_API_KEY to be set (get one from the Resend dashboard).",
        );
      }
      if (!from) {
        throw new Error(
          "EMAIL_PROVIDER=resend requires EMAIL_FROM to be set to a verified sending address, " +
            'e.g. "ConsaPass <no-reply@consapass.co.uk>".',
        );
      }
      return new ResendEmailProvider({ apiKey, from });
    }
  }
}
