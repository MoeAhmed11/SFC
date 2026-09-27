import type { EmailProvider } from "@/server/notifications/EmailProvider";
import { MockEmailProvider } from "@/server/notifications/providers/mock";

// Selects the EmailProvider implementation from environment configuration
// (spec decision 17.8: "keep it configurable upon implementation"). Adding a
// real provider means implementing EmailProvider once and adding a case here —
// no caller of processDueNotifications needs to change, because they already
// depend only on the EmailProvider interface, not on a concrete class.
//
// EMAIL_PROVIDER values:
//   "mock" (default) — in-memory, no network calls. Safe for dev/local runs.
//   "smtp"            — placeholder for a real SMTP-based provider.
//   "resend"          — placeholder for a real HTTP API provider (e.g. Resend,
//                       Postmark, SES). Named generically since 17.8 (which
//                       vendor, which sending domain) is still open.
//
// Real adapters are intentionally NOT implemented yet (Section 18.3: no real
// third-party integrations without credentials and explicit approval). Their
// factory branches throw a clear configuration error rather than silently
// falling back to the mock, so a misconfigured production deployment fails
// loudly instead of quietly sending nothing.

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
        "EMAIL_PROVIDER=smtp is not implemented yet. Select and configure a real provider " +
          "(spec decision 17.8) before setting this in a real environment.",
      );
    case "resend":
      throw new Error(
        "EMAIL_PROVIDER=resend is not implemented yet. Select and configure a real provider " +
          "(spec decision 17.8) before setting this in a real environment.",
      );
  }
}
