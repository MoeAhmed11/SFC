import { afterEach, describe, expect, it, vi } from "vitest";
import { sendStaffInviteEmail } from "@/server/services/staffInviteEmailService";

// Unit tests for the synchronous staff-invite email send path (distinct from
// processDueNotifications, which only handles queued parent Notification
// rows). EMAIL_PROVIDER defaults to "mock" in this environment (see
// .env.example), so these exercise the real factory wiring end-to-end without
// any network calls, plus the graceful-failure contract the API/action
// callers depend on (never throw; report sent: false instead).

const originalFetch = global.fetch;
const originalEmailProvider = process.env.EMAIL_PROVIDER;

describe("sendStaffInviteEmail", () => {
  afterEach(() => {
    global.fetch = originalFetch;
    process.env.EMAIL_PROVIDER = originalEmailProvider;
  });

  it("reports sent: true against the default mock provider", async () => {
    process.env.EMAIL_PROVIDER = "mock";
    const result = await sendStaffInviteEmail({
      to: "new.staff@example.test",
      schoolName: "Greenfield Primary",
      schoolTimezone: "Europe/London",
      inviteUrl: "https://consapass.co.uk/accept-invite/abc123",
      expiresAt: new Date("2026-10-05T12:00:00Z"),
    });
    expect(result).toEqual({ sent: true });
  });

  it("sends through Resend when configured, with no pupil data in the message", async () => {
    process.env.EMAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "ConsaPass <no-reply@example.com>";

    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: "resend-invite-1" }), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await sendStaffInviteEmail({
      to: "new.staff@example.test",
      schoolName: "Greenfield Primary",
      schoolTimezone: "Europe/London",
      inviteUrl: "https://consapass.co.uk/accept-invite/abc123",
      expiresAt: new Date("2026-10-05T12:00:00Z"),
    });

    expect(result).toEqual({ sent: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.to).toEqual(["new.staff@example.test"]);
    expect(body.subject).toContain("Greenfield Primary");
    expect(body.text).toContain("https://consapass.co.uk/accept-invite/abc123");

    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
  });

  it("returns sent: false instead of throwing when the provider fails", async () => {
    process.env.EMAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "ConsaPass <no-reply@example.com>";

    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ message: "oops" }), { status: 500 })) as unknown as typeof fetch;

    const result = await sendStaffInviteEmail({
      to: "new.staff@example.test",
      schoolName: "Greenfield Primary",
      schoolTimezone: "Europe/London",
      inviteUrl: "https://consapass.co.uk/accept-invite/abc123",
      expiresAt: new Date("2026-10-05T12:00:00Z"),
    });

    expect(result.sent).toEqual(false);
    expect(result.error).toBeTruthy();

    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
  });

  it("returns sent: false instead of throwing when misconfigured (missing credentials)", async () => {
    process.env.EMAIL_PROVIDER = "resend";
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;

    const result = await sendStaffInviteEmail({
      to: "new.staff@example.test",
      schoolName: "Greenfield Primary",
      schoolTimezone: "Europe/London",
      inviteUrl: "https://consapass.co.uk/accept-invite/abc123",
      expiresAt: new Date("2026-10-05T12:00:00Z"),
    });

    expect(result.sent).toEqual(false);
    expect(result.error).toMatch(/RESEND_API_KEY/);
  });
});
