/// One notification receipt as returned by GET /notifications
/// (Web/backend/src/notifications/notifications.controller.ts:73-86).
class AppNotification {
  final String id;
  final String type;
  final String title;
  final String body;
  final String? entityType;
  final String? entityId;
  final bool isRead;
  final DateTime? readAt;
  final DateTime? createdAt;

  const AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    this.entityType,
    this.entityId,
    required this.isRead,
    this.readAt,
    this.createdAt,
  });

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    final id = json['id'];
    // Not shown to users: AppFailure.from turns it into AppFailure.badResponse
    if (id == null) throw const FormatException('notification without id');
    final readAt = _parseDate(json['readAt']);
    return AppNotification(
      id: id.toString(),
      type: json['type'] as String? ?? '',
      title: json['title'] as String? ?? '',
      body: json['body'] as String? ?? '',
      entityType: json['entityType'] as String?,
      entityId: json['entityId']?.toString(),
      isRead: json['isRead'] == true || readAt != null,
      readAt: readAt,
      createdAt: _parseDate(json['createdAt']),
    );
  }

  /// Copy marked as read; an existing readAt is kept, as the backend does (COALESCE).
  AppNotification markedRead([DateTime? at]) => AppNotification(
        id: id,
        type: type,
        title: title,
        body: body,
        entityType: entityType,
        entityId: entityId,
        isRead: true,
        readAt: readAt ?? at ?? DateTime.now(),
        createdAt: createdAt,
      );
}

/// The {data, total, page, limit} envelope of GET /notifications.
class NotificationPage {
  final List<AppNotification> items;
  final int total;
  final int page;
  final int limit;

  const NotificationPage({
    required this.items,
    required this.total,
    required this.page,
    required this.limit,
  });

  factory NotificationPage.fromJson(Object? body) {
    if (body is! Map || body['data'] is! List) {
      throw const FormatException('GET /notifications: expected {data: [...]}');
    }
    final items = (body['data'] as List)
        .whereType<Map>()
        .map((e) => AppNotification.fromJson(Map<String, dynamic>.from(e)))
        .toList();
    return NotificationPage(
      items: items,
      total: _asInt(body['total'], items.length),
      page: _asInt(body['page'], 1),
      limit: _asInt(body['limit'], items.length),
    );
  }

  bool get hasMore => page * limit < total;
}

DateTime? _parseDate(Object? value) => value is String ? DateTime.tryParse(value) : null;

int _asInt(Object? value, int fallback) =>
    value is num ? value.toInt() : int.tryParse('$value') ?? fallback;
