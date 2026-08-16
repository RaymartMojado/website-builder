import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Two of these rules exist to make security discipline mechanical rather than
 * aspirational. Both encode a mistake that is easy to make, invisible in review,
 * and expensive in production.
 */
const TENANT_MODELS = "site|page|symbol|asset|pageVersion";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/generated/**", // Prisma output
    "supabase/**",
  ]),

  {
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          // OWASP A01. findUnique on a tenant-owned model looks up by id alone,
          // which cannot express "and the caller owns it". Use the guards in
          // lib/auth/guards.ts, which are built on ownership-scoped findFirst.
          selector: `CallExpression[callee.object.object.name='db'][callee.object.property.name=/^(${TENANT_MODELS})$/][callee.property.name=/^findUnique(OrThrow)?$/]`,
          message:
            "Tenant-owned records must be loaded through lib/auth/guards.ts (requireSite/requirePage/requireSymbol/requireAsset). findUnique cannot express ownership — this is how IDOR bugs ship.",
        },
        {
          // supabase.auth.getSession() reads and trusts the cookie without
          // verifying it against the auth server. On the server that means a
          // forged cookie passes. getUser() verifies.
          selector:
            "CallExpression[callee.property.name='getSession'][callee.object.property.name='auth']",
          message:
            "Use supabase.auth.getUser() on the server. getSession() trusts the cookie without verifying it against the auth server.",
        },
      ],
    },
  },

  {
    // The guards are the intended home for direct tenant queries.
    files: ["src/lib/auth/guards.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
]);

export default eslintConfig;
