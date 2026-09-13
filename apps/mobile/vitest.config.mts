import { defineConfig } from "vitest/config";

// Pure-logic tests only (lib/): no RN runtime, no jest-expo. Component
// behavior stays on the device-verification path (HANDOFF).
export default defineConfig({
  test: { environment: "node", include: ["lib/**/*.test.ts"] },
});
