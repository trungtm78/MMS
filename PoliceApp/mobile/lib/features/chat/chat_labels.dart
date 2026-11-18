import '../../l10n/app_localizations.dart';
import 'models/chat_models.dart';

/// The conversation's title. Untitled direct chats are named after the other person, untitled
/// groups after up to three members.
String conversationTitle(AppLocalizations l10n, Conversation conversation) {
  final title = conversation.title?.trim();
  if (title != null && title.isNotEmpty) return title;
  final names = conversation.participants.map((p) => p.displayName).toList();
  if (!conversation.isGroup) return names.isEmpty ? l10n.chatConversationUntitledDirect : names.first;
  if (names.isEmpty) return l10n.chatConversationUntitledGroup;
  if (names.length <= 3) return names.join(', ');
  return l10n.chatConversationGroupMembersMore(names.take(3).join(', '), names.length - 3);
}

String conversationTypeLabel(AppLocalizations l10n, Conversation conversation) =>
    conversation.isGroup ? l10n.chatConversationTypeGroup : l10n.chatConversationTypeDirect;

/// Who else is typing, or null when nobody is
String? typingIndicatorText(AppLocalizations l10n, List<String> names) => switch (names) {
      [] => null,
      [final only] => l10n.chatScreenTypingOne(only),
      [final first, final second] => l10n.chatScreenTypingTwo(first, second),
      [final first, final second, ...] => l10n.chatScreenTypingMany(first, second, names.length - 2),
    };
