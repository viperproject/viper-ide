import typescriptEslint from "@typescript-eslint/eslint-plugin";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default [{
    ignores: ["**/webpack.config.js"],
}, ...compat.extends("eslint:recommended", "plugin:@typescript-eslint/recommended"), {
    plugins: {
        "@typescript-eslint": typescriptEslint,
    },

    languageOptions: {
        globals: {
            ...globals.browser,
        },

        parser: tsParser,
        ecmaVersion: 12,
        sourceType: "module",

        parserOptions: {
            project: "./tsconfig.json",
        },
    },

    rules: {
        "@typescript-eslint/no-require-imports": ["error"],

        "@typescript-eslint/explicit-function-return-type": ["error", {
            allowExpressions: true,
        }],

        "@typescript-eslint/no-misused-promises": ["error"],
        "@typescript-eslint/no-floating-promises": ["error"],

        "@typescript-eslint/no-empty-function": ["warn", {
            allow: ["arrowFunctions"],
        }],

        "@typescript-eslint/no-inferrable-types": ["error", {
            ignoreParameters: true,
            ignoreProperties: true,
        }],

        "no-inner-declarations": "off",
        "no-unused-vars": "off",

        "@typescript-eslint/no-unused-vars": ["warn", {
            argsIgnorePattern: "_",
            varsIgnorePattern: "_",
            caughtErrorsIgnorePattern: "_",
        }],
    },
}];