import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Data-fetching effects routinely set state after awaits; the rule's
      // static analysis false-positives on the standard pattern used here.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["scripts/**/*.js"],
    rules: {
      // Standalone Node scripts are CommonJS — require() is correct there.
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "electron/dist/**",
    "next-env.d.ts",
    "android/**",
    "ios/**",
  ]),
]);

export default eslintConfig;
