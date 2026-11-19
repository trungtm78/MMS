// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.property.name='emit'][callee.object.type='MemberExpression'][callee.object.property.name='server']",
          message:
            'A server-wide emit reaches every tenant: emit to a tenant room (NotificationsGateway.emitToTenant / emitToRooms).',
        },
        {
          selector:
            "CallExpression[callee.property.name='emit'][callee.object.type='Identifier'][callee.object.name='server']",
          message:
            'A server-wide emit reaches every tenant: emit to a tenant room (NotificationsGateway.emitToTenant / emitToRooms).',
        },
      ],
    },
  },
);
