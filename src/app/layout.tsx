import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "SchoolConnect",
  description: "School consent & event reminder platform (MVP).",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
