import {
  EmailDeliveryError,
  type EmailMessage,
  type EmailProvider,
  type EmailSendResult,
} from "@/server/notifications/EmailProvider";

// Real HTTP-based transactional provider (https://resend.com), selected per
// PILOT_READINESS.md recommendation: single HTTP call per send (no SMTP
// connection pooling to manage), an EU sending region for UK GDPR alignment,
// and a free tier (3,000 emails/month) that comfortably covers pilot volume.
//
// Uses `fetch` directly rather than the `resend` npm package — the API
// surface needed here is one POST request, so a dependency isn't justified.
// Swap in the official SDK later if webhook/attachment features are needed.
//
// Required configuration (see EmailProviderConfig.ts / .env.example):
//   RESEND_API_KEY   — secret API key, never committed (sync: false on Render).
//   EMAIL_FROM       — verified sending address, e.g. "ConsaPass <no-reply@consapass.co.uk>".
//                      Resend requires the domain to be verified (SPF/DKIM) first.

const RESEND_API_URL = "https://api.resend.com/emails";

export interface ResendEmailProviderConfig {
  apiKey: string;
  from: string;
  // Overridable for tests; defaults to the real Resend endpoint.
  apiUrl?: string;
}

interface ResendSuccessBody {
  id: string;
}

interface ResendErrorBody {
  message?: string;
  name?: string;
}

// Maps Resend's documented error responses to EmailDeliveryError codes that
// notificationService already knows how to treat as retryable vs terminal.
// See https://resend.com/docs/api-reference/errors.
function mapStatusToCode(status: number): string {
  if (status === 429) return "rate_limited";
  if (status >= 500) return "service_unavailable";
  if (status === 401 || status === 403) return "auth_error";
  if (status === 422 || status === 400) return "invalid_request";
  return "provider_error";
}

export class ResendEmailProvider implements EmailProvider {
  private readonly apiKey: string;
  private readonly from: string;
  private readonly apiUrl: string;

  constructor(config: ResendEmailProviderConfig) {
    if (!config.apiKey) {
      throw new Error("ResendEmailProvider requires a non-empty apiKey (RESEND_API_KEY).");
    }
    if (!config.from) {
      throw new Error("ResendEmailProvider requires a non-empty from address (EMAIL_FROM).");
    }
    this.apiKey = config.apiKey;
    this.from = config.from;
    this.apiUrl = config.apiUrl ?? RESEND_API_URL;
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    let response: Response;
    try {
      response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
      });
    } catch (cause) {
      // Network-level failure (DNS, timeout, connection reset) — retryable.
      throw new EmailDeliveryError("service_unavailable", "Failed to reach Resend API.");
    }

    if (!response.ok) {
      let body: ResendErrorBody = {};
      try {
        body = (await response.json()) as ResendErrorBody;
      } catch {
        // Non-JSON error body — fall through with the status-derived code.
      }
      throw new EmailDeliveryError(
        mapStatusToCode(response.status),
        body.message ?? `Resend API responded with status ${response.status}.`,
      );
    }

    const data = (await response.json()) as ResendSuccessBody;
    return { providerMessageId: data.id };
  }
}
