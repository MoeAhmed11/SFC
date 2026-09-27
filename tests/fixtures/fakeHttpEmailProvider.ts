import { EmailDeliveryError, type EmailMessage, type EmailProvider, type EmailSendResult } from "@/server/notifications/EmailProvider";

// A SECOND EmailProvider implementation used only in tests, standing in for a
// real HTTP-based transactional provider (e.g. Resend/Postmark/SES) — as
// distinct from MockEmailProvider as reasonably possible while staying
// deterministic and network-free. This exists specifically to prove the
// EmailProvider abstraction actually holds for more than one implementation
// (spec decision 17.8: "implement testing as if a real provider were
// configured"), not just the trivial in-memory mock everything else uses.
//
// Differences from MockEmailProvider, deliberately:
//  - simulates network latency (a small artificial delay per send);
//  - returns provider-shaped message ids (a vendor-style prefix + id);
//  - distinguishes failure modes with realistic HTTP-style error codes
//    (rate_limited, invalid_recipient, service_unavailable) instead of one
//    generic "provider_error";
//  - enforces a naive per-instance rate limit, so tests can exercise a
//    provider that can throttle mid-run, not just "always succeeds" or
//    "always fails".
export class FakeHttpEmailProvider implements EmailProvider {
  readonly sent: EmailMessage[] = [];
  readonly attempted: EmailMessage[] = [];

  private nextFailureCode: string | null = null;
  private rateLimitAfter: number | null = null;
  private readonly latencyMs: number;

  constructor(options: { latencyMs?: number } = {}) {
    this.latencyMs = options.latencyMs ?? 5;
  }

  // Simulates the vendor returning a 429 after N successful sends.
  rateLimitAfterSends(count: number): void {
    this.rateLimitAfter = count;
  }

  failNextWith(code: "invalid_recipient" | "service_unavailable" | "rate_limited"): void {
    this.nextFailureCode = code;
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    this.attempted.push(message);
    await delay(this.latencyMs);

    if (this.nextFailureCode) {
      const code = this.nextFailureCode;
      this.nextFailureCode = null;
      throw new EmailDeliveryError(code, `Simulated ${code} from fake HTTP provider.`);
    }

    if (this.rateLimitAfter !== null && this.sent.length >= this.rateLimitAfter) {
      throw new EmailDeliveryError("rate_limited", "Simulated 429 from fake HTTP provider.");
    }

    if (!isPlausibleEmail(message.to)) {
      throw new EmailDeliveryError("invalid_recipient", "Simulated invalid-recipient rejection.");
    }

    this.sent.push(message);
    return { providerMessageId: `fakehttp_${this.sent.length}_${Date.now()}` };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPlausibleEmail(value: string): boolean {
  return /.+@.+\..+/.test(value);
}
