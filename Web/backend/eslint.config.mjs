// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import noBroadcastEmit from './eslint-rules/no-broadcast-emit.mjs';

// A server-wide emit reaches every tenant (the typed rule is the main guard)
const BAN =
  'A server-wide emit reaches every tenant: emit to a tenant room (NotificationsGateway.emitToTenant / emitToUnit / emitToUser).';
const SENDER = '/^(emit|emitWithAck|send|write)$/';
const SERVER_NAME = '/^(io|nsp|namespace|server)$/';
const BROADCAST_MEMBER = '/^(sockets|local|volatile|broadcast)$/';
const BROADCAST_CALL = '/^(except|of|compress|timeout)$/';

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
      'prettier/prettier': ['error', { endOfLine: 'lf' }],
    },
  },
  {
    files: ['src/**/*.ts'],
    plugins: { mms: { rules: { 'no-broadcast-emit': noBroadcastEmit } } },
    rules: {
      // Typed: sending on any socket.io Server / Namespace / BroadcastOperator /
      // RemoteSocket, however it was reached or aliased
      'mms/no-broadcast-emit': 'error',
      // The same ban by spelling, for what the type checker cannot see (an `any`)
      'no-restricted-syntax': [
        'error',
        {
          selector: `CallExpression[callee.property.name=${SENDER}]:matches([callee.object.name=${SERVER_NAME}], [callee.object.property.name=${SERVER_NAME}], [callee.object.expression.name=${SERVER_NAME}], [callee.object.expression.property.name=${SERVER_NAME}])`,
          message: BAN,
        },
        {
          selector: `CallExpression[callee.property.value=${SENDER}]:matches([callee.object.name=${SERVER_NAME}], [callee.object.property.name=${SERVER_NAME}], [callee.object.expression.name=${SERVER_NAME}], [callee.object.expression.property.name=${SERVER_NAME}])`,
          message: BAN,
        },
        {
          selector: `CallExpression[callee.property.name=${SENDER}] > MemberExpression.callee MemberExpression[property.name=${BROADCAST_MEMBER}]`,
          message: BAN,
        },
        {
          selector: `CallExpression[callee.property.name=${SENDER}] > MemberExpression.callee CallExpression[callee.property.name=${BROADCAST_CALL}]`,
          message: BAN,
        },
        {
          selector: `VariableDeclarator[id.type='Identifier'][init.property.name=${SERVER_NAME}]`,
          message:
            'Do not alias the socket server: address a tenant room through NotificationsGateway.',
        },
      ],
    },
  },
  {
    // The gateway owns the socket server: there only `<server|client>.to(room).emit` may send
    files: ['src/notifications/notifications.gateway.ts'],
    rules: {
      'mms/no-broadcast-emit': ['error', { allowRoomScoped: true }],
    },
  },
);
