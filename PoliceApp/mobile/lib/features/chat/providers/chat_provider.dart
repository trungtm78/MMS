import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/api_constants.dart';
import '../../../features/auth/providers/auth_provider.dart';
import '../../../shared/errors/app_failure.dart';
import '../models/chat_models.dart';

// GET /chat/conversations returns a bare array (Web/backend/src/chat/chat.service.ts:73-121)
final conversationsProvider = FutureProvider<List<Conversation>>((ref) async {
  final dio = ref.read(dioProvider);
  final res = await dio.get(ApiConstants.conversations);
  final list = res.data as List;
  return list.map((e) => Conversation.fromJson(e as Map<String, dynamic>)).toList();
});

// GET /chat/conversations/:id/messages → {data (newest first), total, page, limit}
final chatMessagesProvider =
    FutureProvider.family<List<ChatMessage>, String>((ref, convId) async {
  final url = ApiConstants.conversationMessages.replaceAll('{id}', convId);
  final dio = ref.read(dioProvider);
  final res = await dio.get(url, queryParameters: {'page': 1, 'limit': 50});
  final data = res.data['data'] as List;
  return data
      .map((e) => ChatMessage.fromJson(e as Map<String, dynamic>))
      .toList()
      .reversed
      .toList();
});

/// A chat call that failed; the UI shows [failure] through lib/l10n/failure_texts.dart.
class ChatException implements Exception {
  const ChatException(this.failure);

  final AppFailure failure;

  int? get statusCode => failure.status;

  @override
  String toString() => 'ChatException($failure)';
}

/// Sends messages over REST: POST /chat/conversations/:id/messages {content}
/// (Web/backend/src/notifications/chat-messages.controller.ts). The backend stores the
/// message and broadcasts it as 'chat:message', so the socket is only used for receiving.
class ChatApi {
  ChatApi(this._dio);

  final Dio _dio;

  /// ChatService.MAX_MESSAGE_LENGTH (Web/backend/src/chat/chat.service.ts:23),
  /// counted like JavaScript String.length on the trimmed text.
  static const maxMessageLength = 4000;

  /// Why [content] cannot be sent (the backend's own codes), or null when it can.
  static AppFailure? validate(String content) {
    final text = content.trim();
    if (text.isEmpty) return const AppFailure('message_content_required');
    if (text.length > maxMessageLength) return const AppFailure('message_too_long');
    return null;
  }

  Future<ChatMessage> sendMessage(String conversationId, String content) async {
    final invalid = validate(content);
    if (invalid != null) throw ChatException(invalid);
    try {
      final res = await _dio.post(
        ApiConstants.conversationMessages.replaceAll('{id}', conversationId),
        data: {'content': content.trim()},
      );
      final data = res.data;
      if (data is! Map) throw const ChatException(AppFailure(AppFailure.badResponse));
      return ChatMessage.fromJson(Map<String, dynamic>.from(data));
    } on DioException catch (e) {
      throw ChatException(AppFailure.from(e));
    }
  }

  /// POST /chat/conversations/:id/read — clears the caller's unread count
  Future<void> markRead(String conversationId) async {
    try {
      await _dio.post(ApiConstants.conversationRead.replaceAll('{id}', conversationId));
    } on DioException catch (e) {
      throw ChatException(AppFailure.from(e));
    }
  }

  /// CreateConversationDto.title @MaxLength(255) (Web/backend/src/chat/chat.controller.ts)
  static const maxTitleLength = 255;

  /// POST /chat/conversations {participantIds, conversationType, title?}. A direct chat has
  /// exactly one other participant; a group has one or more and an optional title. Answers 201
  /// with a new conversation or 200 with the pair's existing direct chat, shaped like a list item.
  Future<Conversation> createConversation({
    required List<String> participantIds,
    required bool group,
    String? title,
  }) async {
    final ids = participantIds.toSet().toList();
    if (!group && ids.length != 1) {
      throw const ChatException(AppFailure(AppFailure.directRequiresOne));
    }
    if (group && ids.isEmpty) {
      throw const ChatException(AppFailure(AppFailure.groupRequiresParticipant));
    }
    final groupTitle = group ? (title?.trim() ?? '') : '';
    if (groupTitle.length > maxTitleLength) {
      throw const ChatException(AppFailure(AppFailure.titleTooLong, args: {'max': maxTitleLength}));
    }
    try {
      final res = await _dio.post(ApiConstants.conversations, data: {
        'participantIds': ids,
        'conversationType': group ? 'group' : 'direct',
        if (groupTitle.isNotEmpty) 'title': groupTitle,
      });
      final data = res.data;
      if (data is! Map) throw const ChatException(AppFailure(AppFailure.badResponse));
      return Conversation.fromJson(Map<String, dynamic>.from(data));
    } on DioException catch (e) {
      throw ChatException(AppFailure.from(e));
    }
  }

