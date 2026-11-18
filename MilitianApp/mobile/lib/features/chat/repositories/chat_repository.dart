import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/api_constants.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/utils/api_failure.dart';
import '../../auth/providers/auth_provider.dart';
import '../models/conversation.dart';

/// Why a chat call was refused before or after reaching the server, other than an API error.
/// Worded by chatIssueText (lib/features/chat/chat_texts.dart).
enum ChatIssue {
  /// A message with no text
  messageEmpty,

  /// A message over [ChatRepository.maxMessageLength]
  messageTooLong,

  /// A direct chat needs exactly one other person
  directNeedsOneParticipant,

  /// A group needs at least one other person
  groupNeedsParticipants,

  /// A group title over [ChatRepository.maxTitleLength]
  titleTooLong,

  /// A people search over [ChatRepository.maxSearchLength]
  searchQueryTooLong,

  /// GET /chat/conversations did not answer an array
  malformedConversationList,

  /// GET /chat/conversations/:id/messages did not answer {data: [...]}
  malformedMessageList,

  /// POST /chat/conversations/:id/messages did not answer the stored message
  malformedMessage,

  /// POST /chat/conversations did not answer a conversation with an id
  malformedConversation,

  /// GET /users/search did not answer an array
  malformedSearchResults,
}

/// A chat call that failed: [issue] for a local check or an unreadable answer, [failure] for a
/// failed API call (worded by errorTextFor, lib/l10n/error_texts.dart).
class ChatException implements Exception, HasApiFailure {
  const ChatException(ChatIssue this.issue) : failure = null;

  ChatException.api(ApiFailure this.failure) : issue = null;

  final ChatIssue? issue;

  @override
  final ApiFailure? failure;

  int? get statusCode => failure?.status;

  @override
  String toString() => 'ChatException(${issue?.name ?? failure})';
}

/// REST client for Web/backend/src/chat/chat.controller.ts,
/// Web/backend/src/notifications/chat-messages.controller.ts and GET /users/search.
class ChatRepository {
  ChatRepository(this._dio);

  final Dio _dio;

  /// ChatService.MAX_MESSAGE_LENGTH (Web/backend/src/chat/chat.service.ts)
  static const maxMessageLength = 4000;

  /// CreateConversationDto.title @MaxLength(255) (Web/backend/src/chat/chat.controller.ts)
  static const maxTitleLength = 255;

  /// USER_SEARCH_MIN_LENGTH / USER_SEARCH_MAX_LENGTH (Web/backend/src/users/users.service.ts): the
  /// trimmed query, in characters
  static const minSearchLength = 2;
  static const maxSearchLength = 100;

  /// Rows asked of GET /users/search (USER_SEARCH_MAX_LIMIT is 50)
  static const searchLimit = 20;

  /// Why [content] cannot be sent, or null when it can.
  static ChatIssue? validate(String content) {
    final text = content.trim();
    if (text.isEmpty) return ChatIssue.messageEmpty;
    // Characters as the server counts them (code points)
    if (text.runes.length > maxMessageLength) return ChatIssue.messageTooLong;
    return null;
  }

  /// GET /chat/conversations → a bare array (no envelope)
  Future<List<Conversation>> conversations() async {
    final Object? body;
    try {
      body = (await _dio.get(ApiConstants.conversations)).data;
    } on DioException catch (e) {
      throw ChatException.api(ApiFailure.from(e));
    }
    if (body is! List) throw const ChatException(ChatIssue.malformedConversationList);
    return body
        .whereType<Map>()
        .where((c) => c['id'] != null)
        .map((c) => Conversation.fromJson(Map<String, dynamic>.from(c)))
        .toList();
  }

  /// GET /chat/conversations/:id/messages → {data, total, page, limit}, returned oldest first
  Future<List<Map<String, dynamic>>> messages(String conversationId, {int page = 1, int limit = 50}) async {
    final Object? body;
    try {
      body = (await _dio.get(
        ApiConstants.messages.replaceFirst('{id}', conversationId),
        queryParameters: {'page': page, 'limit': limit},
      ))
          .data;
    } on DioException catch (e) {
      throw ChatException.api(ApiFailure.from(e));
    }
    if (body is! Map || body['data'] is! List) throw const ChatException(ChatIssue.malformedMessageList);
    // The backend orders by sent_at DESC
    return (body['data'] as List)
        .whereType<Map>()
        .map((m) => Map<String, dynamic>.from(m))
        .toList()
        .reversed
        .toList();
  }

  /// POST /chat/conversations/:id/messages {content} → the stored message.
  /// The backend also broadcasts it to the room as 'chat:message'.
  Future<Map<String, dynamic>> sendMessage(String conversationId, String content) async {
    final invalid = validate(content);
    if (invalid != null) throw ChatException(invalid);
    final Object? data;
    try {
      data = (await _dio.post(
        ApiConstants.sendMessage.replaceFirst('{id}', conversationId),
        data: {'content': content.trim()},
      ))
          .data;
    } on DioException catch (e) {
      throw ChatException.api(ApiFailure.from(e));
    }
    if (data is! Map) throw const ChatException(ChatIssue.malformedMessage);
    return Map<String, dynamic>.from(data);
  }

