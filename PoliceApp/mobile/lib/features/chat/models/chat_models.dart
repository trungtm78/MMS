class Conversation {
  final String id;
  final String? title;
  final String conversationType;
  final String createdAt;
  final String? lastMessage;
  final String? lastMessageAt;

  const Conversation({
    required this.id,
    this.title,
    required this.conversationType,
    required this.createdAt,
    this.lastMessage,
    this.lastMessageAt,
  });

  factory Conversation.fromJson(Map<String, dynamic> json) => Conversation(
        id: json['id'] as String,
        title: json['title'] as String?,
        conversationType: json['conversationType'] as String? ?? 'direct',
        createdAt: json['createdAt'] as String? ?? '',
        lastMessage: json['lastMessage'] as String?,
        lastMessageAt: json['lastMessageAt'] as String?,
      );
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
