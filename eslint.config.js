// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'inspirations/**',
      'local/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
  // Plain browser scripts served as-is (e.g. theme-init.js).
  {
    files: ['apps/web/public/**/*.js'],
    languageOptions: { globals: { ...globals.browser }, sourceType: 'script' },
  },
  // Node scripts and config files.
  {
    files: ['**/*.{js,mjs,cjs}', '**/*.config.ts', 'scripts/**'],
    languageOptions: { globals: { ...globals.node } },
  },
  // Lower layers must not import the app.
  {
    files: ['packages/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@kt/web', '@kt/web/*'], message: 'Packages must not import the app.' },
          ],
        },
      ],
    },
  },
  // NFR-1: the domain core must not touch the DOM, browser APIs or UI/storage libraries.
  {
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'indexedDB'].map(
          (name) => ({ name, message: '@kt/core must stay free of browser APIs (NFR-1).' }),
        ),
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-*', 'dexie', '@kt/web', '@kt/grid-renderer', '@kt/importer'],
              message: '@kt/core must not depend on UI, storage or outer packages (NFR-1).',
            },
          ],
        },
      ],
    },
  },
  // React app.
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Security (NFR-5): never inject HTML strings.
      'no-restricted-properties': [
        'error',
        { property: 'innerHTML', message: 'Do not use innerHTML (NFR-5).' },
        { property: 'outerHTML', message: 'Do not use outerHTML (NFR-5).' },
      ],
    },
  },
  prettier,
);
