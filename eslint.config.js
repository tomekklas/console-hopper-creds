// ESLint flat config (ESLint 9+).
import js from "@eslint/js";
import globals from "globals";
import prettier from "eslint-config-prettier";

export default [
  { ignores: ["dist/**", "node_modules/**", "*.zip"] },
  js.configs.recommended,
  {
    // Extension code: ES modules bundled by esbuild. Runs with browser +
    // webextension globals.
    files: ["src/**/*.js", "background.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.webextensions },
    },
    rules: {
      "no-unused-vars": ["warn", { caughtErrors: "none" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["test/**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    files: ["scripts/**/*.{js,mjs}", "*.config.{js,mjs}"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: { ...globals.node } },
  },
  {
    // Store screenshot staging: a classic script injected into the picker
    // page by shoot.sh, never shipped.
    files: ["store-assets/**/*.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "script", globals: { ...globals.browser } },
    rules: { "no-unused-vars": ["error", { caughtErrors: "none" }] },
  },
  prettier,
];
