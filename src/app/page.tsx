import Link from "next/link";

// Landing page. The staff app and parent consent flows live behind auth / opaque
// tokens; this page is the public front door and points staff to sign in.
export default function HomePage() {
  return (
    <main className="auth-screen">
      <div className="auth-card" style={{ textAlign: "center" }}>
        <div className="brandmark" style={{ justifyContent: "center", fontSize: "1.35rem" }}>
          <span className="brandmark__logo">CP</span>
          ConsaPass
        </div>

        <h1 style={{ marginTop: "1.5rem" }}>Consent and reminders, sorted.</h1>
        <p className="lead">
          A calmer way for schools to request activity consent, chase outstanding replies, and keep
          parents in the loop — without the paper slips.
        </p>

        <div className="toolbar" style={{ justifyContent: "center", marginTop: "1.5rem" }}>
          <Link href="/login" className="btn btn--primary">
            Staff sign in
          </Link>
          <Link href="/events" className="btn btn--secondary">
            Go to events
          </Link>
        </div>

        <p className="muted" style={{ fontSize: "0.85rem", marginTop: "1.75rem" }}>
          Parents don&apos;t need an account — you&apos;ll receive a secure link when a response is needed.
        </p>
      </div>
    </main>
  );
}
