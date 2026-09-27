/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Do not leak sensitive data via referrer on tokenised parent pages (added
  // in a later phase); set a safe default here.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }],
      },
    ];
  },
};

export default nextConfig;
