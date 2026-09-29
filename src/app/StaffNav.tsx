import Link from "next/link";

// Shared top navigation for all authenticated staff pages, so the app is
// coherently browsable between events, data import, and staff management.
export function StaffNav() {
  return (
    <header className="appbar">
      <div className="appbar__inner">
        <Link href="/events" className="brandmark" aria-label="ConsaPass home">
          <span className="brandmark__logo">CP</span>
          ConsaPass
        </Link>

        <nav className="appbar__nav" aria-label="Main navigation">
          <Link href="/events" className="navlink">
            Events
          </Link>
          <Link href="/pupils" className="navlink">
            Pupils
          </Link>
          <Link href="/imports" className="navlink">
            Import roster
          </Link>
          <Link href="/staff" className="navlink">
            Staff
          </Link>
          <Link href="/audit" className="navlink">
            Audit log
          </Link>
        </nav>

        <form action="/api/auth/logout" method="post" className="appbar__spacer">
          <button type="submit" className="btn btn--ghost btn--sm">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
