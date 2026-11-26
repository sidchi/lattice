import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { FlatCompat } from "@eslint/eslintrc";
import prettier from "eslint-config-prettier/flat";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const eslintConfig = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "coverage/**",
      "next-env.d.ts",
      "src/generated/**",
      "e2e/.state/**",
      "e2e/.results/**",
      "e2e/.report/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // Playwright fixtures call a parameter named `use`, which is not React's `use` hook.
    files: ["e2e/**/*.ts", "playwright.config.ts"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
  // Must stay last: turns off stylistic rules that Prettier owns.
  prettier,
];

export default eslintConfig;
