import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/**",
      "coverage/**",
      "public/**",
      "PDF Generation/**",
      "mailService/views/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": "off",
    },
  },
  {
    files: ["__tests__/**/*.js"],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
    },
  },
];
