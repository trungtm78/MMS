// Chat wording: conversation titles and local chat refusals. Backend error codes go through the one
// error table (lib/l10n/error_texts.dart).

import '../../l10n/app_localizations.dart';
import '../../l10n/error_texts.dart';
import 'models/conversation.dart';
import 'repositories/chat_repository.dart';

/// Group members named in an untitled group's title before the rest are counted
const _shownGroupMembers = 3;

/// The title shown for [conversation]: its own title; otherwise the other person of a direct chat,
/// or up to three member names of a group and how many more; otherwise a label for its type.
String conversationTitle(AppLocalizations l10n, Conversation conversation) {
  final own = conversation.ownTitle;
  if (own != null) return own;
  final names = conversation.participantNames;
  if (!conversation.isGroup) return names.isNotEmpty ? names.first : l10n.chatConversationUntitledDirect;
  if (names.isEmpty) return l10n.chatConversationUntitledGroup;
  final shown = names.take(_shownGroupMembers).join(', ');
  final more = names.length - _shownGroupMembers;
  return more > 0 ? l10n.chatConversationGroupMembersMore(shown, more) : shown;
}

String chatIssueText(AppLocalizations l10n, ChatIssue issue) => switch (issue) {
      ChatIssue.messageEmpty => l10n.chatIssueMessageEmpty,
      ChatIssue.messageTooLong => l10n.chatIssueMessageTooLong(ChatRepository.maxMessageLength),
      ChatIssue.directNeedsOneParticipant => l10n.chatIssueDirectNeedsOneParticipant,
      ChatIssue.groupNeedsParticipants => l10n.chatIssueGroupNeedsParticipants,
      ChatIssue.titleTooLong => l10n.chatIssueTitleTooLong(ChatRepository.maxTitleLength),
      ChatIssue.searchQueryTooLong => l10n.chatIssueSearchQueryTooLong(ChatRepository.maxSearchLength),
      ChatIssue.malformedConversationList => l10n.chatIssueMalformedConversationList,
      ChatIssue.malformedMessageList => l10n.chatIssueMalformedMessageList,
      ChatIssue.malformedMessage => l10n.chatIssueMalformedMessage,
      ChatIssue.malformedConversation => l10n.chatIssueMalformedConversation,
      ChatIssue.malformedSearchResults => l10n.chatIssueMalformedSearchResults,
    };

/// Text for any error of a chat call: a local [ChatIssue], else the error table.
String chatErrorText(AppLocalizations l10n, Object error) => switch (error) {
      ChatException(issue: final ChatIssue issue) => chatIssueText(l10n, issue),
      _ => errorTextFor(l10n, error),
    };
