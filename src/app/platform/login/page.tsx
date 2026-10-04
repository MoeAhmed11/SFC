import { PlatformLoginForm } from "./PlatformLoginForm";

export const metadata = {
  title: "Platform sign in — ConsaPass",
};

export default function PlatformLoginPage() {
  return (
    <main className="auth-screen">
      <div className="auth-card">
        <div className="brandmark">
          <span className="brandmark__logo">CP</span>
          ConsaPass
        </div>
        <h1 style={{ marginTop: "1.5rem" }}>Platform sign in</h1>
        <p style={{ marginTop: 0 }}>Super-user access. Not for school staff — see /login instead.</p>
        <PlatformLoginForm />
      </div>
    </main>
  );
}
