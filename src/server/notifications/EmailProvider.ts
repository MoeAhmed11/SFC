// Provider-agnostic email interface (Section 17.8 is open; no real provider is
// wired without approval, Section 18.3). All sending goes through this so the
// provider is swappable and development/tests run against a mock.
//
// Selecting which implementation to use is a CONFIGURATION concern, not a code
// change — see EmailProviderConfig.ts. This keeps the choice of provider/domain
// (spec decision 17.8) open until a real vendor is selected, without blocking
// development or tests, which exercise the full send path through this same
// interface either way.

export interface EmailMessage {
  to: string;
  subject: string;
  // Plain-text body. Templates keep bodies accessible and free of child PII.
  text: string;
}

export interface EmailSendResult {
  providerMessageId: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<EmailSendResult>;
}

export class EmailDeliveryError extends Error {
  readonly code: string;
  constructor(code = "provider_error", message = "Email delivery failed.") {
    super(message);
    this.name = "EmailDeliveryError";
    this.code = code;
  }
}
