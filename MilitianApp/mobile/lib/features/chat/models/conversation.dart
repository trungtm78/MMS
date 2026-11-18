/// Someone in a conversation other than the caller.
class ChatParticipant {
  final String id;
  final String fullName;
  final String username;

  const ChatParticipant({required this.id, this.fullName = '', this.username = ''});

  /// A participant row, or null when it has no id.
  static ChatParticipant? tryParse(Object? json) {
    if (json is! Map || json['id'] == null) return null;
    final fullName = json['fullName'];
    final username = json['username'];
    return ChatParticipant(
      id: json['id'].toString(),
      fullName: fullName is String ? fullName : '',
      username: username is String ? username : '',
    );
  }

  /// Full name, or the username when the name is blank.
  String get displayName {
    final name = fullName.trim();
    return name.isNotEmpty ? name : username.trim();
  }
}

/// One conversation as GET /chat/conversations lists it and POST /chat/conversations answers it
/// (Web/backend/src/chat/chat.service.ts conversationSummaries):
/// {id, title, conversationType, createdAt, lastMessage, lastMessageAt, participants, unreadCount}.
/// `title` is conversations.name, null for untitled conversations; `participants` is everyone
/// except the caller; `unreadCount` counts messages from others since the caller last read.
/// The shown title is worded by conversationTitle (lib/features/chat/chat_texts.dart).
class Conversation {
  final String id;
  final String? title;
  final String conversationType; // direct | group
  final DateTime? createdAt;
  final String? lastMessage;
  final DateTime? lastMessageAt;
  final List<ChatParticipant> participants;
  final int unreadCount;

  const Conversation({
    required this.id,
    this.title,
    required this.conversationType,
    this.createdAt,
    this.lastMessage,
    this.lastMessageAt,
    this.participants = const [],
    this.unreadCount = 0,
  });

  factory Conversation.fromJson(Map<String, dynamic> json) {
    final rawParticipants = json['participants'];
    return Conversation(
      id: json['id'].toString(),
      title: json['title'] is String ? json['title'] as String : null,
      conversationType: json['conversationType'] as String? ?? 'direct',
      createdAt: _parseDate(json['createdAt']),
      lastMessage: json['lastMessage'] is String ? json['lastMessage'] as String : null,
      lastMessageAt: _parseDate(json['lastMessageAt']),
      participants: rawParticipants is List
          ? rawParticipants.map(ChatParticipant.tryParse).whereType<ChatParticipant>().toList()
          : const [],
      unreadCount: _parseCount(json['unreadCount']),
    );
  }

  bool get isGroup => conversationType == 'group';

  /// The title the conversation was given, trimmed, or null when it has none.
  String? get ownTitle {
    final t = title?.trim();
    return t == null || t.isEmpty ? null : t;
  }

  /// The names of the other participants that have one, in the server's order.
  List<String> get participantNames =>
      [for (final p in participants) if (p.displayName.isNotEmpty) p.displayName];
}

DateTime? _parseDate(Object? value) => value is String ? DateTime.tryParse(value) : null;

int _parseCount(Object? value) {
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value.trim()) ?? 0;
  return 0;
}
