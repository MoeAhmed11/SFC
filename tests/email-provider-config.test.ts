import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createEmailProvider, resolveEmailProviderKind } from "@/server/notifications/EmailProviderConfig";
import { MockEmailProvider } from "@/server/notifications/providers/mock";
import { ResendEmailProvider } from "@/server/notifications/providers/resend";
import { createEventDraft, publishEvent } from "@/server/services/eventService";
import { processDueNotifications } from "@/server/services/notificationService";
import { FakeHttpEmailProvider } from "./fixtures/fakeHttpEmailProvider";
import { createSchoolWithAdmin, createPupilWithPrimaryGuardian, futureEventDates, resetDb } from "./helpers";

describe("email provider configuration (spec decision 17.8)", () => {
  it("defaults to mock when EMAIL_PROVIDER is unset", () => {
    expect(resolveEmailProviderKind({})).toEqual("mock");
    expect(createEmailProvider({})).toBeInstanceOf(MockEmailProvider);
  });

  it("is case-insensitive and tolerant of surrounding whitespace", () => {
    expect(resolveEmailProviderKind({ EMAIL_PROVIDER: " MOCK " })).toEqual("mock");
  });

  it("rejects an unknown provider name rather than silently defaulting", () => {
    expect(() => resolveEmailProviderKind({ EMAIL_PROVIDER: "carrier-pigeon" })).toThrow(/Unknown EMAIL_PROVIDER/);
  });

  it("fails loudly for a provider that isn't implemented, instead of silently using the mock", () => {
    expect(() => createEmailProvider({ EMAIL_PROVIDER: "smtp" })).toThrow(/not implemented yet/);
  });

  it("fails loudly if resend is selected without required credentials", () => {
    expect(() => createEmailProvider({ EMAIL_PROVIDER: "resend" })).toThrow(/RESEND_API_KEY/);
    expect(() =>
      createEmailProvider({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_test_key" }),
    ).toThrow(/EMAIL_FROM/);
  });

  it("builds a ResendEmailProvider when fully configured", () => {
    const provider = createEmailProvider({
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "re_test_key",
      EMAIL_FROM: "ConsaPass <no-reply@example.com>",
    });
    expect(provider).toBeInstanceOf(ResendEmailProvider);
  });
});

// These tests run the REAL worker (processDueNotifications) against a second,
// more realistic EmailProvider implementation — not the trivial in-memory
// mock every other suite uses — to prove the abstraction generalises to
// something closer to a real HTTP-based transactional provider.
describe("notification worker against a provider configured as if it were real", () => {
  beforeEach(resetDb);

  async function publishedEventWithOneRecipient() {
    const { adminCtx, school } = await createSchoolWithAdmin();
    const { classId } = await createPupilWithPrimaryGuardian(adminCtx);
    const event = await createEventDraft(prisma, adminCtx, { title: "Trip", ...futureEventDates() });
    await publishEvent(prisma, adminCtx, event.id, { classGroupId: classId });
    return { school, eventId: event.id };
  }

  it("delivers through a provider with simulated network latency", async () => {
    await publishedEventWithOneRecipient();
    const provider = new FakeHttpEmailProvider({ latencyMs: 10 });

    const result = await processDueNotifications(prisma, provider, new Date());
    expect(result.sent).toBeGreaterThanOrEqual(1);
    expect(provider.sent.length).toBeGreaterThanOrEqual(1);
    expect(provider.sent[0]?.subject).toBeTruthy();
  });

  it("records a provider-specific failure code (rate_limited) as retryable", async () => {
    await publishedEventWithOneRecipient();
    const provider = new FakeHttpEmailProvider();
    provider.failNextWith("rate_limited");

    const result = await processDueNotifications(prisma, provider, new Date());
    expect(result.failed).toBeGreaterThanOrEqual(1);

    const failed = await prisma.notification.findFirst({ where: { status: "failed" } });
    expect(failed?.failureCode).toEqual("rate_limited");
    expect(failed?.attempts).toEqual(1);
  });

  it("a subsequent worker run can succeed once the simulated outage clears (retry)", async () => {
    await publishedEventWithOneRecipient();
    const provider = new FakeHttpEmailProvider();
    provider.failNextWith("service_unavailable");

    const first = await processDueNotifications(prisma, provider, new Date());
    expect(first.failed).toBeGreaterThanOrEqual(1);

    // No failure queued this time — the retry should succeed and the
    // already-attempted (failed) row transitions to sent, not duplicated.
    const second = await processDueNotifications(prisma, provider, new Date());
    expect(second.sent).toBeGreaterThanOrEqual(1);

    const sent = await prisma.notification.findMany({ where: { status: "sent" } });
    expect(sent.length).toBeGreaterThanOrEqual(1);
  });

  it("does not double-send when re-run against the realistic provider (idempotency holds across providers)", async () => {
    await publishedEventWithOneRecipient();
    const provider = new FakeHttpEmailProvider();

    const first = await processDueNotifications(prisma, provider, new Date());
    const sentAfterFirst = provider.sent.length;
    expect(first.sent).toBeGreaterThanOrEqual(1);

    const second = await processDueNotifications(prisma, provider, new Date());
    expect(second.sent).toEqual(0);
    expect(provider.sent.length).toEqual(sentAfterFirst);
  });
});
