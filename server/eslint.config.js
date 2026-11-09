// What the build cannot catch: a name that is not defined, a binding that
// is never used. Run with `npm run lint` (CI runs it on every push).
export default [
  { ignores: ['node_modules/**', 'uploads/**'] },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        console: 'readonly', process: 'readonly', Buffer: 'readonly', URL: 'readonly', URLSearchParams: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly', setImmediate: 'readonly',
        fetch: 'readonly', AbortSignal: 'readonly', AbortController: 'readonly', structuredClone: 'readonly', queueMicrotask: 'readonly',
        TextEncoder: 'readonly', TextDecoder: 'readonly', Intl: 'readonly', performance: 'readonly', crypto: 'readonly', globalThis: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'after-used', argsIgnorePattern: '^_|^next$', caughtErrors: 'none' }],
    },
  },
];