  static const minSearchLength = 2;

  /// GET /users/search takes 2-100 characters (users.controller.ts SearchQueryDto, T20)
  static const maxSearchLength = 100;

  /// People the officer can start a chat with: the DQTV in their scope
  /// (GET /militia/search, only rows linked to an account) and users (GET /users/search).
  /// One source failing still returns the other.
  Future<List<ChatParticipant>> searchParticipants(String query, {String? excludeUserId}) async {
    var q = query.trim();
    if (q.length < minSearchLength) return const [];
    if (q.length > maxSearchLength) q = q.substring(0, maxSearchLength);
    final params = {'q': q, 'limit': 20};

    Object? firstError;
    Future<List<ChatParticipant>?> attempt(Future<List<ChatParticipant>> Function() load) async {
      try {
        return await load();
      } catch (e) {
        firstError ??= e;
        return null;
      }
    }

    final results = await Future.wait([
      attempt(() => _searchMilitia(params)),
      attempt(() => _searchUsers(params)),
    ]);
    if (results.every((r) => r == null)) {
      final error = firstError;
      throw ChatException(
        error is DioException ? AppFailure.from(error) : const AppFailure(AppFailure.participantSearchFailed),
      );
    }

    final seen = <String>{if (excludeUserId != null) excludeUserId};
    return [
      for (final list in results)
        for (final person in list ?? const <ChatParticipant>[])
          if (seen.add(person.id)) person,
    ];
  }

  Future<List<ChatParticipant>> _searchMilitia(Map<String, Object> params) async {
    final res = await _dio.get(ApiConstants.militiaPicker, queryParameters: params);
    final body = res.data;
    if (body is! List) throw const FormatException('GET /militia/search did not return a list');
    return [
      for (final row in body.whereType<Map>())
        if (row['userId'] != null)
          ChatParticipant(
            id: row['userId'].toString(),
            fullName: row['fullName'] as String? ?? '',
            subtitle: [row['militiaCode'], row['unitName']]
                .whereType<String>()
                .where((s) => s.trim().isNotEmpty)
                .join(' — '),
          ),
    ];
  }

  Future<List<ChatParticipant>> _searchUsers(Map<String, Object> params) async {
    final res = await _dio.get(ApiConstants.usersSearch, queryParameters: params);
    final body = res.data;
    if (body is! List) throw const FormatException('GET /users/search did not return a list');
    return [
      for (final row in body.whereType<Map>())
        if (row['id'] != null)
          ChatParticipant(
            id: row['id'].toString(),
            fullName: row['fullName'] as String? ?? '',
            username: row['username'] as String?,
            subtitle: row['username'] as String?,
          ),
    ];
  }
}

final chatApiProvider = Provider<ChatApi>((ref) => ChatApi(ref.watch(dioProvider)));

/// Why a socket acknowledgement (e.g. 'chat:join') refused, or null when it did not
/// (Web/backend/src/notifications/notifications.gateway.ts). Codes without a text fall back to
/// "could not join the conversation (code)".
AppFailure? chatAckError(dynamic ack) {
  final payload = ack is List && ack.isNotEmpty ? ack.first : ack;
  if (payload is! Map) return null;
  final error = payload['error'];
  if (error == null) return null;
  return AppFailure('$error', fallback: AppFailure.chatJoinFailed, args: {'code': '$error'});
}

/// Appends [incoming] unless a message with the same id is already shown.
List<ChatMessage> mergeChatMessage(List<ChatMessage> current, ChatMessage incoming) {
  final id = incoming.id;
  if (id != null && current.any((m) => m.id == id)) return current;
  return [...current, incoming];
}
