import Link from "next/link";

// Shared top navigation for platform (super-user) pages, mirroring
// src/app/StaffNav.tsx. Visually distinct in content only (no "Pupils" /
// "Events" links — platform users have no access to tenant data at all).
export function PlatformNav() {
  return (
    <header className="appbar">
      <div className="appbar__inner">
        <Link href="/platform" className="brandmark" aria-label="ConsaPass platform home">
          <span className="brandmark__logo">CP</span>
          ConsaPass — Platform
        </Link>

        <nav className="appbar__nav" aria-label="Platform navigation">
          <Link href="/platform" className="navlink">
            Schools
          </Link>
        </nav>

        <form action="/api/platform/auth/logout" method="post" className="appbar__spacer">
          <button type="submit" className="btn btn--ghost btn--sm">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
