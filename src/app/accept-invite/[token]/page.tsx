import { prisma } from "@/server/db";
import { getInvitePreview } from "@/server/services/inviteAcceptanceService";
import { AppError } from "@/server/errors";
import { AcceptInviteForm } from "./AcceptInviteForm";

interface PageProps {
  params: Promise<{ token: string }>;
}

// Staff invite-acceptance page. Mirrors the parent consent page's design: a
// single opaque token in the URL is the sole source of identity, resolved
// entirely server-side. Any invalid/expired/already-used token renders the
// same safe, generic message (never a distinguishing error).
export default async function AcceptInvitePage({ params }: PageProps) {
  const { token } = await params;

  let preview;
  try {
    preview = await getInvitePreview(prisma, token);
  } catch (err) {
    if (err instanceof AppError) {
      return <InvalidInvite />;
    }
    throw err;
  }

  return (
    <main className="auth-screen">
      <div className="auth-card">
        <div className="brandmark">
          <span className="brandmark__logo">CP</span>
          ConsaPass
        </div>
        <h1 style={{ marginTop: "1.5rem" }}>Welcome to ConsaPass</h1>
        <p>
          {preview.staffName}, you have been invited to join <strong>{preview.schoolName}</strong>. Choose
          a password to activate your account.
        </p>
        <AcceptInviteForm token={token} />
      </div>
    </main>
  );
}

function InvalidInvite() {
  return (
    <main className="auth-screen">
      <div className="auth-card">
        <div className="brandmark">
          <span className="brandmark__logo">CP</span>
          ConsaPass
        </div>
        <h1 style={{ marginTop: "1.5rem" }}>This invite link is no longer valid</h1>
        <p>
          This link may have expired or already been used. Please ask your school administrator to send
          you a new invite.
        </p>
      </div>
    </main>
  );
}
