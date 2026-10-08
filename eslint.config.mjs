import { defineConfig, globalIgnores } from "eslint/config";
import javascript from "@eslint/js";
import typescript from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import accessibility from "eslint-plugin-jsx-a11y";
import globals from "globals";

export default defineConfig([
  globalIgnores([".next/**", "node_modules/**", "playwright-report/**", "test-results/**", "next-env.d.ts"]),
  javascript.configs.recommended,
  ...typescript.configs.recommended,
  { files: ["**/*.{ts,tsx,mjs}"], languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  { files: ["src/**/*.{ts,tsx}"], ...reactHooks.configs.flat.recommended },
  { files: ["src/**/*.tsx"], ...accessibility.flatConfigs.recommended },
  { files: ["src/**/*.{ts,tsx}"], rules: { "@typescript-eslint/no-explicit-any": "error" } },
  // Regiões roláveis identificadas precisam receber foco para uso pelo teclado.
  { files: ["src/**/*.tsx"], rules: { "jsx-a11y/no-noninteractive-tabindex": ["error", { roles: ["region"] }] } }
]);
