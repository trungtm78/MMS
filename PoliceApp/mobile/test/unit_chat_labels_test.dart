// Unit Tests: chat texts built from data (conversation titles, typing indicator)
// Run: flutter test test/unit_chat_labels_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/features/chat/chat_labels.dart';
import 'package:police_app/features/chat/models/chat_models.dart';

import 'helpers/l10n.dart';

Conversation _conversation({String? title, String type = 'direct', List<String> names = const []}) => Conversation(
      id: 'c1',
      title: title,
      conversationType: type,
      createdAt: '2026-09-14T01:00:00.000Z',
      participants: [
        for (var i = 0; i < names.length; i++) ChatParticipant(id: 'u$i', fullName: names[i]),
      ],
    );

void main() {
  test('UT-CHAT-LABEL-01: untitled direct chats are named after the other participant', () {
    expect(conversationTitle(viL10n, _conversation(names: ['An'])), 'An');
    expect(conversationTitle(viL10n, _conversation()), viL10n.chatConversationUntitledDirect);
  });

  test('UT-CHAT-LABEL-02: titles win; untitled groups list up to three members', () {
    expect(conversationTitle(viL10n, _conversation(title: ' Patrol ', names: ['An'])), 'Patrol');
    expect(conversationTitle(viL10n, _conversation(type: 'group', names: ['An', 'Binh'])), 'An, Binh');
    expect(conversationTitle(viL10n, _conversation(type: 'group', names: ['An', 'Binh', 'Cuong', 'Dung'])),
        viL10n.chatConversationGroupMembersMore('An, Binh, Cuong', 1));
    expect(conversationTitle(viL10n, _conversation(type: 'group')), viL10n.chatConversationUntitledGroup);
  });

  test('UT-CHAT-LABEL-03: conversation type', () {
    expect(conversationTypeLabel(viL10n, _conversation(type: 'group')), viL10n.chatConversationTypeGroup);
    expect(conversationTypeLabel(viL10n, _conversation()), viL10n.chatConversationTypeDirect);
  });

  test('UT-CHAT-LABEL-04: who is typing', () {
    expect(typingIndicatorText(viL10n, []), isNull);
    expect(typingIndicatorText(viL10n, ['An']), viL10n.chatScreenTypingOne('An'));
    expect(typingIndicatorText(viL10n, ['An', 'Binh']), viL10n.chatScreenTypingTwo('An', 'Binh'));
    expect(typingIndicatorText(viL10n, ['An', 'Binh', 'Chi', 'Dung']), viL10n.chatScreenTypingMany('An', 'Binh', 2));
  });
}