  /// POST /chat/conversations/:id/read → {conversationId, readAt}; the backend also tells
  /// the other participants with 'chat:read' (notifications/chat-messages.controller.ts).
  Future<void> markRead(String conversationId) async {
    try {
      await _dio.post(ApiConstants.conversationRead.replaceFirst('{id}', conversationId));
    } on DioException catch (e) {
      throw ChatException.api(ApiFailure.from(e));
    }
  }

  /// POST /chat/conversations {participantIds, conversationType, title?} → the conversation as the
  /// list shows it: 201 when it was created, 200 when the pair already had a direct conversation,
  /// which is returned instead (chat.controller.ts createConversation). Either way the answer,
  /// participants included, is the conversation to open. A direct chat has exactly one other
  /// participant; a group has one or more and an optional title.
  Future<Conversation> createConversation({
    required List<String> participantIds,
    required bool group,
    String? title,
  }) async {
    final ids = participantIds.toSet().toList();
    if (!group && ids.length != 1) throw const ChatException(ChatIssue.directNeedsOneParticipant);
    if (group && ids.isEmpty) throw const ChatException(ChatIssue.groupNeedsParticipants);
    final groupTitle = group ? (title?.trim() ?? '') : '';
    if (groupTitle.runes.length > maxTitleLength) throw const ChatException(ChatIssue.titleTooLong);
    final Object? data;
    try {
      data = (await _dio.post(ApiConstants.conversations, data: {
        'participantIds': ids,
        'conversationType': group ? 'group' : 'direct',
        if (groupTitle.isNotEmpty) 'title': groupTitle,
      }))
          .data;
    } on DioException catch (e) {
      throw ChatException.api(ApiFailure.from(e));
    }
    if (data is! Map || data['id'] == null) throw const ChatException(ChatIssue.malformedConversation);
    return Conversation.fromJson(Map<String, dynamic>.from(data));
  }

  /// People to start a chat with: GET /users/search?q=&limit= → [{id, username, fullName, role, roles,
  /// status}] (users.controller.ts, users.service.ts searchUsers): active people the caller may
  /// reach, one row per person, never the caller. Queries under [minSearchLength] characters are not
  /// sent; over [maxSearchLength] they are refused. Rows are still merged by id and [excludeUserId]
  /// left out, as a guard that costs nothing. GET /militia/search is not used: it is for staff roles
  /// only (militia.controller.ts, MILITIA_STAFF_ROLES).
  Future<List<ChatParticipant>> searchParticipants(String query, {String? excludeUserId}) async {
    final q = query.trim();
    final length = q.runes.length;
    if (length < minSearchLength) return const [];
    if (length > maxSearchLength) throw const ChatException(ChatIssue.searchQueryTooLong);
    final Object? body;
    try {
      body = (await _dio.get(
        ApiConstants.usersSearch,
        queryParameters: {'q': q, 'limit': searchLimit},
      ))
          .data;
    } on DioException catch (e) {
      throw ChatException.api(ApiFailure.from(e));
    }
    if (body is! List) throw const ChatException(ChatIssue.malformedSearchResults);
    final seen = <String>{if (excludeUserId != null && excludeUserId.isNotEmpty) excludeUserId};
    return [
      for (final person in body.map(ChatParticipant.tryParse).whereType<ChatParticipant>())
        if (seen.add(person.id)) person,
    ];
  }
}

final chatRepositoryProvider = Provider<ChatRepository>((ref) {
  return ChatRepository(DioClient.getInstance(ref.watch(secureStorageProvider)));
});

/// Appends [incoming] unless a message with the same id is already shown.
List<Map<String, dynamic>> mergeMessage(
  List<Map<String, dynamic>> current,
  Map<String, dynamic> incoming,
) {
  final id = incoming['id'];
  if (id != null && current.any((m) => m['id'] == id)) return current;
  return [...current, incoming];
}

/// [conversation] listed once in [current]: in place of the entry with its id, or first when it is
/// not listed yet (POST /chat/conversations answers an existing direct conversation with 200).
List<Conversation> upsertConversation(List<Conversation> current, Conversation conversation) =>
    current.any((c) => c.id == conversation.id)
        ? [for (final c in current) c.id == conversation.id ? conversation : c]
        : [conversation, ...current];

/// The refusal code of a 'chat:join' / 'chat:send' acknowledgement, or null on success
/// (Web/backend/src/notifications/notifications.gateway.ts). The screen words it with
/// errorText(l10n, code, flow: ErrorFlow.chatAck).
String? chatAckError(dynamic ack) {
  final payload = ack is List && ack.isNotEmpty ? ack.first : ack;
  if (payload is! Map) return null;
  final error = payload['error'];
  return error == null ? null : '$error';
}
