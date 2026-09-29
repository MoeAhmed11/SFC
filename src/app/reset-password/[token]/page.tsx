import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata = {
  title: "Reset password — ConsaPass",
};

interface PageProps {
  params: Promise<{ token: string }>;
}

// Deliberately generic — unlike accept-invite/[token]/page.tsx, this page does
// NOT preview whose account is being reset (no name/email/school shown before
// submission). A reset link is reachable by self-serve request as well as by
// an admin acting on someone else's behalf, so revealing identity here would
// be an unnecessary exposure; the token itself is validated entirely
// server-side inside resetPassword when the form is submitted, and any
// invalid/expired/used token surfaces the same generic error there.
export default async function ResetPasswordPage({ params }: PageProps) {
  const { token } = await params;

  return (
    <main className="auth-screen">
      <div className="auth-card">
        <div className="brandmark">
          <span className="brandmark__logo">CP</span>
          ConsaPass
        </div>
        <h1 style={{ marginTop: "1.5rem" }}>Set a new password</h1>
        <p style={{ marginTop: 0 }}>Choose a new password for your ConsaPass account.</p>
        <ResetPasswordForm token={token} />
      </div>
    </main>
  );
}
