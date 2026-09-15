const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];
import path from "node:path";

const nextConfig = {
  // Monorepo: trace server files from the repo root so the hoisted Prisma query
  // engine (node_modules/.pnpm/.../.prisma) is bundled into serverless functions.
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  // Prisma loads its engine via a runtime path static tracing can't see, so force-
  // include the .node engine into EVERY server route's bundle (pages + API), not
  // just /api. The pnpm-hoisted location is under the repo-root .pnpm store.
  outputFileTracingIncludes: {
    "/**": ["../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/*.node"],
  },
  transpilePackages: ["@crewmarket/ui", "@crewmarket/types", "@crewmarket/payments", "@crewmarket/db"],
  async headers() { return [{ source: "/(.*)", headers: securityHeaders }]; },
};
export default nextConfig;
