import Link from "next/link";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata = {
  title: "Forgot password — ConsaPass",
};

export default function ForgotPasswordPage() {
  return (
    <main className="auth-screen">
      <div className="auth-card">
        <div className="brandmark">
          <span className="brandmark__logo">CP</span>
          ConsaPass
        </div>
        <h1 style={{ marginTop: "1.5rem" }}>Forgot your password?</h1>
        <p style={{ marginTop: 0 }}>
          Enter the email address you use to sign in, and we&apos;ll send you a link to reset your
          password.
        </p>
        <ForgotPasswordForm />
        <p style={{ marginTop: "1.5rem" }}>
          <Link href="/login">Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}
