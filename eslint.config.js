const typescriptEslintPlugin = require("@typescript-eslint/eslint-plugin");
const unusedImportsPlugin = require("eslint-plugin-unused-imports");
const parser = require("@typescript-eslint/parser");

module.exports = [
  {
    languageOptions: {
      parser,
    },
    plugins: {
      "@typescript-eslint": typescriptEslintPlugin,
      "unused-imports": unusedImportsPlugin,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "unused-imports/no-unused-imports": "error",
    },
  },
  {
    languageOptions: {
      parser: parser,
    },
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/explicit-module-boundary-types": "warn",
      "@typescript-eslint/no-unused-vars": "error",
    },
  },
];
