import { FlatCompat } from "@eslint/eslintrc";

// Migrated off deprecated `next lint` (removed in Next 16) to the ESLint CLI.
const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  { ignores: [".next/**", "next-env.d.ts"] },
];

export default eslintConfig;
