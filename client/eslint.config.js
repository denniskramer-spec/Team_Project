// What the build cannot catch: a name that is not defined, a binding that
// is never used. Run with `npm run lint` (CI runs it on every push).
export default [
  { ignores: ['node_modules/**', 'dist/**'] },
  {
    files: ['**/*.js', '**/*.jsx', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        console: 'readonly', process: 'readonly', URL: 'readonly', URLSearchParams: 'readonly', fetch: 'readonly', FormData: 'readonly', Blob: 'readonly', File: 'readonly', FileReader: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly', requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly', queueMicrotask: 'readonly', structuredClone: 'readonly',
        window: 'readonly', document: 'readonly', navigator: 'readonly', location: 'readonly', history: 'readonly', localStorage: 'readonly', sessionStorage: 'readonly', getComputedStyle: 'readonly', matchMedia: 'readonly', alert: 'readonly', confirm: 'readonly',
        Notification: 'readonly', Audio: 'readonly', AudioContext: 'readonly', Image: 'readonly', Element: 'readonly', HTMLElement: 'readonly', HTMLInputElement: 'readonly', HTMLTextAreaElement: 'readonly', Node: 'readonly', Range: 'readonly', Selection: 'readonly',
        MutationObserver: 'readonly', ResizeObserver: 'readonly', IntersectionObserver: 'readonly', DataTransfer: 'readonly', ClipboardItem: 'readonly', WebSocket: 'readonly', CustomEvent: 'readonly', Event: 'readonly', KeyboardEvent: 'readonly', MouseEvent: 'readonly',
        AbortController: 'readonly', AbortSignal: 'readonly', Intl: 'readonly', performance: 'readonly', crypto: 'readonly', atob: 'readonly', btoa: 'readonly', TextEncoder: 'readonly', TextDecoder: 'readonly', globalThis: 'readonly',
        __APP_VERSION__: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'after-used', argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
];
