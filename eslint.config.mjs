import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

const typedPackageProjects = [
  "./packages/core/tsconfig.json",
  "./packages/firebase/tsconfig.json",
  "./packages/http/tsconfig.json",
  "./packages/react/tsconfig.json",
  "./packages/vue/tsconfig.json",
  "./packages/vanilla/tsconfig.json",
  "./examples/goblin-tavern/tsconfig.json"
];

export default [
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**"]
  },
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: typedPackageProjects,
        tsconfigRootDir: import.meta.dirname
      }
    },
    plugins: {
      "@typescript-eslint": tseslint
    },
    rules: {
      ...tseslint.configs.strict.rules,
      ...tseslint.configs.stylistic.rules,
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error"
    }
  },
  {
    files: ["examples/goblin-tavern/src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        document: "readonly"
      }
    }
  },
  {
    files: ["examples/goblin-tavern/vite.config.ts"],
    languageOptions: {
      globals: {
        process: "readonly"
      }
    }
  }
];
