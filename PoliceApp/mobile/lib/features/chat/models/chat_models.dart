/// Someone in a conversation other than the caller, or a person found by the picker.
class ChatParticipant {
  final String id; // users.id
  final String fullName;
  final String? username;

  /// Extra line shown by the participant picker (militia code and unit, or username)
  final String? subtitle;

  const ChatParticipant({
    required this.id,
    required this.fullName,
    this.username,
    this.subtitle,
  });

  factory ChatParticipant.fromJson(Map<String, dynamic> json) => ChatParticipant(
        id: json['id'].toString(),
        fullName: json['fullName'] as String? ?? '',
        username: json['username'] as String?,
      );

  /// The full name, else the username, else the id
  String get displayName {
    if (fullName.trim().isNotEmpty) return fullName.trim();
    final user = username?.trim();
    return user != null && user.isNotEmpty ? user : id;
  }
}

/// One item of GET /chat/conversations, also the answer of POST /chat/conversations
/// (Web/backend/src/chat/chat.service.ts:77-121). Texts built from it: chat_labels.dart.
class Conversation {
  final String id;
  final String? title;
  final String conversationType;
  final String createdAt;
  final String? lastMessage;
  final String? lastMessageAt;

  /// Everyone in the conversation except the caller
  final List<ChatParticipant> participants;

  /// Messages from others since the caller last read the conversation
  final int unreadCount;

  const Conversation({
    required this.id,
    this.title,
    required this.conversationType,
    required this.createdAt,
    this.lastMessage,
    this.lastMessageAt,
    this.participants = const [],
    this.unreadCount = 0,
  });

  bool get isGroup => conversationType == 'group';

  factory Conversation.fromJson(Map<String, dynamic> json) {
    final rawParticipants = json['participants'];
    final rawUnread = json['unreadCount'];
    return Conversation(
      id: json['id'] as String,
      title: json['title'] as String?,
      conversationType: json['conversationType'] as String? ?? 'direct',
      createdAt: json['createdAt'] as String? ?? '',
      lastMessage: json['lastMessage'] as String?,
      lastMessageAt: json['lastMessageAt'] as String?,
      participants: rawParticipants is List
          ? rawParticipants
              .whereType<Map>()
              .where((p) => p['id'] != null)
              .map((p) => ChatParticipant.fromJson(Map<String, dynamic>.from(p)))
              .toList()
          : const [],
      unreadCount: rawUnread is num ? rawUnread.toInt() : int.tryParse('$rawUnread') ?? 0,
    );
  }
}

class ChatMessage {
  final String? id;
  final String senderId;
  final String? senderName;
  final String? conversationId;
  final String content;
  final String createdAt;

  const ChatMessage({
    this.id,
    required this.senderId,
    this.senderName,
    this.conversationId,
    required this.content,
    required this.createdAt,
  });

  factory ChatMessage.fromJson(Map<String, dynamic> json) => ChatMessage(
        id: json['id'] as String?,
        senderId: json['senderId'] as String? ?? '',
        senderName: json['senderName'] as String?,
        conversationId: json['conversationId'] as String?,
        content: json['content'] as String? ?? '',
        createdAt: json['createdAt'] as String? ?? '',
      );
}
