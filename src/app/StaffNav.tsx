"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/events", label: "Events" },
  { href: "/pupils", label: "Pupils" },
  { href: "/imports", label: "Import roster" },
  { href: "/staff", label: "Staff" },
  { href: "/audit", label: "Audit log" },
];

// Shared top navigation for all authenticated staff pages, so the app is
// coherently browsable between events, data import, and staff management.
export function StaffNav() {
  const pathname = usePathname();

  return (
    <header className="appbar">
      <div className="appbar__inner">
        <Link href="/events" className="brandmark" aria-label="ConsaPass home">
          <span className="brandmark__logo">CP</span>
          ConsaPass
        </Link>

        <nav className="appbar__nav" aria-label="Main navigation">
          {NAV_LINKS.map((link) => {
            // "/events" would otherwise also match nested routes like
            // "/events/[id]/dashboard" — treat exact match or a path
            // segment boundary as "current" so the state stays accurate.
            const isCurrent =
              pathname === link.href || pathname?.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className="navlink"
                aria-current={isCurrent ? "page" : undefined}
              >
                {link.label}
              </Link>
            );
          })}
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
