/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const rawBackendUrl = process.env.BACKEND_INTERNAL_URL || "http://127.0.0.1:8000";
    const backendUrl = (rawBackendUrl.startsWith("http://") || rawBackendUrl.startsWith("https://"))
      ? rawBackendUrl.replace(/\/$/, "")
      : `http://${rawBackendUrl.replace(/\/$/, "")}`;
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendUrl}/api/v1/:path*`,
      },
      {
        source: "/storage/:path*",
        destination: `${backendUrl}/storage/:path*`,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
      },
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
    ],
  },
};

module.exports = nextConfig;
