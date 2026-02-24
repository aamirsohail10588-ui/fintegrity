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
      "@typescript-eslint/explicit-function-return-type": "error",
      "no-console": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
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
      "src/integration/systemTest.ts",
      "src/signer/**",
    ],
    rules: {
      "no-console": "off",
    },
  },
];
