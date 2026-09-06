import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/data/**', '**/vitest.config.ts'],
  },
  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: { project: true },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowExpressions: true, allowHigherOrderFunctions: true },
      ],
      'no-console': 'error',
    },
  },
  {
    files: ['**/__tests__/**/*.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    // shelving/ and review/ never import learn/ — see RULES.md
    files: ['src/{shelving,review}/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/learn/*', '**/learn'],
              message: 'shelving/ and review/ must not import learn/ — see RULES.md',
            },
          ],
        },
      ],
    },
  },
);
