import '../../../shared/utils/json_number.dart';

/// The latest position of a militia member: one row of GET /gps/live, which answers a plain JSON
/// array, and the payload of the gateway's 'gps:update' event
/// (Web/backend/src/gps/gps.service.ts:27-62). The backend derives [status]: 'online' while the
/// last position is recent, 'offline' once it is older than GPS_OFFLINE_AFTER_MINUTES.
class GpsPosition {
  const GpsPosition({
    required this.militiaId,
    this.userId,
    required this.fullName,
    this.unitCode,
    this.lat,
    this.lng,
    this.accuracy,
    this.lastSeenAt,
    this.status = 'offline',
    Map<String, dynamic> raw = const {},
  }) : _raw = raw;

  /// militia_profiles.id
  final String militiaId;
  final String? userId;
  final String fullName;
  final String? unitCode;
  final double? lat;
  final double? lng;

  /// Metres
  final double? accuracy;
  final DateTime? lastSeenAt;
  final String status;

  /// The row as received, so an update can change only the fields it carries
  final Map<String, dynamic> _raw;

  bool get isOnline => status == 'online' || status == 'moving';

  bool get hasLocation => lat != null && lng != null;

  /// The member a row or update is about: militiaId, or its alias id
  static String? idOf(Map<dynamic, dynamic> json) {
    final id = json['militiaId'] ?? json['id'];
    return id == null ? null : '$id';
  }

  /// NUMERIC coordinates arrive as JSON numbers or numeric strings depending on the backend version
  factory GpsPosition.fromJson(Map<String, dynamic> json) {
    String? text(Object? value) => value is String && value.trim().isNotEmpty ? value : null;
    final lastSeen = json['lastSeenAt'] ?? json['lastUpdate'];
    return GpsPosition(
      militiaId: idOf(json) ?? '',
      userId: text(json['userId']),
      fullName: text(json['fullName']) ?? text(json['name']) ?? '',
      unitCode: text(json['unitCode']),
      lat: jsonNumber(json['lat'])?.toDouble(),
      lng: jsonNumber(json['lng'])?.toDouble(),
      accuracy: jsonNumber(json['accuracy'])?.toDouble(),
      lastSeenAt: lastSeen is String ? DateTime.tryParse(lastSeen) : null,
      status: text(json['status']) ?? 'offline',
      raw: Map<String, dynamic>.unmodifiable(json),
    );
  }

  /// This position with the fields of [update] applied
  GpsPosition mergedWith(Map<String, dynamic> update) => GpsPosition.fromJson({..._raw, ...update});

  /// The body of GET /gps/live; rows that are not objects or name no member are skipped
  static List<GpsPosition> listFromJson(Object? body) {
    if (body is! List) throw const FormatException('GET /gps/live did not return a list');
    return [
      for (final row in body.whereType<Map>())
        if (idOf(row) != null) GpsPosition.fromJson(Map<String, dynamic>.from(row)),
    ];
  }
}
