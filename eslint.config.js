import eslintPluginUnicorn from "eslint-plugin-unicorn";
import tseslint from "typescript-eslint";

export default [
    {
        ignores: ["dist/**", "node_modules/**", ".yarn/**"],
    },
    ...tseslint.configs.recommended,
    eslintPluginUnicorn.configs.recommended,
];
