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
    // Scratch state written by the Supabase CLI while the local stack runs.
    // It contains bundled vendor JavaScript, so linting it reports a hundred
    // failures in code nobody here wrote.
    "supabase/.temp/**",
    "supabase/.branches/**",
    // Spike workspaces are separate projects with their own toolchains; they
    // are linted, built and run on their own terms, not by the app's config.
    "spikes/**",
    "local-first/**",
  ]),
  {
    rules: {
      // Server actions must accept the useActionState signature even when they
      // ignore the previous state or the form body. A leading underscore is how
      // that is declared deliberately rather than left as an oversight.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
]);

export default eslintConfig;
