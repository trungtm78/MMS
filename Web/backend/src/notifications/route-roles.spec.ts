// Every signed-in role has an inbox and may chat, UBND leaders included
import { ROLE_CODES } from '../common/constants/roles';
import { ROLES_KEY } from '../common/guards/roles.guard';
import { ChatController } from '../chat/chat.controller';
import { ChatMessagesController } from './chat-messages.controller';
import { NotificationsController } from './notifications.controller';

describe('notification and chat route roles', () => {
  it.each([
    ['NotificationsController', NotificationsController],
    ['ChatController', ChatController],
    ['ChatMessagesController', ChatMessagesController],
  ] as [string, object][])('%s is open to every role', (_name, controller) => {
    const roles = Reflect.getMetadata(ROLES_KEY, controller) as string[];

    expect([...roles].sort()).toEqual([...ROLE_CODES].sort());
  });
});
