import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Core strict rules (default)
  {
    files: ["src/**/*.ts"],
    ignores: [
      "src/integration/**",
      "src/migrations/**",
      "src/sandbox/**",
      "src/scripts/**",
      "src/core/protocolTest.ts",
      "src/core/logger.ts",
    ],
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/explicit-function-return-type": "warn",
      "no-console": "error",
    },
  },

  // Allow console in test / tooling layers
  {
    files: [
      "src/integration/**",
      "src/migrations/**",
      "src/sandbox/**",
      "src/scripts/**",
      "src/core/protocolTest.ts",
    ],
    rules: {
      "no-console": "off",
    },
  },
];
