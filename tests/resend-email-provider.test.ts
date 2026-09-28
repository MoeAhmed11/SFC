import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmailDeliveryError } from "@/server/notifications/EmailProvider";
import { ResendEmailProvider } from "@/server/notifications/providers/resend";

// Unit tests for the Resend adapter itself, isolated from the notification
// worker (tests/email-provider-config.test.ts covers factory wiring, and
// tests/notifications.test.ts / hardening.test.ts exercise the worker against
// the mock + FakeHttpEmailProvider). No real network calls are made — `fetch`
// is stubbed per test.

const originalFetch = global.fetch;

describe("ResendEmailProvider", () => {
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("rejects construction without an api key", () => {
    expect(() => new ResendEmailProvider({ apiKey: "", from: "a@example.com" })).toThrow(/apiKey/);
  });

  it("rejects construction without a from address", () => {
    expect(() => new ResendEmailProvider({ apiKey: "re_test", from: "" })).toThrow(/from/);
  });

  it("sends a message and returns the provider message id on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "resend-abc123" }), { status: 200 }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new ResendEmailProvider({ apiKey: "re_test", from: "ConsaPass <no-reply@example.com>" });
    const result = await provider.send({ to: "parent@example.com", subject: "Hello", text: "Body" });

    expect(result).toEqual({ providerMessageId: "resend-abc123" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toEqual("https://api.resend.com/emails");
    expect(init.method).toEqual("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      from: "ConsaPass <no-reply@example.com>",
      to: ["parent@example.com"],
      subject: "Hello",
      text: "Body",
    });
  });

  it("maps a 429 response to a retryable rate_limited EmailDeliveryError", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ message: "Too many requests" }), { status: 429 })) as unknown as typeof fetch;

    const provider = new ResendEmailProvider({ apiKey: "re_test", from: "a@example.com" });

    await expect(provider.send({ to: "x@example.com", subject: "s", text: "t" })).rejects.toMatchObject({
      code: "rate_limited",
    } satisfies Partial<EmailDeliveryError>);
  });

  it("maps a 500 response to service_unavailable", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ message: "oops" }), { status: 500 })) as unknown as typeof fetch;

    const provider = new ResendEmailProvider({ apiKey: "re_test", from: "a@example.com" });

    await expect(provider.send({ to: "x@example.com", subject: "s", text: "t" })).rejects.toMatchObject({
      code: "service_unavailable",
    });
  });

  it("maps a 401 response to auth_error", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ message: "invalid key" }), { status: 401 })) as unknown as typeof fetch;

    const provider = new ResendEmailProvider({ apiKey: "re_test", from: "a@example.com" });

    await expect(provider.send({ to: "x@example.com", subject: "s", text: "t" })).rejects.toMatchObject({
      code: "auth_error",
    });
  });

  it("maps a network-level failure to service_unavailable", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNRESET")) as unknown as typeof fetch;

    const provider = new ResendEmailProvider({ apiKey: "re_test", from: "a@example.com" });

    await expect(provider.send({ to: "x@example.com", subject: "s", text: "t" })).rejects.toMatchObject({
      code: "service_unavailable",
    });
  });
});
