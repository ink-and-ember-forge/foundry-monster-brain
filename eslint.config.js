export default [
  {
    files: ["scripts/**/*.mjs", "tests/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { window: "readonly", document: "readonly", game: "readonly", canvas: "readonly", Hooks: "readonly", ui: "readonly", foundry: "readonly", console: "readonly" }
    },
    rules: {}
  }
];
