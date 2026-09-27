import { randomUUID } from "node:crypto";
import {
  EmailDeliveryError,
  type EmailMessage,
  type EmailProvider,
  type EmailSendResult,
} from "@/server/notifications/EmailProvider";

// In-memory mock email provider for development and tests. Records every sent
// message so tests can assert on delivery and content (e.g. that no child PII
// leaks into a subject/body). Can be told to fail the next N sends to exercise
// retry/failure handling.
export class MockEmailProvider implements EmailProvider {
  readonly sent: EmailMessage[] = [];
  private failuresRemaining = 0;

  // Make the next `count` send() calls throw an EmailDeliveryError.
  failNext(count = 1): void {
    this.failuresRemaining = count;
  }

  reset(): void {
    this.sent.length = 0;
    this.failuresRemaining = 0;
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new EmailDeliveryError("provider_error", "Simulated delivery failure.");
    }
    this.sent.push(message);
    return { providerMessageId: `mock-${randomUUID()}` };
  }
}
