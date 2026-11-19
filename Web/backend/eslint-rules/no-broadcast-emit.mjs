// A server-wide emit reaches every tenant. This rule forbids sending (emit, emitWithAck,
// send, write) on anything whose type is one of socket.io's broadcast-capable objects:
// Server, Namespace, BroadcastOperator, RemoteSocket (and the redis Emitter). Going by
// the type, not by the spelling, it also catches aliases (`const s = this.server`),
// `server.sockets`, `server.local`, `.volatile`, `.except(...)`, `socket.broadcast`,
// `server['emit']`, `server.emit.call(...)` and destructured `{ emit } = server`.
// A `Socket` is one client and may be emitted to anywhere.
//
// Option `allowRoomScoped`: in the one file that owns the socket server, `<Server|Socket>
// .to(...)` / `.in(...)` chains (a room named by the caller) may emit. Nothing else may.
import { ESLintUtils } from '@typescript-eslint/utils';

const SENDERS = new Set(['emit', 'emitWithAck', 'send', 'write']);
// Types that can reach more than one client
const BROADCAST_TYPES = new Set([
  'Server',
  'Namespace',
  'ParentNamespace',
  'BroadcastOperator',
  'RemoteSocket',
  'Emitter',
]);
const ROOM_SCOPED_ROOTS = new Set(['Server', 'Socket']);

/** The name a member is accessed by, or null when it is not a constant. */
function propertyNameOf(node) {
  if (!node.computed) return node.property.name ?? null;
  const { property } = node;
  if (property.type === 'Literal' && typeof property.value === 'string') {
    return property.value;
  }
  if (
    property.type === 'TemplateLiteral' &&
    property.expressions.length === 0
  ) {
    return property.quasis[0].value.cooked;
  }
  return null;
}

/** @type {import('eslint').Rule.RuleModule} */
export default ESLintUtils.RuleCreator.withoutDocs({
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: { allowRoomScoped: { type: 'boolean' } },
        additionalProperties: false,
      },
    ],
    messages: {
      broadcast:
        'Sending through a socket.io {{type}} can reach every tenant: emit to a tenant room (NotificationsGateway.emitToTenant / emitToUnit / emitToUser).',
      dynamic:
        'A computed call on a socket.io {{type}} hides what it sends: emit to a tenant room (NotificationsGateway).',
    },
    docs: { description: 'No server-wide socket.io emit.' },
  },
  defaultOptions: [{ allowRoomScoped: false }],
  create(context, [{ allowRoomScoped }]) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();

    const typeNamesOf = (type, seen = new Set()) => {
      if (seen.has(type)) return [];
      seen.add(type);
      if (type.isUnionOrIntersection()) {
        return type.types.flatMap((part) => typeNamesOf(part, seen));
      }
      const symbol = type.getSymbol() ?? type.aliasSymbol;
      const names = [];
      if (symbol) {
        const file = symbol.declarations?.[0]?.getSourceFile().fileName ?? '';
        if (/socket\.io/.test(file)) names.push(symbol.getName());
      }
      if (type.isClassOrInterface()) {
        for (const base of checker.getBaseTypes(type)) {
          names.push(...typeNamesOf(base, seen));
        }
      }
      return names;
    };
    const namesOfNode = (node) =>
      typeNamesOf(
        checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(node)),
      );
    const broadcastTypeOf = (node) =>
      namesOfNode(node).find((name) => BROADCAST_TYPES.has(name));

    // `<Server|Socket>.to(room).in(room)...`: every step names a room
    const isRoomScoped = (node) => {
      let current = node;
      let steps = 0;
      while (
        current.type === 'CallExpression' &&
        current.callee.type === 'MemberExpression' &&
        ['to', 'in'].includes(propertyNameOf(current.callee) ?? '')
      ) {
        current = current.callee.object;
        steps += 1;
      }
      if (steps === 0) return false;
      const names = namesOfNode(current);
      return (
        names.some((name) => ROOM_SCOPED_ROOTS.has(name)) &&
        !names.some((name) => name !== 'Server' && BROADCAST_TYPES.has(name))
      );
    };

    const check = (node, objectNode, name) => {
      const type = broadcastTypeOf(objectNode);
      if (!type) return;
      if (name !== null && !SENDERS.has(name)) return;
      if (allowRoomScoped && isRoomScoped(objectNode)) return;
      context.report({
        node,
        messageId: name === null ? 'dynamic' : 'broadcast',
        data: { type },
      });
    };

    return {
      MemberExpression(node) {
        const name = propertyNameOf(node);
        if (name === null) {
          // server[name](...): only a call hides what it sends
          const call = node.parent;
          if (call?.type === 'CallExpression' && call.callee === node) {
            check(node, node.object, null);
          }
          return;
        }
        check(node, node.object, name);
      },
      // const { emit } = server
      VariableDeclarator(node) {
        if (node.id.type !== 'ObjectPattern' || !node.init) return;
        for (const property of node.id.properties) {
          if (property.type !== 'Property') continue;
          const key = property.key;
          const name = property.computed
            ? key.type === 'Literal' && typeof key.value === 'string'
              ? key.value
              : null
            : key.name;
          if (name !== null && SENDERS.has(name))
            check(property, node.init, name);
        }
      },
    };
  },
});
