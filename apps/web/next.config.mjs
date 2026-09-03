const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];
const nextConfig = {
  transpilePackages: ["@crewmarket/ui", "@crewmarket/types", "@crewmarket/payments", "@crewmarket/db"],
  async headers() { return [{ source: "/(.*)", headers: securityHeaders }]; },
};
export default nextConfig;
