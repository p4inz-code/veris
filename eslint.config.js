// @ts-check
const eslint = require('@typescript-eslint/eslint-plugin');
const parser = require('@typescript-eslint/parser');
const prettier = require('eslint-config-prettier');
const importPlugin = require('eslint-plugin-import');

module.exports = [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.js', '**/*.json', '**/*.d.ts'],
  },
  {
    files: ['packages/*/src/**/*.ts', 'packages/*/src/**/*.tsx'],
    languageOptions: {
      parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: ['./tsconfig.base.json', './packages/*/tsconfig.json'],
      },
    },
    plugins: {
      '@typescript-eslint': eslint,
      import: importPlugin,
    },
    rules: {
      ...eslint.configs.recommended.rules,
      ...eslint.configs.strict.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/prefer-readonly': 'warn',
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          alphabetize: { order: 'asc' },
          'newlines-between': 'always',
        },
      ],
      'no-console': 'warn',
      eqeqeq: ['warn', 'always'],
      curly: ['error', 'all'],
      'no-throw-literal': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  prettier,
];
