import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import betterTailwind from "eslint-plugin-better-tailwindcss";
import { getDefaultSelectors } from "eslint-plugin-better-tailwindcss/defaults";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

// Folders whose class names have been moved onto the design tokens. The
// Tailwind rules only run here, so files still on the legacy tokens are
// neither failed nor auto-fixed before their own restyle. The list grows a
// folder at a time and becomes `src/**` once nothing legacy is left.
const migrated = ["src/components/ui/**"];

export default defineConfig([
  globalIgnores(["dist", "src/api/types.ts"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    files: migrated,
    extends: [betterTailwind.configs["recommended-error"]],
    settings: {
      "better-tailwindcss": {
        entryPoint: "src/index.css",
        // The defaults already cover `cn`, `clsx`, `cva`, and `twMerge`; the
        // extra selector lints class strings held in `*Variants` and
        // `*ClassName` constants, which the defaults would skip.
        selectors: [
          ...getDefaultSelectors(),
          {
            kind: "variable",
            name: "(?:Variants|ClassName)$",
            match: [{ type: "strings" }],
          },
        ],
      },
    },
    rules: {
      // Prettier owns line length; the wrapping rule fights it.
      "better-tailwindcss/enforce-consistent-line-wrapping": "off",
    },
  },
]);
