import js from "@eslint/js";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "apps/**/.next/**",
      "apps/**/dist/**",
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "generated/**"
    ]
  },
  js.configs.recommended,
  {
    settings: {
      next: {
        rootDir: "apps/web/"
      }
    }
  },
  ...nextCoreWebVitals,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    settings: {
      react: {
        version: "detect"
      }
    },
    plugins: {
      react,
      "react-hooks": reactHooks
    },
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "@typescript-eslint/consistent-type-imports": ["warn", { prefer: "type-imports" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ],
      "@next/next/no-html-link-for-pages": "off",
      "import/no-cycle": ["warn", { maxDepth: 1 }],
      "react-hooks/set-state-in-effect": "warn",
      "react/react-in-jsx-scope": "off"
    }
  }
);
