import { LoginForm } from "./LoginForm";

export const metadata = {
  title: "Sign in — ConsaPass",
};

export default function LoginPage() {
  return (
    <main className="auth-screen">
      <div className="auth-card">
        <div className="brandmark">
          <span className="brandmark__logo">CP</span>
          ConsaPass
        </div>
        <h1 style={{ marginTop: "1.5rem" }}>Sign in</h1>
        <p style={{ marginTop: 0 }}>Welcome back. Sign in to manage events and consent.</p>
        <LoginForm />
      </div>
    </main>
  );
}
