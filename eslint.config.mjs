import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Playwright writes its own artefacts here.
    "test-results/**",
    "playwright-report/**",
  ]),
  {
    /*
     * Playwright specs are Node code, not React. The `use` callback in a
     * fixture definition trips `react-hooks/rules-of-hooks`, which pattern
     * matches on the name alone — there is no hook here and no component to
     * violate. The React rules simply do not apply to this directory.
     */
    files: ["e2e/**/*.ts", "playwright.config.ts"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
      "react-hooks/exhaustive-deps": "off",
    },
  },
]);

export default eslintConfig;
